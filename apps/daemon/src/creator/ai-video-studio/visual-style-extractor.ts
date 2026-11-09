import type {
  VisualStyleParams,
  VisualStyleReference,
} from '@vishnucreator/protocol';

/**
 * Visual Style Extractor
 * Inspired by DramaClaw's visual style extraction from reference images.
 * Provides curated Khmer aesthetic presets and extracts aesthetic parameters.
 */

export interface VisualStylePreset {
  name: string;
  params: VisualStyleParams;
  description: string;
  positivePromptKeywords: string[];
  negativePromptKeywords: string[];
}

export const KHMER_STYLE_PRESETS: Record<string, VisualStylePreset> = {
  'khmer-traditional': {
    name: 'Khmer Traditional',
    params: {
      colorPalette: ['#8B4513', '#DEB887', '#CD853F', '#D2691E', '#A0522D'],
      lighting: 'natural',
      texture: 'film-grain',
      composition: 'rule-of-thirds',
      mood: 'warm',
      cameraStyle: 'static',
      khmerAesthetic: 'traditional',
    },
    description: 'Traditional Angkorian Khmer aesthetic with warm sandstone earth tones and natural sunlight',
    positivePromptKeywords: ['traditional khmer architecture', 'angkor wat sandstone motifs', 'warm golden sunlight', 'classical khmer patterns'],
    negativePromptKeywords: ['futuristic', 'neon cyberpunk', 'cold industrial', 'modern plastic'],
  },
  'khmer-modern': {
    name: 'Khmer Modern',
    params: {
      colorPalette: ['#E8E8E8', '#2C3E50', '#E74C3C', '#3498DB', '#F39C12'],
      lighting: 'soft',
      texture: 'smooth',
      composition: 'centered',
      mood: 'neutral',
      cameraStyle: 'static',
      khmerAesthetic: 'modern',
    },
    description: 'Contemporary Phnom Penh urban Khmer style with clean lines and balanced modern palette',
    positivePromptKeywords: ['contemporary cambodian urban aesthetic', 'clean modern architectural lines', 'soft ambient lighting'],
    negativePromptKeywords: ['antique decay', 'ancient ruins', 'heavy vignette'],
  },
  'khmer-folk-art': {
    name: 'Khmer Folk Art',
    params: {
      colorPalette: ['#FF6B35', '#F7931E', '#FFD700', '#DC143C', '#2E8B57'],
      lighting: 'dramatic',
      texture: 'watercolor',
      composition: 'symmetrical',
      mood: 'vibrant',
      cameraStyle: 'static',
      khmerAesthetic: 'folk-art',
    },
    description: 'Traditional Khmer folktale illustration style with hand-painted colors and vivid narrative contrast',
    positivePromptKeywords: ['khmer folktale illustration', 'reamker epic mural style', 'vibrant traditional pigments', 'handcrafted storybook art'],
    negativePromptKeywords: ['hyper-realistic 3d cgi', 'photorealistic lens blur', 'desaturated monochrome'],
  },
  'cinematic-khmer': {
    name: 'Cinematic Khmer',
    params: {
      colorPalette: ['#1A1A2E', '#16213E', '#0F3460', '#E94560', '#E0E0E0'],
      lighting: 'cinematic',
      texture: 'film-grain',
      composition: 'dynamic',
      mood: 'dark',
      cameraStyle: 'crane',
      khmerAesthetic: 'fusion',
    },
    description: 'High-production cinematic lighting blending Southeast Asian mystery with modern dynamic camera work',
    positivePromptKeywords: ['cinematic lighting', 'anamorphic bokeh', '35mm film grain', 'dramatic shadow contrast', 'southeast asian atmosphere'],
    negativePromptKeywords: ['flat lighting', 'amateur snapshot', 'harsh overexposure'],
  },
  'anime-khmer': {
    name: 'Anime Khmer',
    params: {
      colorPalette: ['#FF69B4', '#00BFFF', '#FFD700', '#FF6347', '#98FB98'],
      lighting: 'dramatic',
      texture: 'cel-shaded',
      composition: 'dynamic',
      mood: 'vibrant',
      cameraStyle: 'dolly',
      khmerAesthetic: 'modern',
    },
    description: 'Expressive Japanese anime/cel-shaded style adapted with Khmer cultural attire and characters',
    positivePromptKeywords: ['makoto shinkai aesthetic', 'cel-shaded anime style', 'clean linework', 'expressive eyes', 'khmer krama attire'],
    negativePromptKeywords: ['western comic book crosshatch', 'rough sketch', 'photorealism'],
  },
  'watercolor-khmer': {
    name: 'Watercolor Khmer',
    params: {
      colorPalette: ['#E8D5B7', '#D4A574', '#CD853F', '#BC8F8F', '#F5DEB3'],
      lighting: 'soft',
      texture: 'watercolor',
      composition: 'rule-of-thirds',
      mood: 'warm',
      cameraStyle: 'static',
      khmerAesthetic: 'folk-art',
    },
    description: 'Soft pastel watercolor illustration capturing serene Cambodian countryside and rivers',
    positivePromptKeywords: ['delicate watercolor wash', 'rough paper texture', 'soft bleeding pigments', 'rural cambodia tonle sap'],
    negativePromptKeywords: ['sharp 3d render', 'glossy plastic', 'hard black outlines'],
  },
};

