import { nanoid } from 'nanoid';
import { z } from 'zod/v3';
import type {
  StorylineInput,
  StorylineOutput,
  VisualStyleParams,
} from '@vishnucreator/protocol';
import type { ModelGatewayClient } from './model-gateway.js';
import { createVisualStyleExtractor, type VisualStyleExtractor } from './visual-style-extractor.js';

/**
 * Storyline Generator (Phase 9 — Task T9.2)
 *
 * Implements:
 * 1. LLM prompt templates (Topic → Outline → Character Bible → Script).
 * 2. Character bible extraction (names, roles, archetypes, motivations, voice/visual profiles).
 * 3. Khmer cultural rules integration (natural spoken Khmer, punctuation, authentic archetypes).
 * 4. Zod JSON schemas for strict validation and resilient parsing.
 */

// ============================================================================
// Khmer Cultural & Linguistic Guidelines
// ============================================================================

export const KHMER_STORYLINE_RULES = `KHMER SCRIPT & DIALOGUE RULES:
1. Natural Spoken Khmer: Use realistic, authentic spoken Khmer suited for oral delivery, not stiff literary or archaic Pali.
2. No Inter-Word Spaces: Khmer is unicameral with continuous script. NEVER insert ASCII or synthetic spaces between words inside a clause.
3. Sentence Punctuation: Every sentence MUST end with the Khmer full stop '។' (Khan). Place a single space after '។' when continuing.
4. Coeng Subscript Consonants: U+17D2 subscripts must remain strictly attached to their base consonants.
5. No Invisible Characters: NEVER insert Zero-Width Space (U+200B) or byte-order marks.
6. Numbers: Always write numbers using standard Arabic numerals (1, 2, 3) for clean TTS synthesis.
7. Respectful Forms of Address: Use natural Cambodian honorifics: លោកពូ, អ្នកមីង, បង, អូន, ព្រះតេជគុណ (for monks), យាយ, តា.
8. Cultural Archetypes: Favor authentic motifs (Angkorian stone heritage, Tonle Sap water life, Krama scarves, rural pagodas, folktales like Judge Rabbit / សុភាទន្សាយ).`;

// ============================================================================
// Zod Validation Schemas
// ============================================================================

export const EmotionalArcEnum = z.enum([
  'setup',
  'inciting',
  'rising',
  'climax',
  'falling',
  'resolution',
]);

export const StorylineBeatSchema = z.object({
  beatNumber: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  emotionalArc: EmotionalArcEnum,
  estimatedDurationSeconds: z.number().positive(),
});

export const StorylineActSchema = z.object({
  actNumber: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  beats: z.array(StorylineBeatSchema).min(1),
});

export const StorylineOutlineSchema = z.object({
  acts: z.array(StorylineActSchema).min(1),
  totalEstimatedDurationSeconds: z.number().positive(),
});

export const CharacterRoleEnum = z.enum([
  'protagonist',
  'antagonist',
  'supporting',
  'narrator',
  'extra',
]);

export const CharacterArcEnum = z.enum([
  'positive',
  'negative',
  'flat',
  'corruption',
  'redemption',
]);

export const CharacterRelationshipTypeEnum = z.enum([
  'ally',
  'enemy',
  'mentor',
  'romantic',
  'family',
  'rival',
]);

export const CharacterBibleItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: CharacterRoleEnum,
  archetype: z.string().min(1),
  personality: z.array(z.string()).min(1),
  motivation: z.string().min(1),
  conflict: z.string().min(1),
  arc: CharacterArcEnum,
  voiceTraits: z.array(z.string()).min(1),
  visualTraits: z.object({
    ageRange: z.string(),
    gender: z.string(),
    ethnicity: z.string(),
    distinctiveFeatures: z.array(z.string()),
  }),
  relationships: z.array(
    z.object({
      targetCharacterId: z.string(),
      type: CharacterRelationshipTypeEnum,
      dynamic: z.string(),
    })
  ),
});

export const DialogueEmotionEnum = z.enum([
  'neutral',
  'happy',
  'sad',
  'angry',
  'fearful',
  'surprised',
  'whisper',
  'shouting',
]);

export const DialogueItemSchema = z.object({
  characterId: z.string().min(1),
  text: z.string().min(1),
  emotion: DialogueEmotionEnum,
  subtext: z.string().optional(),
});

export const ScriptSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  actNumber: z.number().int().positive(),
  beatNumber: z.number().int().positive(),
  location: z.string().min(1),
  timeOfDay: z.string().min(1),
  characters: z.array(z.string()),
  action: z.string().min(1),
  dialogue: z.array(DialogueItemSchema),
  cameraNotes: z.string().min(1),
  estimatedDurationSeconds: z.number().positive(),
  visualReferences: z.array(z.string()),
});

