import type { CreatorJson, CreatorActor, CreatorStageRunStatus } from './creator.js';

/**
 * Phase 9: AI Video Studio Protocol Types
 * Dual-track architecture: Pipeline (structured) + Canvas (free exploration)
 * Inspired by DramaClaw's XiaHua + Series architecture
 */

// ============================================================================
// Template Registration
// ============================================================================

export const AI_VIDEO_STUDIO_TEMPLATE_ID = 'ai-video-studio';

export const AI_VIDEO_STUDIO_PHASES = [
  'storyline',
  'characters',
  'assets',
  'voice',
  'assembly',
] as const;

export type AIVideoStudioPhase = typeof AI_VIDEO_STUDIO_PHASES[number];

// ============================================================================
// Visual Style Extraction (DramaClaw-inspired)
// ============================================================================

export type VisualStyleParams = {
  colorPalette: string[];           // Dominant colors (hex)
  lighting: 'natural' | 'dramatic' | 'soft' | 'high-contrast' | 'cinematic';
  texture: 'smooth' | 'film-grain' | 'watercolor' | 'cel-shaded' | 'sketch';
  composition: 'rule-of-thirds' | 'centered' | 'symmetrical' | 'dynamic';
  mood: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted' | 'dark' | 'bright';
  cameraStyle: 'static' | 'handheld' | 'dolly' | 'crane' | 'drone';
  // Khmer-specific
  khmerAesthetic?: 'traditional' | 'modern' | 'fusion' | 'folk-art';
};

export type VisualStyleReference = {
  sourceImageId: string;            // Reference image artifact ID
  extractedParams: VisualStyleParams;
  confidence: number;               // 0-1
  appliedTo: string[];              // Asset IDs this style is applied to
};

// ============================================================================
// Asset Library (XiaTang-style)
// ============================================================================

