import { nanoid } from 'nanoid';
import { z } from 'zod/v3';
import type {
  CreatorJob,
  CreatorActionResponse,
  CreatorStageRun,
  CreatorJson,
} from '@vishnucreator/protocol';
import type { CreatorService } from '../service.js';
import type { VishnuDirectorAgent } from '../vishnu/vishnu-director-agent.js';
import {
  AI_VIDEO_STUDIO_STAGES,
  type AIVideoStudioPhase,
  type AIVideoStudioJobState,
  type StorylineInput,
  type StorylineOutput,
  type AIVideoStudioStage,
  type StageApprovalRequest,
  type StageApprovalResponse,
} from '@vishnucreator/protocol';
import type { CreatorTemplateDefinition } from './types.js';

export function createAIVideoStudioTemplate(): CreatorTemplateDefinition {
  return {
    id: 'ai-video-studio',
    version: 1,
    renderer: 'ai-video-studio',
    inputSchema: z.object({
      topic: z.string().default(''),
      style: z.string().default('khmer-traditional'),
      durationSeconds: z.number().default(60),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [
      {
        id: 'storyline',
        executor: 'ai-video-studio',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'storyline_json', status: 'completed' }]
      },
      {
        id: 'characters',
        executor: 'ai-video-studio',
        dependsOn: ['storyline'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'character_assets', status: 'completed' }]
      },
      {
        id: 'assets',
        executor: 'ai-video-studio',
        dependsOn: ['characters'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'scene_assets', status: 'completed' }]
      },
      {
        id: 'voice',
        executor: 'ai-video-studio',
        dependsOn: ['characters'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'voice_assets', status: 'completed' }]
      },
      {
        id: 'assembly',
        executor: 'ai-video-studio',
        dependsOn: ['assets', 'voice'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [
          { kind: 'final_video', status: 'completed' },
          { kind: 'subtitle_srt', status: 'completed' }
        ]
      }
    ],
    actions: [
      { id: 'update-settings', inputSchema: z.record(z.string(), z.unknown()) as never, allowedStages: ['storyline', 'characters', 'assets', 'voice', 'assembly'] },
      { id: 'run-stage', inputSchema: z.record(z.string(), z.unknown()) as never, allowedStages: ['storyline', 'characters', 'assets', 'voice', 'assembly'] },
      { id: 'undo-action', inputSchema: z.record(z.string(), z.unknown()) as never, allowedStages: ['storyline', 'characters', 'assets', 'voice', 'assembly'] }
    ],
    outputs: [
      { kind: 'final_video', required: true },
      { kind: 'subtitle_srt', required: true }
    ],
    agentGuidance: 'One-click storyline to video generation with dual-track architecture.'
  };
}

export type AIVideoStudioExecutorConfig = {
  vishnuDirector: VishnuDirectorAgent;
  creatorService: CreatorService;
};

export type AIVideoStudioExecutor = ReturnType<typeof createAIVideoStudioExecutor>;