export const VisualStyleParamsSchema = z.object({
  colorPalette: z.array(z.string()).min(1),
  lighting: z.enum(['natural', 'dramatic', 'soft', 'high-contrast', 'cinematic']),
  texture: z.enum(['smooth', 'film-grain', 'watercolor', 'cel-shaded', 'sketch']),
  composition: z.enum(['rule-of-thirds', 'centered', 'symmetrical', 'dynamic']),
  mood: z.enum(['warm', 'cool', 'neutral', 'vibrant', 'muted', 'dark', 'bright']),
  cameraStyle: z.enum(['static', 'handheld', 'dolly', 'crane', 'drone']),
  khmerAesthetic: z.enum(['traditional', 'modern', 'fusion', 'folk-art']).optional(),
});

export const StorylineOutputSchema = z.object({
  outline: StorylineOutlineSchema,
  characterBible: z.array(CharacterBibleItemSchema).min(1),
  script: z.array(ScriptSceneSchema).min(1),
  visualStyleParams: VisualStyleParamsSchema,
  culturalNotes: z.array(z.string()),
});

// ============================================================================
// Text Normalization & Khmer Cleaning
// ============================================================================

export function cleanAndNormalizeKhmerText(text: string): string {
  if (!text) return '';
  // Remove zero-width spaces, BOM, and strange invisible control codes
  let cleaned = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  // Collapse multiple spaces into single space
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  // If text contains Khmer characters and doesn't end with Khmer full stop or punctuation, append ។
  const hasKhmer = /[\u1780-\u17FF]/.test(cleaned);
  if (hasKhmer && !/[។៕!?]$/.test(cleaned)) {
    cleaned += '។';
  }

  return cleaned;
}

// ============================================================================
// Prompt Templates
// ============================================================================

export function buildStorylineSystemPrompt(input: StorylineInput, resolvedStyle: VisualStyleParams): string {
  const isKhmer = input.targetLanguage === 'km' || input.culturalContext === 'khmer';

  return `You are an elite Cambodian screenwriter, director, and dramatist specializing in animated and cinematic storytelling.
Your task is to transform a high-level topic or folktale idea into a complete, ready-to-produce Storyline Package.

CRITICAL FORMAT REQUIREMENT:
You MUST respond with valid JSON ONLY. No conversational preamble, no markdown outer quotes, strictly valid JSON.

AESTHETIC STYLE PROFILE:
- Aesthetic: ${resolvedStyle.khmerAesthetic || 'traditional'} Khmer
- Lighting: ${resolvedStyle.lighting}
- Texture: ${resolvedStyle.texture}
- Mood: ${resolvedStyle.mood}
- Palette: ${resolvedStyle.colorPalette.join(', ')}

${isKhmer ? KHMER_STORYLINE_RULES : ''}
${input.customCulturalRules ? `CUSTOM USER RULES:\n${input.customCulturalRules}` : ''}

JSON STRUCTURE REQUIRED:
{
  "outline": {
    "acts": [
      {
        "actNumber": 1,
        "title": "Act Title",
        "summary": "Act Summary",
        "beats": [
          {
            "beatNumber": 1,
            "title": "Beat Title",
            "description": "Beat Description",
            "emotionalArc": "setup",
            "estimatedDurationSeconds": 20
          }
        ]
      }
    ],
    "totalEstimatedDurationSeconds": 60
  },
  "characterBible": [
    {
      "id": "char-1",
      "name": "Character Name",
      "role": "protagonist",
      "archetype": "Trickster / Hero",
      "personality": ["trait1", "trait2"],
      "motivation": "Core desire",
      "conflict": "Major challenge",
      "arc": "positive",
      "voiceTraits": ["warm", "lighthearted"],
      "visualTraits": {
        "ageRange": "young adult",
        "gender": "male",
        "ethnicity": "Khmer",
        "distinctiveFeatures": ["traditional krama", "alert eyes"]
      },
      "relationships": []
    }
  ],
  "script": [
    {
      "sceneNumber": 1,
      "actNumber": 1,
      "beatNumber": 1,
      "location": "Location name",
      "timeOfDay": "morning",
      "characters": ["char-1"],
      "action": "Visual scene description and character blocking.",
      "dialogue": [
        {
          "characterId": "char-1",
          "text": "Khmer dialogue text here ending with ។",
          "emotion": "happy"
        }
      ],
      "cameraNotes": "Camera movement and shot type",
      "estimatedDurationSeconds": 15,
      "visualReferences": []
    }
  ],
  "visualStyleParams": {
    "colorPalette": ${JSON.stringify(resolvedStyle.colorPalette)},
    "lighting": "${resolvedStyle.lighting}",
    "texture": "${resolvedStyle.texture}",
    "composition": "${resolvedStyle.composition}",
    "mood": "${resolvedStyle.mood}",
    "cameraStyle": "${resolvedStyle.cameraStyle}",
    "khmerAesthetic": "${resolvedStyle.khmerAesthetic || 'traditional'}"
  },
  "culturalNotes": [
    "Authentic note on cultural accuracy and setting details"
  ]
}`;
}

