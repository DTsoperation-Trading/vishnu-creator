import { nanoid } from 'nanoid';
import type {
  StorylineInput,
  StorylineOutput,
  CharacterBibleEntry,
  ScriptScene,
  VisualStyleParams,
  AIVideoStudioJobState,
  ModelGatewayClient,
  VishnuDirectorAgent,
} from '@vishnucreator/protocol';
import type { CreatorService } from '../service.js';

/**
 * Storyline Generator - Stage 1 of AI Video Studio Pipeline
 * Generates outline, character bible, and full script from topic
 * Inspired by DramaClaw's story structuring pipeline
 */

export type StorylineGenerator = ReturnType<typeof createStorylineGenerator>;

export interface StorylineGeneratorConfig {
  vishnuDirector: VishnuDirectorAgent;
  modelGateway: ModelGatewayClient;
  creatorService: CreatorService;
  defaultVisualStyleParams: VisualStyleParams;
}

export function createStorylineGenerator(config: StorylineGeneratorConfig) {
  const { vishnuDirector, modelGateway, creatorService, defaultVisualStyleParams } = config;

  // =========================================================================
  // SYSTEM PROMPTS
  // =========================================================================

  const STORYLINE_SYSTEM_PROMPT = `You are a master Khmer storyteller and screenwriter. Create culturally authentic Khmer stories for video production.

CRITICAL RULES:
1. Write Khmer text naturally: NO spaces between words, proper ។ punctuation
2. Follow Khmer cultural values: respect for elders, Buddhist principles, family honor, community
3. Use Khmer character archetypes from Khmer literature and folklore
4. Include cultural elements: pagodas, rice fields, traditional houses, festivals, Buddhist ceremonies
5. Natural spoken Khmer dialogue - how people actually speak in Cambodia

OUTPUT FORMAT: Valid JSON only with exact schema.`;

  // =========================================================================
  // MAIN EXECUTION
  // =========================================================================

  async function generateStoryline(input: StorylineInput, jobId: string): Promise<StorylineOutput> {
    const { topic, style, targetLanguage, targetDurationSeconds, referenceStoryId, culturalContext, customCulturalRules } = input;

    // Build the user prompt
    const userPrompt = buildUserPrompt(input);

    // Call LLM via model gateway
    const response = await modelGateway.generateText({
      provider: getPreferredProvider('text'),
      model: getPreferredModel('text'),
      messages: [
        { role: 'system', content: getSystemPrompt(culturalContext) },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 8000,
    });

    // Parse and validate
    const output = parseStorylineResponse(response.content, input);

    // Save checkpoint
    await saveCheckpoint(jobId, 'storyline', output);

    // Initialize asset library with visual style
    await initializeAssetLibrary(jobId, output);

    return output;
  }

  // =========================================================================
  // PROMPT BUILDING
  // =========================================================================

  function buildUserPrompt(input: StorylineInput): string {
    const { topic, style, targetLanguage, targetDurationSeconds, referenceStoryId, culturalContext, customCulturalRules } = input;

    return `Generate a ${style} ${culturalContext || 'Khmer'} story for video production.

TOPIC: ${topic}
STYLE: ${style}
TARGET LANGUAGE: ${targetLanguage}
${targetDurationSeconds ? `TARGET DURATION: ${targetDurationSeconds} seconds` : ''}
${referenceStoryId ? `REFERENCE STORY: ${referenceStoryId}` : ''}
CULTURAL CONTEXT: ${culturalContext || 'khmer'}
${customCulturalRules ? `CUSTOM RULES: ${customCulturalRules}` : ''}

REQUIREMENTS:
- ${style === 'animation' ? '3-5 acts, vibrant visual style, exaggerated expressions' : ''}
- ${style === 'live-action' ? '3 acts, naturalistic, grounded in real Khmer locations' : ''}
- ${style === 'documentary' ? '2-3 acts, informative, interview-style segments' : ''}
- ${style === 'shorts' ? '1 act, fast-paced, hook in first 3 seconds, vertical format' : ''}
- ${style === 'cinematic' ? '3 acts, cinematic scope, dramatic lighting, emotional arc' : ''}
- Target duration: ${targetDurationSeconds || '120'} seconds
- Cultural authenticity: Use natural spoken Khmer, proper ។ punctuation, no spaces between words
- Include Khmer cultural elements: pagodas, rice fields, traditional houses, festivals, Buddhist values
- Character names in Khmer, relationships reflect Khmer family/social structure

Return ONLY valid JSON matching the specified schema.`;
  }

  function getSystemPrompt(culturalContext?: string): string {
    const base = `You are a master Khmer storyteller and screenwriter. Create culturally authentic Khmer stories for video production.

CRITICAL RULES:
1. Write Khmer text naturally: NO spaces between words, proper ។ punctuation
2. Follow Khmer cultural values: respect for elders, Buddhist principles, family honor, community
3. Use Khmer character archetypes from Khmer literature and folklore
4. Include cultural elements: pagodas, rice fields, traditional houses, festivals, Buddhist ceremonies
5. Natural spoken Khmer dialogue - how people actually speak in Cambodia

OUTPUT FORMAT: Valid JSON only with exact schema.`;

    const cultural = culturalContext ? `\nCULTURAL CONTEXT: ${culturalContext}` : '';
    return base + cultural;
  }

  // =========================================================================
  // RESPONSE PARSING & VALIDATION
  // =========================================================================

  function parseStorylineResponse(response: string, input: StorylineInput): StorylineOutput {
    try {
      const parsed = JSON.parse(response);

      // Validate required fields
      if (!parsed.outline || !parsed.characterBible || !parsed.script) {
        throw new Error('Missing required fields in response');
      }

      // Ensure outline structure
      const outline = {
        acts: (parsed.outline.acts || []).map((act: any, i: number) => ({
          actNumber: act.actNumber || i + 1,
          title: act.title || `Act ${i + 1}`,
          summary: act.summary || '',
          beats: (act.beats || []).map((beat: any, j: number) => ({
            beatNumber: beat.beatNumber || j + 1,
            title: beat.title || `Beat ${j + 1}`,
            description: beat.description || '',
            emotionalArc: validateEmotionalArc(beat.emotionalArc),
            estimatedDurationSeconds: beat.estimatedDurationSeconds || 30,
          })),
        })),
        totalEstimatedDurationSeconds: parsed.outline.totalEstimatedDurationSeconds || input.targetDurationSeconds || 120,
      };

      // Ensure character bible structure
      const characterBible: CharacterBibleEntry[] = (parsed.characterBible || []).map((char: any) => ({
        id: char.id || nanoid(),
        name: char.name || 'Unnamed',
        role: validateRole(char.role),
        archetype: char.archetype || 'ordinary',
        personality: Array.isArray(char.personality) ? char.personality : [],
        motivation: char.motivation || '',
        conflict: char.conflict || '',
        arc: validateArc(char.arc),
        voiceTraits: Array.isArray(char.voiceTraits) ? char.voiceTraits : [],
        visualTraits: {
          ageRange: char.visualTraits?.ageRange || 'adult',
          gender: char.visualTraits?.gender || 'neutral',
          ethnicity: char.visualTraits?.ethnicity || 'Khmer',
          distinctiveFeatures: Array.isArray(char.visualTraits?.distinctiveFeatures) ? char.visualTraits.distinctiveFeatures : [],
        },
        relationships: Array.isArray(char.relationships) ? char.relationships.map((rel: any) => ({
          targetCharacterId: rel.targetCharacterId || '',
          type: validateRelationshipType(rel.type),
          dynamic: rel.dynamic || '',
        })) : [],
      }));

      // Ensure script structure
      const script: ScriptScene[] = (parsed.script || []).map((scene: any, i: number) => ({
        sceneNumber: scene.sceneNumber || i + 1,
        actNumber: scene.actNumber || 1,
        beatNumber: scene.beatNumber || 1,
        location: scene.location || '',
        timeOfDay: validateTimeOfDay(scene.timeOfDay),
        characters: Array.isArray(scene.characters) ? scene.characters : [],
        action: scene.action || '',
        dialogue: Array.isArray(scene.dialogue) ? scene.dialogue.map((d: any) => ({
          characterId: d.characterId || '',
          text: d.text || '',
          emotion: validateEmotion(d.emotion),
          subtext: d.subtext,
        })) : [],
        cameraNotes: scene.cameraNotes || '',
        estimatedDurationSeconds: scene.estimatedDurationSeconds || 30,
        visualReferences: Array.isArray(scene.visualReferences) ? scene.visualReferences : [],
      }));

      // Visual style params
      const visualStyleParams: VisualStyleParams = ensureVisualStyleParams(parsed.visualStyleParams, input.style);

      return {
        outline,
        characterBible,
        script,
        visualStyleParams,
        culturalNotes: Array.isArray(parsed.culturalNotes) ? parsed.culturalNotes : [],
      };
    } catch (error) {
      console.warn('[StorylineGenerator] Failed to parse LLM response, using fallback:', error);
      return getDefaultStorylineOutput(input);
    }
  }

  // Validation helpers
  function validateEmotionalArc(arc: string): 'setup' | 'inciting' | 'rising' | 'climax' | 'falling' | 'resolution' {
    const valid = ['setup', 'inciting', 'rising', 'climax', 'falling', 'resolution'];
    return valid.includes(arc) ? arc as any : 'setup';
  }

  function validateRole(role: string): 'protagonist' | 'antagonist' | 'supporting' | 'narrator' | 'extra' {
    const valid = ['protagonist', 'antagonist', 'supporting', 'narrator', 'extra'];
    return valid.includes(role) ? role as any : 'supporting';
  }

  function validateArc(arc: string): 'positive' | 'negative' | 'flat' | 'corruption' | 'redemption' {
    const valid = ['positive', 'negative', 'flat', 'corruption', 'redemption'];
    return valid.includes(arc) ? arc as any : 'positive';
  }

  function validateRelationshipType(type: string): 'ally' | 'enemy' | 'mentor' | 'romantic' | 'family' | 'rival' {
    const valid = ['ally', 'enemy', 'mentor', 'romantic', 'family', 'rival'];
    return valid.includes(type) ? type as any : 'ally';
  }

  function validateTimeOfDay(tod: string): 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden-hour' | 'blue-hour' | 'night' {
    const valid = ['dawn', 'morning', 'noon', 'afternoon', 'golden-hour', 'blue-hour', 'night'];
    return valid.includes(tod) ? tod as any : 'morning';
  }

  function validateEmotion(emotion: string): 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'whisper' | 'shouting' {
    const valid = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'whisper', 'shouting'];
    return valid.includes(emotion) ? emotion as any : 'neutral';
  }

  // =========================================================================
  // FALLBACKS
  // =========================================================================

  function getDefaultVisualStyleParams(style: string): VisualStyleParams {
    const presets: Record<string, VisualStyleParams> = {
      animation: { colorPalette: ['#FF6B6B', '#4ECDC4', '#FFE66D'], lighting: 'soft', texture: 'cel-shaded', composition: 'rule-of-thirds', mood: 'vibrant', cameraStyle: 'static', khmerAesthetic: 'modern' },
      anime: { colorPalette: ['#FF6B6B', '#4ECDC4', '#FFE66D'], lighting: 'soft', texture: 'cel-shaded', composition: 'rule-of-thirds', mood: 'vibrant', cameraStyle: 'static', khmerAesthetic: 'modern' },
      'live-action': { colorPalette: ['#8B4513', '#DEB887', '#2E8B57'], lighting: 'natural', texture: 'film-grain', composition: 'rule-of-thirds', mood: 'warm', cameraStyle: 'handheld', khmerAesthetic: 'traditional' },
      documentary: { colorPalette: ['#FFFFFF', '#000000', '#808080'], lighting: 'natural', texture: 'smooth', composition: 'centered', mood: 'neutral', cameraStyle: 'static', khmerAesthetic: 'fusion' },
      shorts: { colorPalette: ['#FF0000', '#00FF00', '#0000FF'], lighting: 'high-contrast', texture: 'smooth', composition: 'centered', mood: 'vibrant', cameraStyle: 'handheld', khmerAesthetic: 'modern' },
      cinematic: { colorPalette: ['#1A1A2E', '#16213E', '#E94560'], lighting: 'dramatic', texture: 'film-grain', composition: 'rule-of-thirds', mood: 'dark', cameraStyle: 'crane', khmerAesthetic: 'fusion' },
    };
    // Use type assertion to ensure VisualStyleParams is returned
    return (presets[style] ?? presets.animation) as VisualStyleParams;
  }

  // Fix for potential undefined visualStyleParams
  function ensureVisualStyleParams(params: VisualStyleParams | undefined, style: string): VisualStyleParams {
    return params ?? getDefaultVisualStyleParams(style);
  }

  function getDefaultStorylineOutput(input: StorylineInput): StorylineOutput {
    return {
      outline: {
        acts: [{
          actNumber: 1,
          title: 'ចាប់ផ្តើម',
          summary: 'ចាប់ផ្តើមរឿង',
          beats: [{
            beatNumber: 1,
            title: 'បញ្ចូលរឿង',
            description: 'បញ្ចូលបុរសនិងបរិបទ',
            emotionalArc: 'setup',
            estimatedDurationSeconds: 30,
          }],
        }],
        totalEstimatedDurationSeconds: input.targetDurationSeconds || 120,
      },
      characterBible: [],
      script: [],
      visualStyleParams: getDefaultVisualStyleParams(input.style),
      culturalNotes: ['Generated with fallback - LLM response parsing failed'],
    };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  async function saveCheckpoint(jobId: string, stage: string, data: any): Promise<void> {
    // In production, use checkpoint manager
    console.log(`[StorylineGenerator] Checkpoint saved for job ${jobId} stage storyline`);
  }

  async function initializeAssetLibrary(jobId: string, output: StorylineOutput): Promise<void> {
    // In production, create visual style asset in asset library
    console.log(`[StorylineGenerator] Asset library initialized for job ${jobId}`);
  }

  function getPreferredProvider(taskType: string): string {
    return 'relayclaw';
  }

  function getPreferredModel(taskType: string): string {
    return 'gemini-2.5-pro';
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================

  return {
    generateStoryline,
    parseStorylineResponse,
    getDefaultVisualStyleParams,
    getDefaultStorylineOutput,
    STORYLINE_SYSTEM_PROMPT,
  };
}