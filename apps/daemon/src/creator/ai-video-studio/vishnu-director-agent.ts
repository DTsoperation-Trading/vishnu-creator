import { nanoid } from 'nanoid';
import type {
  CreatorJson,
  AIVideoStudioPhase,
  AIVideoStudioJobState,
  StorylineInput,
  StorylineOutput,
  VisualStyleParams,
  VisualStyleReference,
  AssetLibraryItem,
  CharacterAsset,
  SceneAsset,
  VoiceAsset,
  VisualStyleAsset,
  PropAsset,
  MusicAsset,
  CanvasNode,
  CanvasGraph,
  VishnuDirectorRequest,
  VishnuDirectorResponse,
  CostEstimate,
  StageCostEstimate,
} from '@vishnucreator/protocol';
import { createAssetLibrary, type AssetLibrary } from './asset-library.js';
import { createStageCheckpointManager, type StageCheckpointManager, AI_VIDEO_STUDIO_PHASE_ORDER } from './stage-checkpoint.js';
import { createModelGatewayClient, type ModelGatewayClient } from './model-gateway.js';
import { createVisualStyleExtractor, type VisualStyleExtractor } from './visual-style-extractor.js';
import { createStorylineGenerator, type StorylineGenerator } from './storyline-generator.js';

export interface VishnuDirectorAgentOptions {
  assetLibrary?: AssetLibrary;
  checkpointManager?: StageCheckpointManager;
  modelGateway?: ModelGatewayClient;
  styleExtractor?: VisualStyleExtractor;
  storylineGenerator?: StorylineGenerator;
  storageDir?: string;
}

export type VishnuDirectorAgent = ReturnType<typeof createVishnuDirectorAgent>;