export function buildStorylineUserPrompt(input: StorylineInput): string {
  const targetDuration = input.targetDurationSeconds || 60;
  return `Generate the complete Storyline Package for:
Topic: "${input.topic}"
Target Language: "${input.targetLanguage}"
Target Total Duration: ≈${targetDuration} seconds
Format Style: ${input.style}
Cultural Context: ${input.culturalContext || 'khmer'}
${input.referenceStoryId ? `Reference Story ID: ${input.referenceStoryId}` : ''}

Remember: Output valid JSON only, with complete outline, character bible, and full scripted dialogue.`;
}

// ============================================================================
// Parsing & Fallback Repair
// ============================================================================

export function parseStorylineResponse(
  rawText: string,
  input: StorylineInput,
  resolvedStyle: VisualStyleParams
): StorylineOutput {
  let parsed: unknown = null;

  try {
    // Extract JSON block from markdown code fences or brace bounding
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidateJson = fenceMatch ? fenceMatch[1]!.trim() : rawText.trim();

    const jsonMatch = candidateJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    // Parsing error; parsed remains null
  }

  // Validate with Zod
  const validation = StorylineOutputSchema.safeParse(parsed);
  if (validation.success) {
    const data = validation.data;
    // Normalize all dialogue texts
    for (const scene of data.script) {
      for (const d of scene.dialogue) {
        d.text = cleanAndNormalizeKhmerText(d.text);
      }
    }
    return data;
  }

  // If validation failed, build a high-fidelity default fallback based on topic and input
  return createFallbackStoryline(input, resolvedStyle);
}

export function createFallbackStoryline(
  input: StorylineInput,
  resolvedStyle: VisualStyleParams
): StorylineOutput {
  const charId = `char-${nanoid(6)}`;
  const title = input.topic || 'រឿងព្រេងខ្មែរ (Khmer Folktale)';

  return {
    outline: {
      acts: [
        {
          actNumber: 1,
          title: 'ការចាប់ផ្តើម (The Beginning)',
          summary: `សេចក្តីផ្តើមនៃដំណើររឿងអំពី ${title}`,
          beats: [
            {
              beatNumber: 1,
              title: 'ការបើកឆាក (Opening Scene)',
              description: `ការណែនាំតួអង្គនិងទីកន្លែងនៃ ${title}`,
              emotionalArc: 'setup',
              estimatedDurationSeconds: 20,
            },
            {
              beatNumber: 2,
              title: 'ការជួបឧបសគ្គ (Inciting Incident)',
              description: 'ការប្រឈមមុខនឹងបញ្ហាដំបូង',
              emotionalArc: 'inciting',
              estimatedDurationSeconds: 25,
            },
            {
              beatNumber: 3,
              title: 'ដំណោះស្រាយ (Resolution)',
              description: 'ការបញ្ចប់ដោយសេចក្តីសុខនិងការយល់ដឹង',
              emotionalArc: 'resolution',
              estimatedDurationSeconds: 15,
            },
          ],
        },
      ],
      totalEstimatedDurationSeconds: input.targetDurationSeconds || 60,
    },
    characterBible: [
      {
        id: charId,
        name: 'សុផល (Sophal)',
        role: 'protagonist',
        archetype: 'Wise Youth',
        personality: ['kind', 'alert', 'resourceful'],
        motivation: 'Protect the village and elders',
        conflict: 'Facing unexpected nature challenges',
        arc: 'positive',
        voiceTraits: ['warm', 'narrative', 'calm'],
        visualTraits: {
          ageRange: '20-25',
          gender: 'male',
          ethnicity: 'Khmer',
          distinctiveFeatures: ['cotton krama around shoulders', 'friendly smile'],
        },
        relationships: [],
      },
    ],
    script: [
      {
        sceneNumber: 1,
        actNumber: 1,
        beatNumber: 1,
        location: 'ភូមិខ្មែរបុរាណក្បែរបឹង (Ancient Village by the Lake)',
        timeOfDay: 'morning',
        characters: [charId],
        action: 'សុផលដើរកាត់វាលស្រែខៀវស្រងាត់ក្រោមពន្លឺព្រះអាទិត្យពេលព្រឹក។',
        dialogue: [
          {
            characterId: charId,
            text: cleanAndNormalizeKhmerText('ថ្ងៃនេះជាថ្ងៃល្អសម្រាប់ការចេញដំណើរ។'),
            emotion: 'happy',
          },
        ],
        cameraNotes: 'Wide panoramic establishing crane shot slowly moving down',
        estimatedDurationSeconds: 20,
        visualReferences: [],
      },
      {
        sceneNumber: 2,
        actNumber: 1,
        beatNumber: 2,
        location: 'ក្រោមដើមពោធិ៍ធំ (Under the Great Bodhi Tree)',
        timeOfDay: 'afternoon',
        characters: [charId],
        action: 'សុផលឈប់សម្រាកនិងពិចារណាពីទិសដៅបន្ត។',
        dialogue: [
          {
            characterId: charId,
            text: cleanAndNormalizeKhmerText('យើងត្រូវតែមានចិត្តអំណត់និងបញ្ញាជានិច្ច។'),
            emotion: 'neutral',
          },
        ],
        cameraNotes: 'Medium close-up focusing on facial expression',
        estimatedDurationSeconds: 25,
        visualReferences: [],
      },
      {
        sceneNumber: 3,
        actNumber: 1,
        beatNumber: 3,
        location: 'វត្តអារាមលើភ្នំ (Hilltop Pagoda)',
        timeOfDay: 'golden-hour',
        characters: [charId],
        action: 'សុផលឡើងដល់វត្តអារាមដោយក្តីសប្បាយរីករាយ។',
        dialogue: [
          {
            characterId: charId,
            text: cleanAndNormalizeKhmerText('ទីបំផុត យើងបានមកដល់ទីស្ងប់សុខហើយ។'),
            emotion: 'happy',
          },
        ],
        cameraNotes: 'Wide sunset shot with golden temple silhouette',
        estimatedDurationSeconds: 15,
        visualReferences: [],
      },
    ],
    visualStyleParams: resolvedStyle,
    culturalNotes: [
      'Authentic depiction of Cambodian rural culture and pagoda etiquette',
      'Natural spoken Khmer without inter-word spacing and properly punctuated with ។',
    ],
  };
}

