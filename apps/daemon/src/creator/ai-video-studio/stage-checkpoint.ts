import * as fs from 'node:fs';
import * as path from 'node:path';
import { nanoid } from 'nanoid';
import type { AIVideoStudioPhase, CreatorJson } from '@vishnucreator/protocol';

/**
 * Stage Checkpoint System
 * Inspired by DramaClaw's Task Center checkpoint/resume architecture.
 * Enables the 5-stage pipeline to save progress, recover from failure, or resume midway.
 */

export const AI_VIDEO_STUDIO_PHASE_ORDER: AIVideoStudioPhase[] = [
  'storyline',
  'characters',
  'assets',
  'voice',
  'assembly',
];

export interface CheckpointData {
  id: string;
  jobId: string;
  stage: AIVideoStudioPhase;
  data: CreatorJson;
  savedAt: string;
  jobStateSnapshot: CreatorJson;
  version: number;
}

export interface StageCheckpointManagerOptions {
  checkpointDir?: string;
}

export type StageCheckpointManager = ReturnType<typeof createStageCheckpointManager>;

export function createStageCheckpointManager(options: StageCheckpointManagerOptions = {}) {
  const checkpoints = new Map<string, Map<AIVideoStudioPhase, CheckpointData>>();
  const checkpointDir = options.checkpointDir;

  function getJobDir(jobId: string): string | null {
    return checkpointDir ? path.join(checkpointDir, jobId) : null;
  }

  function persistToDisk(jobId: string, stage: AIVideoStudioPhase, checkpoint: CheckpointData): void {
    const jobDir = getJobDir(jobId);
    if (!jobDir) return;
    try {
      fs.mkdirSync(jobDir, { recursive: true });
      fs.writeFileSync(path.join(jobDir, `${stage}.json`), JSON.stringify(checkpoint, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[StageCheckpoint] Failed to persist checkpoint for ${jobId}/${stage}:`, err);
    }
  }

  function loadFromDisk(jobId: string, stage: AIVideoStudioPhase): CheckpointData | null {
    const jobDir = getJobDir(jobId);
    if (!jobDir) return null;
    try {
      const filePath = path.join(jobDir, `${stage}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as CheckpointData;
      }
    } catch (err) {
      console.warn(`[StageCheckpoint] Failed to load checkpoint for ${jobId}/${stage}:`, err);
    }
    return null;
  }

  function removeDiskCheckpoint(jobId: string, stage: AIVideoStudioPhase): void {
    const jobDir = getJobDir(jobId);
    if (!jobDir) return;
    try {
      const filePath = path.join(jobDir, `${stage}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`[StageCheckpoint] Failed to delete disk checkpoint for ${jobId}/${stage}:`, err);
    }
  }

  function clearDiskCheckpoints(jobId: string): void {
    const jobDir = getJobDir(jobId);
    if (!jobDir) return;
    try {
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[StageCheckpoint] Failed to clear disk checkpoints for ${jobId}:`, err);
    }
  }

  // =========================================================================
  // CHECKPOINT OPERATIONS
  // =========================================================================

  function save(
    jobId: string,
    stage: AIVideoStudioPhase,
    data: CreatorJson,
    jobStateSnapshot: CreatorJson = null
  ): string {
    if (!checkpoints.has(jobId)) {
      checkpoints.set(jobId, new Map());
    }

    const checkpointId = nanoid();
    const checkpoint: CheckpointData = {
      id: checkpointId,
      jobId,
      stage,
      data,
      savedAt: new Date().toISOString(),
      jobStateSnapshot,
      version: 1,
    };

    const jobCheckpoints = checkpoints.get(jobId)!;
    jobCheckpoints.set(stage, checkpoint);
    persistToDisk(jobId, stage, checkpoint);

    return checkpointId;
  }

  function load(
    jobId: string,
    stage: AIVideoStudioPhase
  ): { data: CreatorJson; jobStateSnapshot: CreatorJson; savedAt: string } | null {
    let jobCheckpoints = checkpoints.get(jobId);
    let checkpoint = jobCheckpoints?.get(stage);

    if (!checkpoint) {
      checkpoint = loadFromDisk(jobId, stage) ?? undefined;
      if (checkpoint) {
        if (!checkpoints.has(jobId)) {
          checkpoints.set(jobId, new Map());
        }
        checkpoints.get(jobId)!.set(stage, checkpoint);
      }
    }

    if (!checkpoint) return null;

    return {
      data: checkpoint.data,
      jobStateSnapshot: checkpoint.jobStateSnapshot,
      savedAt: checkpoint.savedAt,
    };
  }

  function hasCheckpoint(jobId: string, stage: AIVideoStudioPhase): boolean {
    const jobCheckpoints = checkpoints.get(jobId);
    if (jobCheckpoints?.has(stage)) return true;

    const fromDisk = loadFromDisk(jobId, stage);
    if (fromDisk) {
      if (!checkpoints.has(jobId)) checkpoints.set(jobId, new Map());
      checkpoints.get(jobId)!.set(stage, fromDisk);
      return true;
    }
    return false;
  }

  function getLatestCheckpoint(jobId: string): { stage: AIVideoStudioPhase; data: CreatorJson; savedAt: string } | null {
    const jobCheckpoints = checkpoints.get(jobId);
    if (!jobCheckpoints || jobCheckpoints.size === 0) return null;

    let latest: { stage: AIVideoStudioPhase; data: CreatorJson; savedAt: string } | null = null;

    for (const [stage, checkpoint] of jobCheckpoints.entries()) {
      if (!latest || new Date(checkpoint.savedAt).getTime() > new Date(latest.savedAt).getTime()) {
        latest = { stage, data: checkpoint.data, savedAt: checkpoint.savedAt };
      }
    }

    return latest;
  }

  function getCompletedStages(jobId: string): AIVideoStudioPhase[] {
    const jobCheckpoints = checkpoints.get(jobId);
    if (!jobCheckpoints) return [];
    return Array.from(jobCheckpoints.keys());
  }

  function deleteCheckpoint(jobId: string, stage: AIVideoStudioPhase): boolean {
    const jobCheckpoints = checkpoints.get(jobId);
    const inMemDeleted = jobCheckpoints ? jobCheckpoints.delete(stage) : false;
    removeDiskCheckpoint(jobId, stage);
    return inMemDeleted;
  }

  function clearAllCheckpoints(jobId: string): void {
    checkpoints.delete(jobId);
    clearDiskCheckpoints(jobId);
  }

  // =========================================================================
  // RESUME LOGIC
  // =========================================================================

  function getResumePoint(jobId: string): { stage: AIVideoStudioPhase; data: CreatorJson } | null {
    const completedStages = new Set(getCompletedStages(jobId));
    if (completedStages.size === 0) return null;

    for (let i = AI_VIDEO_STUDIO_PHASE_ORDER.length - 1; i >= 0; i--) {
      const stage = AI_VIDEO_STUDIO_PHASE_ORDER[i]!;
      if (completedStages.has(stage)) {
        const cp = load(jobId, stage);
        if (cp) {
          return { stage, data: cp.data };
        }
      }
    }

    return null;
  }

  function canResumeFrom(jobId: string, targetStage: AIVideoStudioPhase): boolean {
    const targetIndex = AI_VIDEO_STUDIO_PHASE_ORDER.indexOf(targetStage);
    if (targetIndex === -1) return false;

    // To resume at targetStage, all preceding stages must have checkpoints
    for (let i = 0; i < targetIndex; i++) {
      const stage = AI_VIDEO_STUDIO_PHASE_ORDER[i]!;
      if (!hasCheckpoint(jobId, stage)) {
        return false;
      }
    }
    return true;
  }

  function getResumePlan(jobId: string): { stagesToRun: AIVideoStudioPhase[]; startFromStage: AIVideoStudioPhase } {
    const completed = new Set(getCompletedStages(jobId));

    let startFromIndex = 0;
    for (let i = 0; i < AI_VIDEO_STUDIO_PHASE_ORDER.length; i++) {
      const stage = AI_VIDEO_STUDIO_PHASE_ORDER[i]!;
      if (!completed.has(stage)) {
        startFromIndex = i;
        break;
      }
      if (i === AI_VIDEO_STUDIO_PHASE_ORDER.length - 1) {
        return { stagesToRun: [], startFromStage: 'assembly' };
      }
    }

    return {
      startFromStage: AI_VIDEO_STUDIO_PHASE_ORDER[startFromIndex] || 'storyline',
      stagesToRun: AI_VIDEO_STUDIO_PHASE_ORDER.slice(startFromIndex),
    };
  }

  // =========================================================================
  // CHECKPOINT MILESTONES
  // =========================================================================

  function shouldCheckpoint(stage: AIVideoStudioPhase, progress: number): boolean {
    const milestones: Record<AIVideoStudioPhase, number[]> = {
      storyline: [50, 100],
      characters: [33, 66, 100],
      assets: [25, 50, 75, 100],
      voice: [50, 100],
      assembly: [50, 100],
    };

    const stageMilestones = milestones[stage] || [100];
    return stageMilestones.some(m => Math.abs(progress - m) < 0.1 || progress >= m);
  }

  return {
    save,
    load,
    hasCheckpoint,
    getLatestCheckpoint,
    getCompletedStages,
    deleteCheckpoint,
    clearAllCheckpoints,
    getResumePoint,
    canResumeFrom,
    getResumePlan,
    shouldCheckpoint,
  };
}
