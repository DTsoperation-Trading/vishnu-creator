import { describe, it, expect, vi } from 'vitest';
import {
  createStorylineGenerator,
  cleanAndNormalizeKhmerText,
  StorylineOutputSchema,
  KHMER_STORYLINE_RULES,
} from '../../src/creator/ai-video-studio/storyline-generator.js';
import {
  createModelGatewayClient,
  createDefaultModelGatewayConfig,
} from '../../src/creator/ai-video-studio/model-gateway.js';

describe('Phase 9 — Task T9.2: Storyline Generator', () => {
  describe('Khmer Text Cleaning & Normalization', () => {
    it('removes zero-width spaces and invisible characters while ensuring punctuation', () => {
      // Contains U+200B (Zero-width space) and missing Khmer full stop
      const rawKhmer = 'ទន្សាយ\u200Bឆ្លាត\u200Bរត់លឿន';
      const cleaned = cleanAndNormalizeKhmerText(rawKhmer);

      expect(cleaned).not.toContain('\u200B');
      expect(cleaned.endsWith('។')).toBe(true);
      expect(cleaned).toBe('ទន្សាយឆ្លាតរត់លឿន។');
    });

    it('does not double punctuation if text already ends with ។ or ៕', () => {
      const text1 = 'ថ្ងៃនេះជាថ្ងៃល្អ។';
      const cleaned1 = cleanAndNormalizeKhmerText(text1);
      expect(cleaned1).toBe('ថ្ងៃនេះជាថ្ងៃល្អ។');

      const text2 = 'ចប់បរិបូណ៌៕';
      const cleaned2 = cleanAndNormalizeKhmerText(text2);
      expect(cleaned2).toBe('ចប់បរិបូណ៌៕');
    });

    it('preserves Khmer Coeng (U+17D2) subscript consonants', () => {
      // 'ខ្ញុំ' has base ខ (U+1781) + coeng (U+17D2) + ញ (U+1789) + vowel ុំ (U+17BB U+17C6)
      const text = 'ខ្ញុំស្រឡាញ់ប្រទេសកម្ពុជា។';
      const cleaned = cleanAndNormalizeKhmerText(text);
      expect(cleaned).toBe(text);
      expect(cleaned).toContain('\u17D2');
    });
  });

  describe('Zod Schema Validation', () => {
    it('validates a complete, authentic StorylineOutput', () => {
      const validStoryline = {
        outline: {
          acts: [
            {
              actNumber: 1,
              title: 'ការបើកឆាក (Act 1)',
              summary: 'សេចក្តីផ្តើម',
              beats: [
                {
                  beatNumber: 1,
                  title: 'ជួបគ្នា',
                  description: 'ទន្សាយជួបខ្លា',
                  emotionalArc: 'inciting',
                  estimatedDurationSeconds: 20,
                },
              ],
            },
          ],
          totalEstimatedDurationSeconds: 60,
        },
        characterBible: [
          {
            id: 'char-rabbit',
            name: 'ទន្សាយឆ្លាត (Clever Rabbit)',
            role: 'protagonist',
            archetype: 'Trickster',
            personality: ['clever', 'agile'],
            motivation: 'Survive and outsmart the predator',
            conflict: 'Tiger is hungry',
            arc: 'positive',
            voiceTraits: ['cheerful', 'light'],
            visualTraits: {
              ageRange: 'young',
              gender: 'male',
              ethnicity: 'Khmer',
              distinctiveFeatures: ['krama pattern fur'],
            },
            relationships: [],
          },
        ],
        script: [
          {
            sceneNumber: 1,
            actNumber: 1,
            beatNumber: 1,
            location: 'ព្រៃស្រោងក្បែរបឹង (Deep Jungle by the Lake)',
            timeOfDay: 'morning',
            characters: ['char-rabbit'],
            action: 'ទន្សាយកំពុងរកចំណីដោយក្តីរីករាយ។',
            dialogue: [
              {
                characterId: 'char-rabbit',
                text: 'ថ្ងៃនេះខ្យល់អាកាសល្អណាស់។',
                emotion: 'happy',
              },
            ],
            cameraNotes: 'Establishing wide crane shot panning down',
            estimatedDurationSeconds: 20,
            visualReferences: [],
          },
        ],
        visualStyleParams: {
          colorPalette: ['#8B4513', '#DEB887', '#2E8B57'],
          lighting: 'natural',
          texture: 'watercolor',
          composition: 'rule-of-thirds',
          mood: 'warm',
          cameraStyle: 'static',
          khmerAesthetic: 'folk-art',
        },
        culturalNotes: ['Traditional Khmer folktale motifs'],
      };

      const result = StorylineOutputSchema.safeParse(validStoryline);
      expect(result.success).toBe(true);
    });

    it('rejects invalid storylines with schema errors', () => {
      const invalid = {
        outline: { acts: [] }, // requires at least 1 act
        characterBible: [],
        script: [],
      };
      const result = StorylineOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('StorylineGenerator Generation & Prompts', () => {
    it('generates a full storyline package via Model Gateway and applies Khmer formatting', async () => {
      const mockLlmResponse = JSON.stringify({
        outline: {
          acts: [
            {
              actNumber: 1,
              title: 'ការជួបគ្នាដោយចៃដន្យ (Accidental Encounter)',
              summary: 'ខ្លាចង់ស៊ីទន្សាយ',
              beats: [
                {
                  beatNumber: 1,
                  title: 'ការជួបគ្នា',
                  description: 'ទន្សាយជាប់អន្ទាក់ខ្លា',
                  emotionalArc: 'setup',
                  estimatedDurationSeconds: 30,
                },
              ],
            },
          ],
          totalEstimatedDurationSeconds: 60,
        },
        characterBible: [
          {
            id: 'char-rabbit',
            name: 'ទន្សាយ (Rabbit)',
            role: 'protagonist',
            archetype: 'Trickster',
            personality: ['clever'],
            motivation: 'Escape danger',
            conflict: 'Tiger hunger',
            arc: 'positive',
            voiceTraits: ['light'],
            visualTraits: {
              ageRange: 'young',
              gender: 'male',
              ethnicity: 'Khmer',
              distinctiveFeatures: ['cotton krama'],
            },
            relationships: [],
          },
        ],
        script: [
          {
            sceneNumber: 1,
            actNumber: 1,
            beatNumber: 1,
            location: 'ព្រៃឫស្សី (Bamboo Forest)',
            timeOfDay: 'morning',
            characters: ['char-rabbit'],
            action: 'ទន្សាយឈរក្រោមដើមឫស្សី។',
            dialogue: [
              {
                characterId: 'char-rabbit',
                text: 'ខ្ញុំមិនខ្លាចបងខ្លាឡើយ', // Missing ។ -> should be added
                emotion: 'neutral',
              },
            ],
            cameraNotes: 'Medium shot',
            estimatedDurationSeconds: 20,
            visualReferences: [],
          },
        ],
        visualStyleParams: {
          colorPalette: ['#8B4513', '#DEB887'],
          lighting: 'natural',
          texture: 'film-grain',
          composition: 'rule-of-thirds',
          mood: 'warm',
          cameraStyle: 'static',
          khmerAesthetic: 'traditional',
        },
        culturalNotes: ['Classic Judge Rabbit archetype'],
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: `\`\`\`json\n${mockLlmResponse}\n\`\`\`` } }],
        }),
      }) as unknown as typeof fetch;

      const modelGateway = createModelGatewayClient(createDefaultModelGatewayConfig(), mockFetch);
      const generator = createStorylineGenerator({ modelGateway });

      const result = await generator.generate({
        topic: 'ទន្សាយនិងខ្លា (The Rabbit and the Tiger)',
        style: 'animation',
        targetLanguage: 'km',
        culturalContext: 'khmer',
      });

      expect(result.outline.acts).toHaveLength(1);
      expect(result.characterBible[0]?.name).toBe('ទន្សាយ (Rabbit)');
      // Punctuation normalized:
      expect(result.script[0]?.dialogue[0]?.text).toBe('ខ្ញុំមិនខ្លាចបងខ្លាឡើយ។');
    });

    it('falls back gracefully to authentic Khmer storyline if LLM fails or is offline', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline')) as unknown as typeof fetch;
      const modelGateway = createModelGatewayClient(createDefaultModelGatewayConfig(), mockFetch);
      const generator = createStorylineGenerator({ modelGateway });

      const result = await generator.generate({
        topic: 'រឿងក្អែកនិងកញ្ជ្រោង',
        style: 'animation',
        targetLanguage: 'km',
        culturalContext: 'khmer',
      });

      expect(result.outline.acts.length).toBeGreaterThan(0);
      expect(result.characterBible.length).toBeGreaterThan(0);
      expect(result.script.length).toBeGreaterThan(0);
      expect(result.script[0]?.dialogue[0]?.text.endsWith('។')).toBe(true);
    });

    it('refines an individual scene following user instructions', async () => {
      const originalScene = {
        sceneNumber: 1,
        actNumber: 1,
        beatNumber: 1,
        location: 'ភូមិបុរាណ',
        timeOfDay: 'morning',
        characters: ['char-1'],
        action: 'ដើរតាមផ្លូវ',
        dialogue: [{ characterId: 'char-1', text: 'សួស្តីបងប្អូន។', emotion: 'happy' as const }],
        cameraNotes: 'Static shot',
        estimatedDurationSeconds: 15,
        visualReferences: [],
      };

      const refinedSceneResponse = JSON.stringify({
        ...originalScene,
        action: 'ដើរកាត់វាលស្រែខៀវស្រងាត់ដោយស្នាមញញឹម',
        dialogue: [{ characterId: 'char-1', text: 'ជម្រាបសួរពុកម៉ែបងប្អូន។', emotion: 'happy' }],
        cameraNotes: 'Cinematic tracking shot pushing forward',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: refinedSceneResponse } }],
        }),
      }) as unknown as typeof fetch;

      const modelGateway = createModelGatewayClient(createDefaultModelGatewayConfig(), mockFetch);
      const generator = createStorylineGenerator({ modelGateway });

      const refined = await generator.refineScene(originalScene, 'Make the greeting more respectful and add camera motion');

      expect(refined.action).toContain('វាលស្រែ');
      expect(refined.cameraNotes).toContain('Cinematic tracking shot');
      expect(refined.dialogue[0]?.text).toBe('ជម្រាបសួរពុកម៉ែបងប្អូន។');
    });
  });
});