export type AssetLibraryItem = {
  id: string;
  type: 'character' | 'scene' | 'prop' | 'voice' | 'visual-style' | 'music';
  projectId: string;
  name: string;
  description: string;
  tags: string[];
  thumbnailUrl: string | null;
  metadata: Record<string, CreatorJson>;
  status: 'draft' | 'ready' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CharacterAsset = AssetLibraryItem & {
  type: 'character';
  metadata: {
    visualDesign: {
      seed: number;
      controlNetRefs: string[];     // ControlNet reference image artifact IDs
      loraModelId: string | null;   // LoRA model for consistency
      prompt: string;
      negativePrompt: string;
      aspects: {
        bodyType: string;
        faceShape: string;
        hairStyle: string;
        hairColor: string;
        eyeColor: string;
        outfit: string;
        accessories: string[];
      };
      expressions: Record<string, string>; // emotion -> prompt modifier
      poses: Record<string, string>;       // pose name -> prompt modifier
    };
    voiceProfile: {
      provider: 'voxcpm2' | 'edge-tts' | 'azure' | 'elevenlabs' | 'fish-audio';
      voiceId: string;
      voiceName: string;
      language: string;
      gender: 'male' | 'female' | 'neutral';
      traits: string[];              // 'warm', 'authoritative', 'playful', etc.
      prosodyDefaults: {
        speed: number;               // 0.5-2.0
        pitch: number;               // -20 to +20 semitones
        emotion: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised';
      };
    };
    animationRig: 'stickman' | 'sprite-2d' | 'live2d' | '3d' | 'none';
    role: 'protagonist' | 'antagonist' | 'supporting' | 'narrator' | 'extra';
  };
};

export type SceneAsset = AssetLibraryItem & {
  type: 'scene';
  metadata: {
    category: 'interior' | 'exterior' | 'abstract' | '3d-set';
    timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden-hour' | 'blue-hour' | 'night';
    weather: 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow' | 'storm';
    lightingSetup: 'natural' | 'three-point' | 'rim' | 'silhouette' | 'volumetric';
    cameraAngles: ('wide' | 'medium' | 'close-up' | 'extreme-close-up' | 'dutch' | 'bird-eye' | 'worm-eye')[];
    is3DSet: boolean;
    directorWorldRef: string | null;    // 3D Gaussian Splat set reference
    panorama360Ref: string | null;      // 360° panorama reference
  };
};

export type VoiceAsset = AssetLibraryItem & {
  type: 'voice';
  metadata: {
    provider: 'voxcpm2' | 'edge-tts' | 'azure' | 'elevenlabs' | 'fish-audio' | 'index-tts';
    voiceId: string;
    voiceName: string;
    language: string;
    gender: 'male' | 'female' | 'neutral';
    ageRange: 'child' | 'teen' | 'young-adult' | 'adult' | 'senior';
    style: 'conversational' | 'narrator' | 'dramatic' | 'whisper' | 'shouting' | 'singing';
    sampleUrl: string | null;
    isCloned: boolean;
    sourceAudioRef: string | null;    // Reference audio for cloning
  };
};

export type VisualStyleAsset = AssetLibraryItem & {
  type: 'visual-style';
  metadata: {
    params: VisualStyleParams;
    sourceImageRef: string | null;    // Reference image used for extraction
    exampleImages: string[];           // Example image artifact IDs
  };
};

export type PropAsset = AssetLibraryItem & {
  type: 'prop';
  metadata: {
    category: 'handheld' | 'furniture' | 'vehicle' | 'weapon' | 'accessory' | 'effect';
    isAnimated: boolean;
    animationType: 'static' | 'rigid' | 'deformable' | 'particle';
  };
};

export type MusicAsset = AssetLibraryItem & {
  type: 'music';
  metadata: {
    genre: string;
    mood: string[];
    tempo: number;                    // BPM
    duration: number;                 // seconds
    isLoopable: boolean;
    instruments: string[];
    isAIGenerated: boolean;
    provider: 'suno' | 'udio' | 'mubert' | 'local';
  };
};

// ============================================================================
// Stage Definitions & Checkpoints
// ============================================================================

export type AIVideoStudioStage = {
  id: AIVideoStudioPhase;
  name: string;
  description: string;
  dependsOn: AIVideoStudioPhase[];
  executor: string;                    // Daemon executor name
  estimatedDurationSeconds: number;
  checkpointFields: string[];          // Fields to persist at checkpoint
};

export const AI_VIDEO_STUDIO_STAGES: AIVideoStudioStage[] = [
  {
    id: 'storyline',
    name: 'Storyline Generator',
    description: 'Generate outline, character bible, and full script from topic',
    dependsOn: [],
    executor: 'ai-video-storyline',
    estimatedDurationSeconds: 120,
    checkpointFields: ['outline', 'characterBible', 'script', 'visualStyleParams'],
  },
  {
    id: 'characters',
    name: 'Character Factory',
    description: 'Design visual appearance, assign voices, create animation rigs',
    dependsOn: ['storyline'],
    executor: 'ai-video-characters',
    estimatedDurationSeconds: 180,
    checkpointFields: ['characterAssets', 'voiceAssignments', 'animationRigs'],
  },
  {
    id: 'assets',
    name: 'Asset Pipeline',
    description: 'Generate backgrounds, character art, props, extract visual style',
    dependsOn: ['characters'],
    executor: 'ai-video-assets',
    estimatedDurationSeconds: 300,
    checkpointFields: ['sceneAssets', 'characterArtAssets', 'propAssets', 'visualStyleAsset'],
  },
  {
    id: 'voice',
    name: 'Voice Synthesis',
    description: 'Multi-speaker TTS with prosody, lip-sync timing, audio mixing',
    dependsOn: ['characters'],
    executor: 'ai-video-voice',
    estimatedDurationSeconds: 240,
    checkpointFields: ['voiceAssets', 'lipSyncData', 'audioMix'],
  },
  {
    id: 'assembly',
    name: 'Video Assembly',
    description: 'Timeline composition, transitions, subtitles, music, export',
    dependsOn: ['assets', 'voice'],
    executor: 'ai-video-assembly',
    estimatedDurationSeconds: 180,
    checkpointFields: ['finalVideoArtifact', 'subtitleArtifacts', 'exportManifest'],
  },
];

// ============================================================================
// Stage Input/Output Types
// ============================================================================

export type StorylineInput = {
  topic: string;
  style: 'animation' | 'live-action' | 'documentary' | 'shorts' | 'anime' | 'cinematic';
  targetLanguage: string;              // e.g., 'km', 'en', 'zh'
  targetDurationSeconds?: number;      // Optional target duration
  referenceStoryId?: string;           // Optional reference story asset
  culturalContext?: 'khmer' | 'universal' | 'custom';
  customCulturalRules?: string;
};

export type StorylineOutput = {
  outline: {
    acts: Array<{
      actNumber: number;
      title: string;
      summary: string;
      beats: Array<{
        beatNumber: number;
        title: string;
        description: string;
        emotionalArc: 'setup' | 'inciting' | 'rising' | 'climax' | 'falling' | 'resolution';
        estimatedDurationSeconds: number;
      }>;
    }>;
    totalEstimatedDurationSeconds: number;
  };
  characterBible: Array<{
    id: string;
    name: string;
    role: 'protagonist' | 'antagonist' | 'supporting' | 'narrator' | 'extra';
    archetype: string;
    personality: string[];
    motivation: string;
    conflict: string;
    arc: 'positive' | 'negative' | 'flat' | 'corruption' | 'redemption';
    voiceTraits: string[];             // 'warm', 'authoritative', 'playful', etc.
    visualTraits: {
      ageRange: string;
      gender: string;
      ethnicity: string;
      distinctiveFeatures: string[];
    };
    relationships: Array<{
      targetCharacterId: string;
      type: 'ally' | 'enemy' | 'mentor' | 'romantic' | 'family' | 'rival';
      dynamic: string;
    }>;
  }>;
  script: Array<{
    sceneNumber: number;
    actNumber: number;
    beatNumber: number;
    location: string;
    timeOfDay: string;
    characters: string[];              // Character IDs present
    action: string;
    dialogue: Array<{
      characterId: string;
      text: string;
      emotion: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'whisper' | 'shouting';
      subtext?: string;
    }>;
    cameraNotes: string;
    estimatedDurationSeconds: number;
    visualReferences: string[];        // Visual style / mood board refs
  }>;
  visualStyleParams: VisualStyleParams;
  culturalNotes: string[];
};

export type CharacterFactoryInput = {
  characterBible: StorylineOutput['characterBible'];
  visualStyleParams: VisualStyleParams;
  defaultAnimationRig: 'stickman' | 'sprite-2d' | 'live2d' | '3d' | 'none';
  voiceProviderPreference: 'voxcpm2' | 'edge-tts' | 'azure' | 'elevenlabs' | 'fish-audio' | 'auto';
};

export type CharacterFactoryOutput = {
  characterAssets: CharacterAsset[];
  voiceAssignments: Array<{
    characterId: string;
    voiceAssetId: string;
    voiceProfile: VoiceAsset['metadata'];
  }>;
  animationRigs: Array<{
    characterId: string;
    rigType: 'stickman' | 'sprite-2d' | 'live2d' | '3d' | 'none';
    rigConfig: Record<string, CreatorJson>;
  }>;
  visualStyleRef: string;              // VisualStyleAsset ID
};

export type AssetPipelineInput = {
  script: StorylineOutput['script'];
  characterAssets: CharacterAsset[];
  visualStyleParams: VisualStyleParams;
  sceneCount: number;
  styleConsistencyLevel: 'strict' | 'moderate' | 'loose';
};

export type AssetPipelineOutput = {
  sceneAssets: SceneAsset[];
  characterArtAssets: AssetLibraryItem[];  // Character art variants (expressions, poses, outfits)
  propAssets: PropAsset[];
  visualStyleAsset: VisualStyleAsset;
  visualStyleRef: string;                // VisualStyleAsset ID
};

export type VoiceSynthesisInput = {
  script: StorylineOutput['script'];
  voiceAssignments: CharacterFactoryOutput['voiceAssignments'];
  prosodyDefaults: Record<string, { speed: number; pitch: number; emotion: string }>;
  backgroundMusic?: {
    provider: 'suno' | 'udio' | 'mubert' | 'local';
    genre: string;
    mood: string[];
    durationSeconds: number;
  };
  soundEffects?: Array<{
    sceneNumber: number;
    description: string;
    timingMs: number;
  }>;
};

export type VoiceSynthesisOutput = {
  voiceAssets: VoiceAsset[];
  lipSyncData: Array<{
    sceneNumber: number;
    characterId: string;
    phonemes: Array<{
      phoneme: string;
      startMs: number;
      endMs: number;
      viseme: string;                    // Viseme code for lip-sync
    }>;
  }>;
  audioMix: {
    dialogueTrackId: string;
    musicTrackId: string | null;
    sfxTrackId: string | null;
    masterTrackId: string;
    mixSettings: {
      dialogueGain: number;
      musicGain: number;
      sfxGain: number;
      masterGain: number;
      compression: boolean;
      limiter: boolean;
    };
  };
};

export type VideoAssemblyInput = {
  script: StorylineOutput['script'];
  sceneAssets: SceneAsset[];
  characterArtAssets: AssetLibraryItem[];
  voiceOutput: VoiceSynthesisOutput;
  visualStyleParams: VisualStyleParams;
  exportSettings: {
    resolutions: ('1080p' | '720p' | '480p' | '4k')[];
    formats: ('mp4' | 'webm' | 'mov')[];
    subtitleFormats: ('srt' | 'vtt' | 'ass')[];
    burnSubtitles: boolean;
    perSpeakerSubtitleColors: boolean;
  };
};

export type VideoAssemblyOutput = {
  finalVideoArtifact: {
    id: string;
    resolutions: Record<string, string>; // resolution -> artifact ID
    durationSeconds: number;
    fileSizeBytes: number;
    sha256: string;
  };
  subtitleArtifacts: Array<{
    format: 'srt' | 'vtt' | 'ass';
    language: string;
    artifactId: string;
    perSpeakerColors: boolean;
  }>;
  exportManifest: {
    generatedAt: string;
    totalDurationSeconds: number;
    scenesRendered: number;
    assetsUsed: number;
    providerCosts: Record<string, number>;
    checksums: Record<string, string>;
  };
};

// ============================================================================
// Job State Extension for AI Video Studio
// ============================================================================

export type AIVideoStudioJobState = {
  currentStage: AIVideoStudioPhase | null;
  completedStages: AIVideoStudioPhase[];
  stageOutputs: Record<AIVideoStudioPhase, CreatorJson | null>;
  stageCheckpoints: Record<AIVideoStudioPhase, {
    savedAt: string;
    data: CreatorJson;
  } | null>;
  assetLibrary: {
    characters: string[];        // CharacterAsset IDs
    scenes: string[];            // SceneAsset IDs
    props: string[];             // PropAsset IDs
    voices: string[];            // VoiceAsset IDs
    visualStyles: string[];      // VisualStyleAsset IDs
    music: string[];             // MusicAsset IDs
  };
  visualStyleParams: VisualStyleParams | null;
  totalEstimatedCost: number;
  actualCost: number;
  costCap: number | null;
  generationMode: 'local' | 'cloud' | 'hybrid' | 'auto';
  resumeFromStage: AIVideoStudioPhase | null;
  userApprovals: Record<AIVideoStudioPhase, {
    approved: boolean;
    approvedAt: string | null;
    feedback?: string;
  }>;
};

// ============================================================================
// Dual-Track Canvas Types
// ============================================================================

export type CanvasNodeType =
  | 'textAnnotation'
  | 'imageGen'
  | 'videoGen'
  | 'audioGen'
  | 'script'
  | 'storyboard'
  | 'characterRef'
  | 'sceneRef'
  | 'styleRef'
  | 'group'
  | 'textAnnotation'
  | 'skill'
  | 'export'
  | 'panorama360'
  | 'directorWorld'
  | 'beatContext'
  | 'scriptNode';

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: Record<string, CreatorJson>;
  label: string;
  color?: string;
  groupId?: string;
  connections: Array<{
    targetId: string;
    connectionType: 'input' | 'reference' | 'context' | 'media';
  }>;
  generationHistory: Array<{
    timestamp: string;
    model: string;
    params: Record<string, CreatorJson>;
    resultAssetId: string | null;
  }>;
};