export function createVishnuDirectorAgent(options: VishnuDirectorAgentOptions = {}) {
  const assetLibraries = new Map<string, AssetLibrary>();
  const checkpointManager = options.checkpointManager || createStageCheckpointManager();
  const modelGateway = options.modelGateway || createModelGatewayClient();
  const styleExtractor = options.styleExtractor || createVisualStyleExtractor();
  const storylineGenerator = options.storylineGenerator || createStorylineGenerator({ modelGateway, styleExtractor });
  const visualStyleCache = new Map<string, VisualStyleReference>();
  const jobStates = new Map<string, AIVideoStudioJobState>();

  function getAssetLibrary(projectId: string): AssetLibrary {
    if (!assetLibraries.has(projectId)) {
      assetLibraries.set(projectId, options.assetLibrary || createAssetLibrary(projectId, { storageDir: options.storageDir }));
    }
    return assetLibraries.get(projectId)!;
  }

  function getOrCreateJobState(jobId: string): AIVideoStudioJobState {
    if (!jobStates.has(jobId)) {
      jobStates.set(jobId, {
        currentStage: null,
        completedStages: [],
        stageOutputs: {
          storyline: null,
          characters: null,
          assets: null,
          voice: null,
          assembly: null,
        },
        stageCheckpoints: {
          storyline: null,
          characters: null,
          assets: null,
          voice: null,
          assembly: null,
        },
        assetLibrary: {
          characters: [],
          scenes: [],
          props: [],
          voices: [],
          visualStyles: [],
          music: [],
        },
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
      });
    }
    return jobStates.get(jobId)!;
  }

  // =========================================================================
  // WORKFLOW PLANNING (STORYLINE GENERATION)
  // =========================================================================

  async function planWorkflow(
    input: StorylineInput,
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    try {
      const storylineOutput = await storylineGenerator.generate(input);
      const resolvedStyle = storylineOutput.visualStyleParams;

      // Initialize project asset library
      const library = getAssetLibrary(context.projectId);
      const styleAsset = library.createVisualStyle({
        name: `${input.style || 'animation'} Aesthetic`,
        description: 'Visual style for project',
        tags: ['style', resolvedStyle.khmerAesthetic || 'traditional'],
        thumbnailUrl: null,
        metadata: {
          params: resolvedStyle,
          sourceImageRef: null,
          exampleImages: [],
        },
      });

      const characterIds: string[] = [];
      for (const char of storylineOutput.characterBible) {
        const createdChar = library.createCharacter({
          name: char.name,
          description: `${char.role} - ${char.archetype}`,
          tags: ['character', char.role, ...char.personality],
          thumbnailUrl: null,
          metadata: {
            visualDesign: {
              seed: 42,
              controlNetRefs: [],
              loraModelId: null,
              prompt: `${char.name}, ${char.visualTraits.ageRange} ${char.visualTraits.gender}, Khmer aesthetic`,
              negativePrompt: 'blurry, distorted',
              aspects: {
                bodyType: 'average',
                faceShape: 'oval',
                hairStyle: 'black short',
                hairColor: 'black',
                eyeColor: 'brown',
                outfit: 'traditional Khmer krama',
                accessories: [],
              },
              expressions: { neutral: 'calm smile' },
              poses: { standing: 'standing upright' },
            },
            voiceProfile: {
              provider: 'edge-tts',
              voiceId: 'km-KH-PisethNeural',
              voiceName: 'Piseth Neural',
              language: 'km-KH',
              gender: char.visualTraits.gender === 'female' ? 'female' : 'male',
              traits: char.voiceTraits,
              prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' },
            },
            animationRig: 'sprite-2d',
            role: char.role,
          },
        });
        characterIds.push(createdChar.id);
      }

      // Save storyline checkpoint
      checkpointManager.save(context.jobId, 'storyline', storylineOutput as unknown as CreatorJson);

      // Update Job State
      const state = getOrCreateJobState(context.jobId);
      state.currentStage = 'storyline';
      state.completedStages = ['storyline'];
      state.stageOutputs.storyline = storylineOutput as unknown as CreatorJson;
      state.visualStyleParams = resolvedStyle;
      state.assetLibrary.visualStyles = [styleAsset.id];
      state.assetLibrary.characters = characterIds;

      return {
        success: true,
        result: {
          stage: 'storyline',
          output: storylineOutput,
          nextStage: 'characters',
          styleAssetId: styleAsset.id,
          characterIds,
        } as unknown as CreatorJson,
        nextAction: 'continue',
        message: `Storyline generated with ${storylineOutput.characterBible.length} characters and ${storylineOutput.script.length} scenes.`,
      };
    } catch (err) {
      return {
        success: false,
        result: null,
        message: `Plan workflow failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // =========================================================================
  // STAGE EXECUTION
  // =========================================================================

  async function executeStage(
    payload: { stage: AIVideoStudioPhase; input?: CreatorJson },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const { stage, input } = payload;
    const state = getOrCreateJobState(context.jobId);

    const prevIndex = AI_VIDEO_STUDIO_PHASE_ORDER.indexOf(stage) - 1;
    if (prevIndex >= 0) {
      const prevStage = AI_VIDEO_STUDIO_PHASE_ORDER[prevIndex]!;
      if (!checkpointManager.hasCheckpoint(context.jobId, prevStage)) {
        return {
          success: false,
          result: null,
          message: `Cannot execute stage '${stage}': Preceding stage '${prevStage}' has not been completed.`,
        };
      }
    }

    const stageData: CreatorJson = {
      stage,
      executedAt: new Date().toISOString(),
      input: input || null,
      status: 'completed',
    };

    checkpointManager.save(context.jobId, stage, stageData);

    if (!state.completedStages.includes(stage)) {
      state.completedStages.push(stage);
    }
    state.currentStage = stage;
    state.stageOutputs[stage] = stageData;

    const nextIdx = AI_VIDEO_STUDIO_PHASE_ORDER.indexOf(stage) + 1;
    const nextStage = nextIdx < AI_VIDEO_STUDIO_PHASE_ORDER.length ? AI_VIDEO_STUDIO_PHASE_ORDER[nextIdx] : null;

    return {
      success: true,
      result: {
        stage,
        stageData,
        nextStage,
      } as unknown as CreatorJson,
      nextAction: nextStage ? 'continue' : 'await_approval',
      message: `Stage '${stage}' completed successfully.`,
    };
  }

  // =========================================================================
  // CANVAS GRAPH BUILDER (18 Node Types)
  // =========================================================================

  async function buildCanvasGraph(
    payload: { stage?: AIVideoStudioPhase; assets?: AssetLibraryItem[] },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const library = getAssetLibrary(context.projectId);
    const assets = payload.assets || library.list();

    const nodes: CanvasNode[] = [];
    const edges: CanvasGraph['edges'] = [];

    // Root Topic Node
    const topicNodeId = 'node-topic';
    nodes.push({
      id: topicNodeId,
      type: 'textAnnotation',
      position: { x: 50, y: 150 },
      size: { width: 220, height: 100 },
      label: 'Video Topic & Concept',
      data: { stage: 'storyline' },
      connections: [],
      generationHistory: [],
    });

    let currentX = 320;
    let currentY = 50;

    for (const asset of assets) {
      const nodeId = `node-${asset.id}`;
      let nodeType: CanvasNode['type'] = 'textAnnotation';
      let color = '#4A90E2';

      switch (asset.type) {
        case 'character':
          nodeType = 'characterRef';
          color = '#F5A623';
          break;
        case 'scene':
          nodeType = 'sceneRef';
          color = '#7ED321';
          break;
        case 'voice':
          nodeType = 'audioGen';
          color = '#9013FE';
          break;
        case 'visual-style':
          nodeType = 'styleRef';
          color = '#E91E63';
          break;
        case 'music':
          nodeType = 'audioGen';
          color = '#50E3C2';
          break;
        case 'prop':
          nodeType = 'imageGen';
          color = '#B8E986';
          break;
      }

      nodes.push({
        id: nodeId,
        type: nodeType,
        position: { x: currentX, y: currentY },
        size: { width: 200, height: 120 },
        label: asset.name,
        color,
        data: { assetId: asset.id, assetType: asset.type, description: asset.description },
        connections: [{ targetId: topicNodeId, connectionType: 'reference' }],
        generationHistory: [],
      });

      edges.push({
        id: `edge-${nanoid(6)}`,
        sourceId: topicNodeId,
        targetId: nodeId,
        connectionType: 'reference',
      });

      currentY += 150;
      if (currentY > 600) {
        currentY = 50;
        currentX += 260;
      }
    }

    const groups: CanvasGraph['groups'] = [
      {
        id: 'group-characters',
        label: 'Characters',
        color: '#F5A623',
        collapsed: false,
        nodeIds: nodes.filter(n => n.type === 'characterRef').map(n => n.id),
      },
      {
        id: 'group-assets',
        label: 'Visual & Audio Assets',
        color: '#7ED321',
        collapsed: false,
        nodeIds: nodes.filter(n => ['sceneRef', 'styleRef', 'audioGen', 'imageGen'].includes(n.type)).map(n => n.id),
      },
    ];

    const graph: CanvasGraph = {
      nodes,
      edges,
      groups: groups.filter(g => g.nodeIds.length > 0),
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    return {
      success: true,
      result: graph as unknown as CreatorJson,
      message: `Canvas graph generated with ${nodes.length} nodes and ${edges.length} edges.`,
    };
  }

  // =========================================================================
  // VISUAL STYLE EXTRACTION
  // =========================================================================

  async function extractVisualStyle(
    payload: { imageArtifactId: string; styleHint?: string },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const { imageArtifactId, styleHint } = payload;
    const cacheKey = `${context.jobId}:${imageArtifactId}`;

    if (visualStyleCache.has(cacheKey)) {
      return {
        success: true,
        result: visualStyleCache.get(cacheKey)! as unknown as CreatorJson,
        message: 'Visual style loaded from cache.',
      };
    }

    const styleRef = styleExtractor.analyzeReference(imageArtifactId, styleHint);
    visualStyleCache.set(cacheKey, styleRef);

    const library = getAssetLibrary(context.projectId);
    library.createVisualStyle({
      name: `Extracted Style (${imageArtifactId.slice(0, 8)})`,
      description: 'Extracted from visual reference',
      tags: ['extracted-style', styleRef.extractedParams.khmerAesthetic || 'traditional'],
      thumbnailUrl: null,
      metadata: {
        params: styleRef.extractedParams,
        sourceImageRef: imageArtifactId,
        exampleImages: [imageArtifactId],
      },
    });

    return {
      success: true,
      result: styleRef as unknown as CreatorJson,
      message: 'Visual style extracted successfully.',
    };
  }

  // =========================================================================
  // ASSET LIBRARY MANAGEMENT
  // =========================================================================

  async function manageAssetLibrary(
    payload: { action: 'create' | 'read' | 'update' | 'delete' | 'list'; item?: AssetLibraryItem; id?: string; filter?: { type?: AssetLibraryItem['type']; tag?: string } },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const library = getAssetLibrary(context.projectId);

    switch (payload.action) {
      case 'create': {
        if (!payload.item) {
          return { success: false, result: null, message: 'Item payload required for create' };
        }
        const created = library.create(payload.item);
        return { success: true, result: created as unknown as CreatorJson };
      }
      case 'read': {
        if (!payload.id) {
          return { success: false, result: null, message: 'ID required for read' };
        }
        const item = library.read(payload.id);
        return { success: !!item, result: (item || null) as unknown as CreatorJson };
      }
      case 'update': {
        if (!payload.id || !payload.item) {
          return { success: false, result: null, message: 'ID and item payload required for update' };
        }
        const updated = library.update(payload.id, payload.item);
        return { success: !!updated, result: (updated || null) as unknown as CreatorJson };
      }
      case 'delete': {
        if (!payload.id) {
          return { success: false, result: null, message: 'ID required for delete' };
        }
        const deleted = library.delete(payload.id);
        return { success: deleted, result: { deleted } as unknown as CreatorJson };
      }
      case 'list': {
        const items = library.list(payload.filter);
        return { success: true, result: items as unknown as CreatorJson };
      }
      default:
        return { success: false, result: null, message: `Unknown action: ${(payload as Record<string, unknown>).action}` };
    }
  }

  // =========================================================================
  // RESUME & REGENERATE
  // =========================================================================

  async function resumeFromCheckpoint(
    payload: { stage: AIVideoStudioPhase },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const { stage } = payload;
    const cp = checkpointManager.load(context.jobId, stage);
    if (!cp) {
      return {
        success: false,
        result: null,
        message: `No checkpoint found for stage '${stage}'`,
      };
    }

    return {
      success: true,
      result: {
        stage,
        checkpointData: cp.data,
        savedAt: cp.savedAt,
      } as unknown as CreatorJson,
      nextAction: 'continue',
      message: `Resumed from checkpoint for stage '${stage}'`,
    };
  }

  async function regenerateStage(
    payload: { stage: AIVideoStudioPhase; modifications?: Record<string, CreatorJson> },
    context: VishnuDirectorRequest['context']
  ): Promise<VishnuDirectorResponse> {
    const { stage, modifications } = payload;
    const stageIdx = AI_VIDEO_STUDIO_PHASE_ORDER.indexOf(stage);

    if (stageIdx === -1) {
      return { success: false, result: null, message: `Invalid stage '${stage}'` };
    }

    // Invalidate this stage and downstream stages in checkpoints
    for (let i = stageIdx; i < AI_VIDEO_STUDIO_PHASE_ORDER.length; i++) {
      checkpointManager.deleteCheckpoint(context.jobId, AI_VIDEO_STUDIO_PHASE_ORDER[i]!);
    }

    return executeStage({ stage, input: modifications as unknown as CreatorJson }, context);
  }

  // =========================================================================
  // COST ESTIMATION
  // =========================================================================

  function estimateCosts(): CostEstimate {
    const stages: StageCostEstimate[] = [
      {
        stage: 'storyline',
        estimatedCostUSD: 0.02,
        breakdown: [{ provider: 'relayclaw', operation: 'script generation', estimatedCalls: 1, costPerCall: 0.02, totalCost: 0.02 }],
        localFallbackAvailable: true,
        localFallbackCostUSD: 0,
      },
      {
        stage: 'characters',
        estimatedCostUSD: 0.05,
        breakdown: [{ provider: 'relayclaw', operation: 'character visual & voice design', estimatedCalls: 3, costPerCall: 0.016, totalCost: 0.05 }],
        localFallbackAvailable: true,
        localFallbackCostUSD: 0,
      },
      {
        stage: 'assets',
        estimatedCostUSD: 0.15,
        breakdown: [{ provider: 'relayclaw', operation: 'scene & prop generation', estimatedCalls: 5, costPerCall: 0.03, totalCost: 0.15 }],
        localFallbackAvailable: true,
        localFallbackCostUSD: 0,
      },
      {
        stage: 'voice',
        estimatedCostUSD: 0.04,
        breakdown: [{ provider: 'voxcpm2', operation: 'Khmer neural voice synthesis', estimatedCalls: 4, costPerCall: 0.01, totalCost: 0.04 }],
        localFallbackAvailable: true,
        localFallbackCostUSD: 0,
      },
      {
        stage: 'assembly',
        estimatedCostUSD: 0.01,
        breakdown: [{ provider: 'ffmpeg-local', operation: 'video rendering & subtitle burn-in', estimatedCalls: 1, costPerCall: 0.01, totalCost: 0.01 }],
        localFallbackAvailable: true,
        localFallbackCostUSD: 0,
      },
    ];

    const totalEstimatedUSD = stages.reduce((acc, s) => acc + s.estimatedCostUSD, 0);

    return {
      totalEstimatedUSD,
      totalLocalFallbackUSD: 0,
      stages,
      currency: 'USD',
      estimatedAt: new Date().toISOString(),
      disclaimer: 'Estimates based on standard duration and selected providers',
    };
  }

  // =========================================================================
  // DISPATCHER
  // =========================================================================

  async function handleRequest(request: VishnuDirectorRequest): Promise<VishnuDirectorResponse> {
    switch (request.capability) {
      case 'plan_workflow':
        return planWorkflow(request.payload as unknown as StorylineInput, request.context);
      case 'execute_stage':
        return executeStage(request.payload as unknown as { stage: AIVideoStudioPhase; input?: CreatorJson }, request.context);
      case 'build_canvas_graph':
        return buildCanvasGraph(request.payload as unknown as { stage?: AIVideoStudioPhase; assets?: AssetLibraryItem[] }, request.context);
      case 'extract_visual_style':
        return extractVisualStyle(request.payload as unknown as { imageArtifactId: string; styleHint?: string }, request.context);
      case 'manage_asset_library':
        return manageAssetLibrary(request.payload as unknown as { action: 'create' | 'read' | 'update' | 'delete' | 'list'; item?: AssetLibraryItem; id?: string }, request.context);
      case 'resume_from_checkpoint':
        return resumeFromCheckpoint(request.payload as unknown as { stage: AIVideoStudioPhase }, request.context);
      case 'regenerate_stage':
        return regenerateStage(request.payload as unknown as { stage: AIVideoStudioPhase; modifications?: Record<string, CreatorJson> }, request.context);
      default:
        return {
          success: false,
          result: null,
          message: `Unknown capability: ${(request as Record<string, unknown>).capability}`,
        };
    }
  }

  return {
    handleRequest,
    planWorkflow,
    executeStage,
    buildCanvasGraph,
    extractVisualStyle,
    manageAssetLibrary,
    resumeFromCheckpoint,
    regenerateStage,
    estimateCosts,
    getAssetLibrary,
    checkpointManager,
    modelGateway,
    styleExtractor,
  };
}