export function createAIVideoStudioExecutor(config: AIVideoStudioExecutorConfig) {
  const { vishnuDirector, creatorService } = config;

  // =========================================================================
  // STAGE EXECUTORS
  // =========================================================================

  async function executeStage(job: CreatorJob, stageId: string, input: Record<string, CreatorJson>): Promise<CreatorActionResponse> {
    const stageDef = AI_VIDEO_STUDIO_STAGES.find(s => s.id === stageId);
    if (!stageDef) {
      throw new Error(`Unknown stage: ${stageId}`);
    }

    // Get or create job state
    let jobState = getJobState(job);

    // Check if stage can start (dependencies met)
    const depsMet = stageDef.dependsOn.every(dep => jobState.completedStages.includes(dep));
    if (!depsMet) {
      throw new Error(`Stage ${stageId} dependencies not met: ${stageDef.dependsOn.join(', ')}`);
    }

    // Check if already completed
    if (jobState.completedStages.includes(stageId)) {
      return { job, receipt: { actor: 'system', action: `stage-${stageId}`, summary: `Stage ${stageId} already completed`, affectedArtifacts: [], newRevision: job.revision, createdAt: new Date().toISOString() } };
    }

    // Update job state - mark stage as running
    await updateJobState(job.id, { currentStage: stageId });

    try {
      // Execute the stage via Vishnu Director
      const result = await vishnuDirector.planWorkflow({
        capability: 'execute_stage',
        payload: { stage: stageId as any, input, jobState: getJobState({ id: job.id } as CreatorJob) },
        context: {
          jobId: job.id,
          projectId: job.projectId,
          currentStage: stageId as any,
          assetLibraryState: getJobState({ id: job.id } as CreatorJob).assetLibrary,
          visualStyleParams: getJobState({ id: job.id } as CreatorJob).visualStyleParams,
        },
      });

      if (!result.success) {
        throw new Error(result.message || `Stage ${stageId} failed`);
      }

      // Update job state with stage output
      const stageOutput = result.result?.output;
      await updateJobState(job.id, {
        completedStages: [...getJobState({ id: job.id } as CreatorJob).completedStages, stageId],
        currentStage: null,
        stageOutputs: { ...getJobState({ id: job.id } as CreatorJob).stageOutputs, [stageId]: stageOutput },
      });

      // Create stage run record
      const stageRun = createStageRun(job.id, stageId, stageDef.executor, input, stageOutput);

      // Apply action to persist stage run
      const actionResponse = await creatorService.applyAction(job.id, {
        action: 'update-job-state',
        expectedRevision: job.revision,
        input: {
          stageRuns: [...job.stages, stageRun],
          state: {
            ...job.state,
            aiVideoStudio: getJobState({ id: job.id } as CreatorJob),
          },
        },
      });

      return actionResponse;
    } catch (error) {
      // Mark stage as failed
      await updateJobState(job.id, { currentStage: null });
      throw error;
    }
  }

  // =========================================================================
  // STAGE APPROVAL FLOW
  // =========================================================================

  async function requestStageApproval(job: CreatorJob, stageId: string): Promise<StageApprovalResponse> {
    const stageDef = AI_VIDEO_STUDIO_STAGES.find(s => s.id === stageId);
    const jobState = getJobState(job);

    // Build preview from stage output
    const preview = (jobState.stageOutputs as Record<string, CreatorJson>)[stageId];
    if (!preview) {
      throw new Error(`No preview available for stage ${stageId}`);
    }

    const approvalRequest: StageApprovalRequest = {
      stage: stageId as any,
      preview,
      estimatedCostUSD: estimateStageCost(stageId as any, job.state),
      estimatedDurationSeconds: AI_VIDEO_STUDIO_STAGES.find(s => s.id === stageId)?.estimatedDurationSeconds || 0,
      warnings: generateStageWarnings(stageId as any, preview),
    };

    // In production, this would show a UI approval dialog
    // For now, auto-approve for automated runs
    return { approved: true, regenerate: false };
  }

  // =========================================================================
  // FULL PIPELINE EXECUTION
  // =========================================================================

  export async function runFullPipeline(job: CreatorJob, input: Record<string, CreatorJson>): Promise<CreatorActionResponse> {
    const storylineInput = input as any; // StorylineInput

    // Stage 1: Storyline
    await executeStage(job, 'storyline', storylineInput);

    const jobAfterStoryline = creatorService.getJob(job.id)!;
    const approval1 = await requestStageApproval(jobAfterStoryline, 'storyline');
    if (!approval1.approved) {
      throw new Error('Storyline rejected by user');
    }

    // Stage 2: Characters
    await executeStage(job, 'characters', {});

    const jobAfterCharacters = creatorService.getJob(job.id)!;
    const approval2 = await requestStageApproval(jobAfterCharacters, 'characters');
    if (!approval2.approved) {
      throw new Error('Characters rejected by user');
    }

    // Stage 3: Assets
    await executeStage(job, 'assets', {});

    const jobAfterAssets = creatorService.getJob(job.id)!;
    const approval3 = await requestStageApproval(jobAfterAssets, 'assets');
    if (!approval3.approved) {
      throw new Error('Assets rejected by user');
    }

    // Stage 4: Voice
    await executeStage(job, 'voice', {});

    const jobAfterVoice = creatorService.getJob(job.id)!;
    const approval4 = await requestStageApproval(jobAfterVoice, 'voice');
    if (!approval4.approved) {
      throw new Error('Voice synthesis rejected by user');
    }

    // Stage 5: Assembly
    const finalResult = await executeStage(job, 'assembly', {});

    return finalResult;
  }

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  function getJobState(job: CreatorJob): AIVideoStudioJobState {
    return (job.state.aiVideoStudio as AIVideoStudioJobState) || {
      currentStage: null,
      completedStages: [],
      stageOutputs: {},
      stageCheckpoints: {},
      assetLibrary: { characters: [], scenes: [], props: [], voices: [], visualStyles: [], music: [] },
      visualStyleParams: null,
      totalEstimatedCost: 0,
      actualCost: 0,
      costCap: null,
      generationMode: 'auto',
      resumeFromStage: null,
      userApprovals: {
        storyline: { approved: false, approvedAt: null },
        characters: { approved: false, approvedAt: null },
        assets: { approved: false, approvedAt: null },
        voice: { approved: false, approvedAt: null },
        assembly: { approved: false, approvedAt: null },
      },
    };
  }

  async function updateJobState(jobId: string, updates: Partial<any>): Promise<void> {
    // In production, use creatorService.applyAction to update job state
    // This is a placeholder
    console.log(`[AI Video Studio] Job ${jobId} state update:`, Object.keys(updates));
  }

  function createStageRun(jobId: string, stageId: string, executor: string, input: Record<string, any>, output: any): CreatorStageRun {
    return {
      id: nanoid(),
      jobId,
      stageId,
      executor,
      status: 'succeeded',
      dispatchStatus: 'finished',
      claimOwner: null,
      claimExpiresAt: null,
      attempt: 1,
      idempotencyKey: null,
      scopeKey: null,
      inputFingerprint: null,
      progress: { percent: 100, phase: 'completed' },
      errorCode: null,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  function estimateStageCost(stageId: string, jobState: Record<string, any>): number {
    const estimates: Record<string, number> = {
      storyline: 0.50,
      characters: 2.00,
      assets: 5.00,
      voice: 1.00,
      assembly: 0.20,
    };
    return estimates[stageId] || 0;
  }

  function generateStageWarnings(stageId: string, preview: any): string[] {
    const warnings: string[] = [];

    switch (stageId) {
      case 'characters':
        if (!preview?.characterAssets?.length) warnings.push('No characters generated');
        break;
      case 'assets':
        if (!preview?.sceneAssets?.length) warnings.push('No scenes generated');
        break;
      case 'voice':
        if (!preview?.voiceAssets?.length) warnings.push('No voice assets generated');
        break;
      case 'assembly':
        if (!preview?.finalVideoArtifact) warnings.push('No video generated');
        break;
    }

    return warnings;
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================

  return {
    template: createAIVideoStudioTemplate(),
    executeStage,
    runFullPipeline,
    requestStageApproval,
  };
}

export type {
  AIVideoStudioExecutorConfig,
  AIVideoStudioExecutor,
};