export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    connectionType: 'input' | 'reference' | 'context' | 'media';
    label?: string;
  }>;
  groups: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    color: string;
    collapsed: boolean;
  }>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

// ============================================================================
// Vishnu Director Agent Types
// ============================================================================

export type VishnuDirectorCapability =
  | 'plan_workflow'
  | 'execute_stage'
  | 'build_canvas_graph'
  | 'extract_visual_style'
  | 'manage_asset_library'
  | 'resume_from_checkpoint'
  | 'regenerate_stage';

export type VishnuDirectorRequest = {
  capability: VishnuDirectorCapability;
  payload: CreatorJson;
  context: {
    jobId: string;
    projectId: string;
    currentStage: AIVideoStudioPhase | null;
    assetLibraryState: AIVideoStudioJobState['assetLibrary'];
    visualStyleParams: VisualStyleParams | null;
  };
};

export type VishnuDirectorResponse = {
  success: boolean;
  result: CreatorJson;
  nextAction?: 'continue' | 'await_approval' | 'regenerate' | 'resume';
  message?: string;
};

// ============================================================================
// Cost Estimation
// ============================================================================

export type StageCostEstimate = {
  stage: AIVideoStudioPhase;
  estimatedCostUSD: number;
  breakdown: Array<{
    provider: string;
    operation: string;
    estimatedCalls: number;
    costPerCall: number;
    totalCost: number;
  }>;
  localFallbackAvailable: boolean;
  localFallbackCostUSD: number;
};

