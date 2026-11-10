import { nanoid } from 'nanoid';
import type {
  CharacterFactoryInput,
  CharacterFactoryOutput,
  CharacterBibleEntry,
  CharacterAsset,
  VisualStyleParams,
  VisualStyleAsset,
  AssetLibraryItem,
  ModelGatewayClient,
  VoiceAsset,
  AssignVoiceProfile,
  VoiceProfileAssignment,
} from '@vishnucreator/protocol';

/**
 * Character Factory - Stage 2 of AI Video Studio Pipeline
 * Generates visual designs, assigns voices, creates animation rigs
 * Inspired by DramaClaw's character identity system
 */

export type CharacterFactory = ReturnType<typeof createCharacterFactory>;

export interface CharacterFactoryConfig {
  modelGateway: ModelGatewayClient;
  assetLibrary: any;
  defaultAnimationRig: 'stickman' | 'sprite-2d' | 'live2d' | '3d' | 'none';
  defaultVoiceProvider: 'voxcpm2' | 'edge-tts' | 'azure' | 'elevenlabs' | 'fish-audio' | 'auto';
  visualStyleExtractor: any;
  assignVoiceProfile: AssignVoiceProfile;
}

export function createCharacterFactory(config: CharacterFactoryConfig) {
  const { modelGateway, assetLibrary, defaultAnimationRig, defaultVoiceProvider, visualStyleExtractor, assignVoiceProfile } = config;

  // =========================================================================
  // MAIN EXECUTION
  // =========================================================================

  async function generateCharacters(input: CharacterFactoryInput, jobId: string): Promise<CharacterFactoryOutput> {
    const { characterBible, visualStyleParams, defaultAnimationRig: rig, voiceProviderPreference } = input;

    const characterAssets: any[] = [];
    const voiceAssignments: any[] = [];
    const animationRigs: any[] = [];

    for (const character of characterBible) {
      // Generate visual design prompts
      const visualDesign = await generateCharacterVisualDesign(character, input.visualStyleParams);

      // Create character asset
      const characterAsset = await createCharacterAsset(jobId, character, visualDesign);
      characterAssets.push(characterAsset);

      // Assign voice profile using the provided function
      const voiceAssignment = await assignVoiceProfile(character, voiceProviderPreference || 'auto');
      voiceAssignments.push({
        characterId: characterAsset.id,
        voiceAssetId: voiceAssignment.voiceAssetId,
        voiceProfile: voiceAssignment.voiceProfile,
      });

      // Define animation rig
      animationRigs.push({
        characterId: characterAsset.id,
        rigType: input.defaultAnimationRig || 'stickman',
        rigConfig: {
          stickmanStyle: (input.defaultAnimationRig || 'stickman') === 'stickman' ? 'minimal' : undefined,
          spriteFrames: (input.defaultAnimationRig || 'stickman') === 'sprite-2d' ? 8 : undefined,
        },
      });
    }

    // Create visual style asset
    const visualStyleAsset = await createVisualStyleAsset(jobId, input.visualStyleParams);

    return {
      characterAssets,
      voiceAssignments,
      animationRigs,
      visualStyleRef: visualStyleAsset.id,
    };
  }

  // =========================================================================
  // VISUAL DESIGN GENERATION
  // =========================================================================

  async function generateCharacterVisualDesign(
    character: CharacterBibleEntry,
    visualStyleParams: VisualStyleParams
  ): Promise<{
    seed: number;
    controlNetRefs: string[];
    loraModelId: string | null;
    prompt: string;
    negativePrompt: string;
    aspects: any;
    expressions: Record<string, string>;
    poses: Record<string, string>;
    voiceProfile: VoiceProfileAssignment['voiceProfile'];
  }> {
    // Deterministic seed based on character ID
    const seed = hashString(character.id) % 2147483647;

    // Build visual prompt
    const visualPrompt = buildVisualPrompt(character, visualStyleParams);
    const negativePrompt = buildNegativePrompt();

    // Voice profile assignment
    const voiceProfile = assignVoiceProfileByTraits(character);

    return {
      seed,
      controlNetRefs: [], // Would be populated with reference image IDs
      loraModelId: 'khmer-character-v1', // Consistent character LoRA
      prompt: visualPrompt,
      negativePrompt,
      aspects: character.visualTraits,
      expressions: generateExpressionPrompts(character),
      poses: generatePosePrompts(character),
      voiceProfile,
    };
  }

  function buildVisualPrompt(character: CharacterBibleEntry, visualStyleParams: VisualStyleParams): string {
    const styleModifiers = [
      visualStyleParams.lighting ? `lighting: ${visualStyleParams.lighting}` : '',
      visualStyleParams.texture ? `texture: ${visualStyleParams.texture}` : '',
      visualStyleParams.composition ? `composition: ${visualStyleParams.composition}` : '',
      visualStyleParams.mood ? `mood: ${visualStyleParams.mood}` : '',
      visualStyleParams.cameraStyle ? `camera: ${visualStyleParams.cameraStyle}` : '',
      `color palette: ${visualStyleParams.colorPalette.join(', ')}`,
    ].filter(Boolean).join(', ');

    const traits = [
      character.visualTraits.ageRange,
      character.visualTraits.gender,
      character.visualTraits.ethnicity,
      ...character.visualTraits.distinctiveFeatures,
      character.archetype,
      ...character.personality,
    ].filter(Boolean).join(', ');

    return `Khmer character portrait, ${traits}, traditional Khmer clothing, detailed face, expressive eyes, high quality, masterpiece, ${styleModifiers}`;
  }

  function buildNegativePrompt(): string {
    return 'low quality, blurry, distorted, deformed, ugly, bad anatomy, extra limbs, missing limbs, watermark, text, signature, blurry background, low resolution, pixelated, western features, non-khmer clothing';
  }

  function generateExpressionPrompts(character: CharacterBibleEntry): Record<string, string> {
    const baseExpressions = {
      neutral: 'calm expression, relaxed face, natural gaze',
      happy: 'genuine smile, bright eyes, slight cheek raise',
      sad: 'downcast eyes, slight frown, tearful',
      angry: 'furrowed brow, narrowed eyes, tense jaw',
      fearful: 'wide eyes, raised eyebrows, open mouth',
      surprised: 'raised eyebrows, wide eyes, open mouth',
      whisper: 'slightly parted lips, leaning forward',
      shouting: 'open mouth wide, tense neck, intense eyes',
    };

    // Customize based on personality
    const personalized: Record<string, string> = {};
    for (const [emotion, prompt] of Object.entries(baseExpressions)) {
      personalized[emotion] = `${prompt}, ${character.personality.join(', ')} personality`;
    }
    return personalized;
  }

  function generatePosePrompts(character: CharacterBibleEntry): Record<string, string> {
    return {
      standing: 'standing naturally, weight on one leg, relaxed posture',
      sitting: 'sitting on traditional mat, legs folded, hands on knees',
      walking: 'mid-stride, natural gait, traditional clothing flowing',
      thinking: 'chin on hand, gazing upward, thoughtful expression',
      talking: 'gesturing with hands, engaged expression, open posture',
      praying: 'hands pressed together at chest, eyes closed, serene',
    };
  }

  function assignVoiceProfileByTraits(character: CharacterBibleEntry): VoiceAsset['metadata'] {
    // Map character traits to voice profiles
    const voiceMap: Record<string, VoiceAsset['metadata']> = {
      // Age-based
      'child': { provider: 'edge-tts', voiceId: 'km-KH-PisethNeural', voiceName: 'Piseth', language: 'km', gender: 'male', ageRange: 'child', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['innocent', 'curious'], prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' } },
      'teen': { provider: 'edge-tts', voiceId: 'km-KH-SreymomNeural', voiceName: 'Sreymom', language: 'km', gender: 'female', ageRange: 'teen', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['energetic', 'hopeful'], prosodyDefaults: { speed: 1.1, pitch: 2, emotion: 'neutral' } },
      'young-adult': { provider: 'voxcpm2', voiceId: 'voxcpm2_default', voiceName: 'VoxCPM2 Default', language: 'km', gender: 'neutral', ageRange: 'young-adult', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['determined', 'warm'], prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' } },
      'adult': { provider: 'voxcpm2', voiceId: 'voxcpm2_training_reader', voiceName: 'VoxCPM2 Reader', language: 'km', gender: 'neutral', ageRange: 'adult', style: 'narrator', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['authoritative', 'wise'], prosodyDefaults: { speed: 0.9, pitch: -2, emotion: 'neutral' } },
      'senior': { provider: 'edge-tts', voiceId: 'km-KH-PisethNeural', voiceName: 'Piseth', language: 'km', gender: 'male', ageRange: 'senior', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['wise', 'gentle'], prosodyDefaults: { speed: 0.8, pitch: -4, emotion: 'neutral' } },

      // Gender-based defaults
      'male': { provider: 'voxcpm2', voiceId: 'voxcpm2_default', voiceName: 'VoxCPM2 Default', language: 'km', gender: 'male', ageRange: 'adult', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['steady', 'confident'], prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' } },
      'female': { provider: 'edge-tts', voiceId: 'km-KH-SreymomNeural', voiceName: 'Sreymom', language: 'km', gender: 'female', ageRange: 'adult', style: 'conversational', sampleUrl: null, isCloned: false, sourceAudioRef: null, traits: ['warm', 'nurturing'], prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' } },
    };

    const ageRange = character.visualTraits?.ageRange || 'young-adult';
    const gender = character.visualTraits?.gender || 'neutral';

    return voiceMap[ageRange] || voiceMap[gender] || {
      provider: 'voxcpm2',
      voiceId: 'voxcpm2_default',
      voiceName: 'VoxCPM2 Default',
      language: 'km',
      gender: 'neutral',
      ageRange: 'adult',
      style: 'conversational',
      sampleUrl: null,
      isCloned: false,
      sourceAudioRef: null,
      traits: ['neutral', 'balanced'],
      prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' },
    };
  }

  // =========================================================================
  // ASSET CREATION
  // =========================================================================

  async function createCharacterAsset(jobId: string, character: CharacterBibleEntry, visualDesign: any): Promise<any> {
    return {
      id: `char_${nanoid()}`,
      projectId: jobId,
      type: 'character',
      name: character.name,
      description: `${character.role} - ${character.archetype}`,
      tags: ['character', character.role, ...character.personality],
      metadata: {
        visualDesign: {
          seed: visualDesign.seed,
          controlNetRefs: visualDesign.controlNetRefs,
          loraModelId: visualDesign.loraModelId,
          prompt: visualDesign.prompt,
          negativePrompt: visualDesign.negativePrompt,
          aspects: character.visualTraits,
          expressions: visualDesign.expressions,
          poses: visualDesign.poses,
        },
        voiceProfile: visualDesign.voiceProfile,
        animationRig: 'stickman',
        role: character.role,
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function createVisualStyleAsset(jobId: string, params: VisualStyleParams): Promise<any> {
    return {
      id: `style_${nanoid()}`,
      projectId: jobId,
      type: 'visual-style',
      name: 'Project Visual Style',
      description: 'Extracted from storyline / defined by user',
      tags: ['visual-style', 'project'],
      metadata: {
        params,
        sourceImageRef: null,
        exampleImages: [],
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  function nanoid(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================

  return {
    generateCharacters,
    generateCharacterVisualDesign,
    createCharacterAsset,
    createVisualStyleAsset,
  };
}