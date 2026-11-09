import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAssetLibrary,
  createStageCheckpointManager,
  createModelGatewayClient,
  createDefaultModelGatewayConfig,
  createVisualStyleExtractor,
  createVishnuDirectorAgent,
} from '../../src/creator/ai-video-studio/index.js';

describe('Phase 9 — AI Video Studio Foundation', () => {
  describe('Asset Library', () => {
    it('creates, reads, updates, and deletes assets', () => {
      const library = createAssetLibrary('test-proj-1');

      const char = library.createCharacter({
        name: 'សុផល (Sophal)',
        description: 'Protagonist of the folktale',
        tags: ['character', 'protagonist'],
        thumbnailUrl: null,
        metadata: {
          visualDesign: {
            seed: 1234,
            controlNetRefs: [],
            loraModelId: null,
            prompt: 'Sophal in Angkor era attire',
            negativePrompt: 'blurry',
            aspects: {
              bodyType: 'lean',
              faceShape: 'oval',
              hairStyle: 'tied',
              hairColor: 'black',
              eyeColor: 'dark brown',
              outfit: 'krama and sampot',
              accessories: [],
            },
            expressions: { happy: 'smile' },
            poses: { default: 'standing' },
          },
          voiceProfile: {
            provider: 'edge-tts',
            voiceId: 'km-KH-PisethNeural',
            voiceName: 'Piseth Neural',
            language: 'km-KH',
            gender: 'male',
            traits: ['warm', 'narrative'],
            prosodyDefaults: { speed: 1.0, pitch: 0, emotion: 'neutral' },
          },
          animationRig: 'sprite-2d',
          role: 'protagonist',
        },
      });

      expect(char.id).toBeDefined();
      expect(char.type).toBe('character');
      expect(char.version).toBe(1);

      // Read
      const fetched = library.read(char.id);
      expect(fetched?.name).toBe('សុផល (Sophal)');

      // Update
      const updated = library.update(char.id, { description: 'Updated hero description' });
      expect(updated?.version).toBe(2);
      expect(updated?.description).toBe('Updated hero description');

      // List
      const allChars = library.getAssetsByType('character');
      expect(allChars).toHaveLength(1);

      // Delete
      const deleted = library.delete(char.id);
      expect(deleted).toBe(true);
      expect(library.read(char.id)).toBeUndefined();
    });

    it('creates and tracks visual style references', () => {
      const library = createAssetLibrary('test-proj-2');
      const styleRef = library.createVisualStyleReference(
        'ref-art-001',
        {
          colorPalette: ['#8B4513', '#DEB887'],
          lighting: 'natural',
          texture: 'film-grain',
          composition: 'rule-of-thirds',
          mood: 'warm',
          cameraStyle: 'static',
          khmerAesthetic: 'traditional',
        },
        0.95
      );

      expect(styleRef.appliedTo).toHaveLength(0);
      library.applyVisualStyleToAsset(styleRef, 'asset-100');
      library.applyVisualStyleToAsset(styleRef, 'asset-100'); // duplicate check
      expect(styleRef.appliedTo).toEqual(['asset-100']);
    });
  });

  describe('Stage Checkpoint System', () => {
    it('manages stage checkpoints and calculates resume points', () => {
      const manager = createStageCheckpointManager();
      const jobId = 'job-ck-1';

      expect(manager.getResumePlan(jobId)).toEqual({
        startFromStage: 'storyline',
        stagesToRun: ['storyline', 'characters', 'assets', 'voice', 'assembly'],
      });

      // Save storyline
      manager.save(jobId, 'storyline', { outline: 'Act 1' });
      expect(manager.hasCheckpoint(jobId, 'storyline')).toBe(true);
      expect(manager.hasCheckpoint(jobId, 'characters')).toBe(false);

      // Resume plan advances
      expect(manager.getResumePlan(jobId)).toEqual({
        startFromStage: 'characters',
        stagesToRun: ['characters', 'assets', 'voice', 'assembly'],
      });

      // Sequential verification
      expect(manager.canResumeFrom(jobId, 'characters')).toBe(true);
      expect(manager.canResumeFrom(jobId, 'assets')).toBe(false);

      // Save characters & assets
      manager.save(jobId, 'characters', { characters: [] });
      manager.save(jobId, 'assets', { scenes: [] });

      const resumePoint = manager.getResumePoint(jobId);
      expect(resumePoint?.stage).toBe('assets');

      // Milestone trigger
      expect(manager.shouldCheckpoint('storyline', 50)).toBe(true);
      expect(manager.shouldCheckpoint('storyline', 20)).toBe(false);
      expect(manager.shouldCheckpoint('assembly', 100)).toBe(true);
    });
  });

  describe('Model Gateway', () => {
    it('enforces cost limits and provider fallbacks', async () => {
      const config = createDefaultModelGatewayConfig();
      config.costTracking.dailyLimitUSD = 0.05; // Tight limit for test

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('relayclaw.ai')) {
          // Simulate failure of primary provider
          return {
            ok: false,
            status: 503,
            text: async () => 'Service Unavailable',
          };
        }
        // Fallback provider succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Fallback response successful' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        };
      }) as unknown as typeof fetch;

      const client = createModelGatewayClient(config, mockFetch);

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100,
      });

      expect(result.content).toBe('Fallback response successful');
      expect(callCount).toBe(2); // Primary tried and failed, fallback succeeded

      // Test cost cap breach
      client.recordUsage(0.06); // Exceed limit
      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'Will fail due to cost' }],
          maxTokens: 100,
        })
      ).rejects.toThrow(/Daily cost cap/);
    });
  });

  describe('Visual Style Extractor', () => {
    it('provides Khmer style presets and prompt modifiers', () => {
      const extractor = createVisualStyleExtractor();
      const preset = extractor.getPreset('khmer-traditional');

      expect(preset).toBeDefined();
      expect(preset?.params.khmerAesthetic).toBe('traditional');

      const modifiers = extractor.buildPromptModifiers(preset!.params);
      expect(modifiers.positive).toContain('angkor wat');
      expect(modifiers.positive).toContain('natural lighting');
      expect(modifiers.negative).toContain('futuristic');
    });
  });

  describe('Vishnu Director Agent', () => {
    it('executes full workflow planning with Khmer-first constraints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                outline: {
                  acts: [{
                    actNumber: 1,
                    title: 'រឿងទន្សាយនិងខ្លា (The Rabbit and the Tiger)',
                    summary: 'A clever rabbit encounters a hungry tiger.',
                    beats: [{ beatNumber: 1, title: 'ជួបគ្នា', description: 'Meeting in jungle', emotionalArc: 'inciting', estimatedDurationSeconds: 30 }],
                  }],
                  totalEstimatedDurationSeconds: 60,
                },
                characterBible: [{
                  id: 'char-rabbit',
                  name: 'ទន្សាយឆ្លាត (Clever Rabbit)',
                  role: 'protagonist',
                  archetype: 'Trickster',
                  personality: ['clever', 'quick'],
                  motivation: 'Escape danger',
                  conflict: 'Tiger is hungry',
                  arc: 'positive',
                  voiceTraits: ['cheerful', 'light'],
                  visualTraits: { ageRange: 'young', gender: 'male', ethnicity: 'Khmer', distinctiveFeatures: ['fluffy white fur'] },
                  relationships: [],
                }],
                script: [{
                  sceneNumber: 1,
                  actNumber: 1,
                  beatNumber: 1,
                  location: 'ព្រៃជ្រៅ (Deep Jungle)',
                  timeOfDay: 'morning',
                  characters: ['char-rabbit'],
                  action: 'Rabbit eats grass peacefully.',
                  dialogue: [{ characterId: 'char-rabbit', text: 'ព្រឹកនេះខ្យល់ត្រជាក់ស្រួលណាស់។', emotion: 'happy' }],
                  cameraNotes: 'Gentle pan over green jungle canopy',
                  estimatedDurationSeconds: 15,
                  visualReferences: [],
                }],
                culturalNotes: ['Classic Cambodian folk literature'],
              }),
            },
          }],
        }),
      }) as unknown as typeof fetch;

      const modelGateway = createModelGatewayClient(createDefaultModelGatewayConfig(), mockFetch);
      const agent = createVishnuDirectorAgent({ modelGateway });

      const planResult = await agent.planWorkflow(
        {
          topic: 'The Rabbit and the Tiger',
          style: 'animation',
          targetLanguage: 'km',
          culturalContext: 'khmer',
        },
        {
          jobId: 'director-job-1',
          projectId: 'project-director-1',
          currentStage: null,
          assetLibraryState: { characters: [], scenes: [], props: [], voices: [], visualStyles: [], music: [] },
          visualStyleParams: null,
        }
      );

      expect(planResult.success).toBe(true);
      expect(planResult.nextAction).toBe('continue');

      // Verify canvas graph building
      const canvasResult = await agent.buildCanvasGraph(
        {},
        {
          jobId: 'director-job-1',
          projectId: 'project-director-1',
          currentStage: 'storyline',
          assetLibraryState: { characters: [], scenes: [], props: [], voices: [], visualStyles: [], music: [] },
          visualStyleParams: null,
        }
      );

      expect(canvasResult.success).toBe(true);
      const graph = canvasResult.result as { nodes: unknown[]; edges: unknown[] };
      expect(graph.nodes.length).toBeGreaterThan(1); // Topic node + character/style nodes
      expect(graph.edges.length).toBeGreaterThan(0);

      // Verify checkpoint resume
      const resumeResult = await agent.resumeFromCheckpoint(
        { stage: 'storyline' },
        {
          jobId: 'director-job-1',
          projectId: 'project-director-1',
          currentStage: 'storyline',
          assetLibraryState: { characters: [], scenes: [], props: [], voices: [], visualStyles: [], music: [] },
          visualStyleParams: null,
        }
      );

      expect(resumeResult.success).toBe(true);
      expect(resumeResult.message).toContain('Resumed from checkpoint');
    });
  });
});