export type CostEstimate = {
  totalEstimatedUSD: number;
  totalLocalFallbackUSD: number;
  stages: StageCostEstimate[];
  currency: 'USD';
  estimatedAt: string;
  disclaimer: string;
};

// ============================================================================
// User Approval Flow
// ============================================================================

export type StageApprovalRequest = {
  stage: AIVideoStudioPhase;
  preview: CreatorJson;              // Stage-specific preview data
  estimatedCostUSD: number;
  estimatedDurationSeconds: number;
  warnings: string[];
};

export type StageApprovalResponse = {
  approved: boolean;
  feedback?: string;
  modifications?: Record<string, CreatorJson>;  // User-requested changes
  regenerate: boolean;
};

// ============================================================================
// Model Gateway (DramaClaw RelayClaw pattern)
// ============================================================================

export type ModelGatewayProvider =
  | 'relayclaw'          // Official DramaClaw gateway
  | 'openai'             // OpenAI API
  | 'anthropic'          // Anthropic API
  | 'google'             // Google Gemini
  | 'azure'              // Azure OpenAI
  | 'custom'             // Custom OpenAI-compatible endpoint
  | 'local';             // Local model (llama.cpp, Ollama, etc.)

export type ModelGatewayConfig = {
  defaultProvider: ModelGatewayProvider;
  providers: Record<ModelGatewayProvider, {
    enabled: boolean;
    baseUrl?: string;
    apiKey?: string;
    models: Array<{
      id: string;
      type: 'text' | 'image' | 'video' | 'audio' | 'embedding';
      capabilities: string[];
      costPer1kTokens?: number;
      costPerImage?: number;
      costPerSecondVideo?: number;
      costPerSecondAudio?: number;
    }>;
  }>;
  routingRules: Array<{
    taskType: 'text' | 'image' | 'video' | 'audio';
    preferredProvider: ModelGatewayProvider;
    fallbackProviders: ModelGatewayProvider[];
    maxCostPerOperation?: number;
  }>;
  costTracking: {
    enabled: boolean;
    dailyLimitUSD?: number;
    monthlyLimitUSD?: number;
    alertThresholdUSD?: number;
  };
};

// ============================================================================
// Export all types
// ============================================================================

export type {
  CreatorJson,
  CreatorActor,
  CreatorStageRunStatus,
};