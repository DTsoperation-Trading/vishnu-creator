import { nanoid } from 'nanoid';
import type {
  AssetPipelineInput,
  AssetPipelineOutput,
  SceneAsset,
  CharacterAsset,
  VisualStyleParams,
  PropAsset,
  VisualStyleAsset,
  AssetLibraryItem,
  ModelGatewayClient,
} from '@vishnucreator/protocol';

/**
 * Asset Pipeline - Stage 3 of AI Video Studio Pipeline
 * Generates backgrounds, character art, props, extracts visual style
 * Inspired by DramaClaw's asset generation pipeline
 */

export type AssetPipeline = ReturnType<typeof createAssetPipeline>;

export interface AssetPipelineConfig {
  modelGateway: any;
  assetLibrary: any;
  visualStyleExtractor: any;
  styleConsistencyLevel: 'strict' | 'moderate' | 'loose';
}

export function createAssetPipeline(config: AssetPipelineConfig) {
  const { modelGateway, assetLibrary, visualStyleExtractor, styleConsistencyLevel = 'moderate' } = config;

  // =========================================================================
  // MAIN EXECUTION
  // =========================================================================

  async function generateAssets(input: AssetPipelineInput, jobId: string): Promise<AssetPipelineOutput> {
    const { script, characterAssets, visualStyleParams, sceneCount, styleConsistencyLevel: consistency } = input;

    const sceneAssets: any[] = [];
    const characterArtAssets: any[] = [];
    const propAssets: any[] = [];

    // Generate scenes from script
    for (let i = 0; i < Math.min(sceneCount, script.length); i++) {
      const scene = script[i];
      if (!scene) continue;

      // Generate background scene
      const sceneAsset = await generateSceneAsset(scene, input.visualStyleParams, consistency);
      sceneAssets.push(sceneAsset);

      // Generate character art for characters in this scene
      for (const charId of scene.characters) {
        const character = characterAssets.find(c => c.id === charId);
        if (character) {
          const variants = await generateCharacterVariants(character, scene, input.visualStyleParams);
          characterArtAssets.push(...variants);
        }
      }

      // Generate props for scene
      const props = await generateSceneProps(scene, input.visualStyleParams);
      propAssets.push(...props);
    }

    // Create visual style asset
    const visualStyleAsset = await createVisualStyleAsset(jobId, input.visualStyleParams);

    return {
      sceneAssets,
      characterArtAssets,
      propAssets,
      visualStyleAsset,
      visualStyleRef: visualStyleAsset.id,
    };
  }

  // =========================================================================
  // SCENE GENERATION
  // =========================================================================

  async function generateSceneAsset(
    scene: any,
    visualStyleParams: any,
    consistency: string
  ): Promise<any> {
    // Build scene prompt
    const prompt = buildScenePrompt(scene);
    const stylePrompt = buildStylePrompt(visualStyleParams);

    // Generate scene image
    const imageResult = await generateSceneImage(prompt, stylePrompt, visualStyleParams);

    return {
      id: `scene_${nanoid()}`,
      projectId: '',
      type: 'scene',
      name: `Scene ${scene.sceneNumber}: ${scene.location}`,
      description: scene.action,
      tags: ['scene', `act-${scene.actNumber}`, `scene-${scene.sceneNumber}`, scene.timeOfDay],
      metadata: {
        category: categorizeLocation(scene.location),
        timeOfDay: scene.timeOfDay,
        weather: 'clear',
        lightingSetup: visualStyleParams.lighting,
        cameraAngles: ['wide', 'medium'],
        is3DSet: false,
        directorWorldRef: null,
        panorama360Ref: null,
        sceneNumber: scene.sceneNumber,
        actNumber: scene.actNumber,
        beatNumber: scene.beatNumber,
        charactersInScene: scene.characters,
        prompt: imageResult.prompt,
        imageUrl: imageResult.imageUrl,
        seed: imageResult.seed,
        consistencyLevel: consistency,
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function buildScenePrompt(scene: any): string {
    const elements = [
      scene.location,
      scene.timeOfDay,
      scene.action,
      `characters: ${scene.characters?.join(', ') || 'none'}`,
      `camera: ${scene.cameraNotes || 'medium shot'}`,
    ].filter(Boolean).join(', ');

    return `${elements}, cinematic composition, high detail`;
  }

  function buildStylePrompt(visualStyleParams: any): string {
    return `${visualStyleParams.lighting} lighting, ${visualStyleParams.texture} texture, ${visualStyleParams.composition} composition, ${visualStyleParams.mood} mood, ${visualStyleParams.cameraStyle} camera style, color palette: ${visualStyleParams.colorPalette.join(', ')}`;
  }

  async function generateSceneImage(prompt: string, stylePrompt: string, visualStyleParams: any): Promise<{ prompt: string; imageUrl: string; seed: number }> {
    // In production, call image generation model
    const seed = Math.floor(Math.random() * 2147483647);
    const fullPrompt = `${prompt}, ${stylePrompt}, seed: ${seed}`;

    return {
      prompt: fullPrompt,
      imageUrl: `generated://scene_${nanoid()}.png`,
      seed: Math.floor(Math.random() * 2147483647),
    };
  }

  // =========================================================================
  // CHARACTER VARIANTS
  // =========================================================================

  async function generateCharacterVariants(
    character: any,
    scene: any,
    visualStyleParams: any
  ): Promise<any[]> {
    const variants = [];

    // Generate expression variants
    for (const [emotion, prompt] of Object.entries(character.metadata?.visualDesign?.expressions || {})) {
      variants.push(await generateCharacterExpressionAsset(character, emotion, scene, visualStyleParams));
    }

    // Generate pose variants
    for (const [poseName, prompt] of Object.entries(character.metadata?.visualDesign?.poses || {})) {
      variants.push(await generateCharacterPoseAsset(character, poseName, scene, visualStyleParams));
    }

    return variants;
  }

  async function generateCharacterExpressionAsset(
    character: any,
    emotion: string,
    scene: any,
    visualStyleParams: any
  ): Promise<any> {
    return {
      id: `char_expr_${nanoid()}`,
      projectId: '',
      type: 'character',
      name: `${character.name} - ${emotion}`,
      description: `${character.name} expressing ${emotion}`,
      tags: ['character-expression', character.name, emotion],
      metadata: {
        baseCharacterId: character.id,
        variantType: 'expression',
        emotion,
        prompt: `${character.metadata.visualDesign.prompt}, ${emotion} expression`,
        sceneContext: scene.sceneNumber,
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function generateCharacterPoseAsset(
    character: any,
    poseName: string,
    scene: any,
    visualStyleParams: any
  ): Promise<any> {
    return {
      id: `char_pose_${nanoid()}`,
      projectId: '',
      type: 'character',
      name: `${character.name} - ${poseName}`,
      description: `${character.name} in ${poseName} pose`,
      tags: ['character-pose', character.name, poseName],
      metadata: {
        baseCharacterId: character.id,
        variantType: 'pose',
        poseName,
        prompt: `${character.metadata.visualDesign.prompt}, ${poseName} pose`,
        sceneContext: scene.sceneNumber,
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // PROP GENERATION
  // =========================================================================

  async function generateSceneProps(scene: any, visualStyleParams: any): Promise<any[]> {
    // Extract props from scene action and camera notes
    const propKeywords = extractPropsFromScene(scene);
    const props = [];

    for (const keyword of propKeywords) {
      props.push(await generatePropAsset(keyword, scene, visualStyleParams));
    }

    return props;
  }

  function extractPropsFromScene(scene: any): string[] {
    // Simple keyword extraction from action and camera notes
    const text = `${scene.action} ${scene.cameraNotes}`.toLowerCase();
    const commonProps = [
      'phone', 'book', 'cup', 'bowl', 'basket', 'hat', 'bag', 'umbrella',
      'bicycle', 'motorcycle', 'car', 'boat', 'fan', 'lamp', 'candle',
      'flower', 'incense', 'statue', 'drum', 'instrument', 'scroll',
      'sword', 'staff', 'shield', 'mirror', 'comb', 'brush', 'fabric'
    ];

    return commonProps.filter(prop => text.includes(prop));
  }

  async function generatePropAsset(keyword: string, scene: any, visualStyleParams: any): Promise<any> {
    return {
      id: `prop_${nanoid()}`,
      projectId: '',
      type: 'prop',
      name: keyword,
      description: `${keyword} for scene ${scene.sceneNumber}`,
      tags: ['prop', keyword, `scene-${scene.sceneNumber}`],
      metadata: {
        category: categorizeProp(keyword),
        isAnimated: ['fan', 'candle', 'lamp', 'phone'].includes(keyword),
        animationType: ['fan', 'candle'].includes(keyword) ? 'particle' : 'static',
        prompt: `${keyword}, ${scene.timeOfDay} lighting, ${scene.location} background, high detail`,
        sceneNumber: scene.sceneNumber,
      },
      status: 'ready',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function categorizeProp(keyword: string): 'handheld' | 'furniture' | 'vehicle' | 'weapon' | 'accessory' | 'effect' {
    const handheld = ['phone', 'book', 'cup', 'bowl', 'basket', 'hat', 'bag', 'umbrella', 'phone', 'scroll', 'fan', 'comb', 'brush', 'mirror'];
    const furniture = ['lamp', 'candle', 'fan'];
    const vehicle = ['bicycle', 'motorcycle', 'car', 'boat'];
    const weapon = ['sword', 'staff', 'shield'];
    const accessory = ['hat', 'bag', 'comb', 'brush', 'mirror', 'fabric'];
    const effect = ['candle', 'incense'];

    if (handheld.includes(keyword)) return 'handheld';
    if (furniture.includes(keyword)) return 'furniture';
    if (vehicle.includes(keyword)) return 'vehicle';
    if (weapon.includes(keyword)) return 'weapon';
    if (accessory.includes(keyword)) return 'accessory';
    if (effect.includes(keyword)) return 'effect';
    return 'handheld';
  }

  // =========================================================================
  // VISUAL STYLE ASSET
  // =========================================================================

  async function createVisualStyleAsset(jobId: string, params: any): Promise<any> {
    return {
      id: `style_${nanoid()}`,
      projectId: jobId,
      type: 'visual-style',
      name: 'Project Visual Style',
      description: 'Applied across all assets',
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

  function categorizeLocation(location: string): 'interior' | 'exterior' | 'abstract' | '3d-set' {
    const exterior = ['rice field', 'pagoda', 'river', 'mountain', 'forest', 'village', 'market', 'street', 'bridge', 'temple grounds'];
    const interior = ['house', 'home', 'room', 'kitchen', 'temple hall', 'monastery', 'school', 'office', 'shop'];
    const abstract = ['void', 'dream', 'memory', 'imagination', 'spirit world'];

    const loc = location.toLowerCase();
    if (exterior.some(e => loc.includes(e))) return 'exterior';
    if (interior.some(i => loc.includes(i))) return 'interior';
    if (abstract.some(a => loc.includes(a))) return 'abstract';
    return 'exterior';
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================

  return {
    generateAssets,
    generateSceneAsset,
    generateCharacterVariants,
    generateSceneProps,
    createVisualStyleAsset,
  };
}