// ============================================================================
// Storyline Generator Engine
// ============================================================================

export interface StorylineGeneratorOptions {
  modelGateway: ModelGatewayClient;
  styleExtractor?: VisualStyleExtractor;
}

export type StorylineGenerator = ReturnType<typeof createStorylineGenerator>;

export function createStorylineGenerator(options: StorylineGeneratorOptions) {
  const { modelGateway } = options;
  const styleExtractor = options.styleExtractor || createVisualStyleExtractor();

  async function generate(input: StorylineInput): Promise<StorylineOutput> {
    const resolvedStyle = styleExtractor.resolveStyleParams(input.style);
    const systemPrompt = buildStorylineSystemPrompt(input, resolvedStyle);
    const userPrompt = buildStorylineUserPrompt(input);

    try {
      const response = await modelGateway.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 4000,
      });

      return parseStorylineResponse(response.content, input, resolvedStyle);
    } catch (err) {
      // In case of provider error or offline mode, produce validated fallback
      return createFallbackStoryline(input, resolvedStyle);
    }
  }

  function validate(candidate: unknown): { valid: boolean; errors: string[]; output?: StorylineOutput } {
    const result = StorylineOutputSchema.safeParse(candidate);
    if (result.success) {
      return { valid: true, errors: [], output: result.data };
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return { valid: false, errors };
  }

  async function refineScene(
    scene: StorylineOutput['script'][number],
    instructions: string,
    targetLanguage: string = 'km'
  ): Promise<StorylineOutput['script'][number]> {
    const prompt = `Refine this scene according to the instructions.
Instructions: "${instructions}"
Current Scene: ${JSON.stringify(scene)}
${targetLanguage === 'km' ? KHMER_STORYLINE_RULES : ''}

Output strictly valid JSON matching the ScriptSceneSchema:
{
  "sceneNumber": ${scene.sceneNumber},
  "actNumber": ${scene.actNumber},
  "beatNumber": ${scene.beatNumber},
  "location": "...",
  "timeOfDay": "...",
  "characters": [...],
  "action": "...",
  "dialogue": [...],
  "cameraNotes": "...",
  "estimatedDurationSeconds": ...,
  "visualReferences": [...]
}`;

    try {
      const response = await modelGateway.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a script doctor and scene polisher. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      });

      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const validation = ScriptSceneSchema.safeParse(parsed);
        if (validation.success) {
          const refined = validation.data;
          for (const d of refined.dialogue) {
            d.text = cleanAndNormalizeKhmerText(d.text);
          }
          return refined;
        }
      }
    } catch {
      // Return original on error
    }

    return scene;
  }

  return {
    generate,
    validate,
    refineScene,
    cleanAndNormalizeKhmerText,
    buildStorylineSystemPrompt,
    buildStorylineUserPrompt,
    parseStorylineResponse,
    createFallbackStoryline,
  };
}