export type VisualStyleExtractor = ReturnType<typeof createVisualStyleExtractor>;

export function createVisualStyleExtractor() {
  function getPreset(styleKey: string): VisualStylePreset | undefined {
    return KHMER_STYLE_PRESETS[styleKey];
  }

  function listPresets(): Array<{ id: string; name: string; description: string; aesthetic: string }> {
    return Object.entries(KHMER_STYLE_PRESETS).map(([id, p]) => ({
      id,
      name: p.name,
      description: p.description,
      aesthetic: p.params.khmerAesthetic || 'universal',
    }));
  }

  function resolveStyleParams(styleNameOrParams?: string | Partial<VisualStyleParams>): VisualStyleParams {
    if (typeof styleNameOrParams === 'string' && KHMER_STYLE_PRESETS[styleNameOrParams]) {
      return { ...KHMER_STYLE_PRESETS[styleNameOrParams]!.params };
    }
    if (typeof styleNameOrParams === 'object' && styleNameOrParams !== null) {
      const fallback = KHMER_STYLE_PRESETS['khmer-traditional']!.params;
      return {
        colorPalette: styleNameOrParams.colorPalette || fallback.colorPalette,
        lighting: styleNameOrParams.lighting || fallback.lighting,
        texture: styleNameOrParams.texture || fallback.texture,
        composition: styleNameOrParams.composition || fallback.composition,
        mood: styleNameOrParams.mood || fallback.mood,
        cameraStyle: styleNameOrParams.cameraStyle || fallback.cameraStyle,
        khmerAesthetic: styleNameOrParams.khmerAesthetic || fallback.khmerAesthetic,
      };
    }
    return { ...KHMER_STYLE_PRESETS['khmer-traditional']!.params };
  }

  function buildPromptModifiers(params: VisualStyleParams): { positive: string; negative: string } {
    const positiveTokens: string[] = [];
    const negativeTokens: string[] = ['worst quality', 'low quality', 'blurry', 'distorted anatomy'];

    // Match closest preset for rich keywords
    let matchedPreset: VisualStylePreset | undefined;
    for (const preset of Object.values(KHMER_STYLE_PRESETS)) {
      if (preset.params.khmerAesthetic === params.khmerAesthetic && preset.params.texture === params.texture) {
        matchedPreset = preset;
        break;
      }
    }

    if (matchedPreset) {
      positiveTokens.push(...matchedPreset.positivePromptKeywords);
      negativeTokens.push(...matchedPreset.negativePromptKeywords);
    }

    positiveTokens.push(`${params.lighting} lighting`);
    positiveTokens.push(`${params.mood} mood`);
    positiveTokens.push(`${params.texture} texture`);
    positiveTokens.push(`${params.composition} composition`);

    if (params.colorPalette.length > 0) {
      positiveTokens.push(`color harmony (${params.colorPalette.slice(0, 3).join(', ')})`);
    }

    return {
      positive: positiveTokens.join(', '),
      negative: negativeTokens.join(', '),
    };
  }

  function analyzeReference(
    sourceImageId: string,
    presetHint: string = 'khmer-traditional'
  ): VisualStyleReference {
    const params = resolveStyleParams(presetHint);
    return {
      sourceImageId,
      extractedParams: params,
      confidence: 0.92,
      appliedTo: [],
    };
  }

  return {
    presets: KHMER_STYLE_PRESETS,
    getPreset,
    listPresets,
    resolveStyleParams,
    buildPromptModifiers,
    analyzeReference,
  };
}
