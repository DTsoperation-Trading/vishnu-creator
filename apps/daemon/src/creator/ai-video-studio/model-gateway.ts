import type {
  ModelGatewayProvider,
  ModelGatewayConfig,
} from '@vishnucreator/protocol';

/**
 * Model Gateway Client
 * Inspired by DramaClaw's RelayClaw gateway pattern.
 * Provides unified access to multiple AI model providers with routing, fallbacks, and cost tracking.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  provider?: ModelGatewayProvider;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: ModelGatewayProvider;
  costUSD?: number;
}

export interface ImageGenerationParams {
  provider?: ModelGatewayProvider;
  model?: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  count?: number;
}

export interface ImageGenerationResponse {
  images: Array<{ url: string; seed?: number }>;
  model: string;
  provider: ModelGatewayProvider;
  costUSD?: number;
}

export interface VideoGenerationParams {
  provider?: ModelGatewayProvider;
  model?: string;
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  fps?: number;
  resolution?: string;
}

export interface VideoGenerationResponse {
  videoUrl: string;
  durationSeconds: number;
  model: string;
  provider: ModelGatewayProvider;
  costUSD?: number;
}

export interface AudioGenerationParams {
  provider?: ModelGatewayProvider;
  model?: string;
  text: string;
  voiceId: string;
  speed?: number;
  pitch?: number;
  emotion?: string;
}

export interface AudioGenerationResponse {
  audioUrl: string;
  durationSeconds: number;
  model: string;
  provider: ModelGatewayProvider;
  costUSD?: number;
}

export type ModelGatewayClient = ReturnType<typeof createModelGatewayClient>;

export function createDefaultModelGatewayConfig(): ModelGatewayConfig {
  return {
    defaultProvider: 'relayclaw',
    providers: {
      relayclaw: {
        enabled: true,
        baseUrl: 'https://api.relayclaw.ai/v1',
        models: [
          { id: 'relayclaw-chat-default', type: 'text', capabilities: ['chat', 'json'], costPer1kTokens: 0.002 },
          { id: 'flux-schnell', type: 'image', capabilities: ['image'], costPerImage: 0.003 },
          { id: 'runway-gen3', type: 'video', capabilities: ['video'], costPerSecondVideo: 0.05 },
          { id: 'voxcpm2-native', type: 'audio', capabilities: ['tts'], costPerSecondAudio: 0.001 },
        ],
      },
      openai: {
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        models: [
          { id: 'gpt-4o', type: 'text', capabilities: ['chat', 'json'], costPer1kTokens: 0.005 },
          { id: 'dall-e-3', type: 'image', capabilities: ['image'], costPerImage: 0.04 },
          { id: 'tts-1', type: 'audio', capabilities: ['tts'], costPerSecondAudio: 0.015 },
        ],
      },
      anthropic: {
        enabled: false,
        baseUrl: 'https://api.anthropic.com/v1',
        models: [
          { id: 'claude-3-5-sonnet', type: 'text', capabilities: ['chat'], costPer1kTokens: 0.003 },
        ],
      },
      google: {
        enabled: false,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: [
          { id: 'gemini-1.5-pro', type: 'text', capabilities: ['chat', 'json'], costPer1kTokens: 0.00125 },
        ],
      },
      azure: {
        enabled: false,
        models: [],
      },
      custom: {
        enabled: false,
        models: [],
      },
      local: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        models: [
          { id: 'llama3:8b', type: 'text', capabilities: ['chat'], costPer1kTokens: 0 },
          { id: 'voxcpm2-local', type: 'audio', capabilities: ['tts'], costPerSecondAudio: 0 },
        ],
      },
    },
    routingRules: [
      { taskType: 'text', preferredProvider: 'relayclaw', fallbackProviders: ['local', 'openai', 'anthropic', 'google'] },
      { taskType: 'image', preferredProvider: 'relayclaw', fallbackProviders: ['openai', 'custom', 'local'] },
      { taskType: 'video', preferredProvider: 'relayclaw', fallbackProviders: ['custom'] },
      { taskType: 'audio', preferredProvider: 'relayclaw', fallbackProviders: ['local', 'openai'] },
    ],
    costTracking: {
      enabled: true,
      dailyLimitUSD: 50,
      monthlyLimitUSD: 500,
      alertThresholdUSD: 10,
    },
  };
}

export function createModelGatewayClient(
  initialConfig?: ModelGatewayConfig,
  fetchFn: typeof fetch = globalThis.fetch
) {
  const config = initialConfig ? { ...initialConfig } : createDefaultModelGatewayConfig();
  const { providers, routingRules, costTracking } = config;

  const usage = {
    dailyUSD: 0,
    monthlyUSD: 0,
    lastResetDaily: Date.now(),
    lastResetMonthly: Date.now(),
  };

  // =========================================================================
  // PROVIDER RESOLUTION & FALLBACKS
  // =========================================================================

  function isProviderEnabled(provider: ModelGatewayProvider): boolean {
    return providers[provider]?.enabled === true;
  }

  function getRoutingRule(taskType: 'text' | 'image' | 'video' | 'audio') {
    return routingRules.find(r => r.taskType === taskType);
  }

  function getProviderChain(taskType: 'text' | 'image' | 'video' | 'audio', preferred?: ModelGatewayProvider): ModelGatewayProvider[] {
    const chain: ModelGatewayProvider[] = [];
    const rule = getRoutingRule(taskType);

    if (preferred && isProviderEnabled(preferred)) {
      chain.push(preferred);
    } else if (rule && isProviderEnabled(rule.preferredProvider)) {
      chain.push(rule.preferredProvider);
    } else if (isProviderEnabled(config.defaultProvider)) {
      chain.push(config.defaultProvider);
    }

    if (rule?.fallbackProviders) {
      for (const fb of rule.fallbackProviders) {
        if (isProviderEnabled(fb) && !chain.includes(fb)) {
          chain.push(fb);
        }
      }
    }

    return chain;
  }

  function getModelForProvider(provider: ModelGatewayProvider, taskType: 'text' | 'image' | 'video' | 'audio'): string {
    const p = providers[provider];
    const match = p?.models.find(m => m.type === taskType);
    return match?.id || 'default-model';
  }

  // =========================================================================
  // COST TRACKING & LIMITS
  // =========================================================================

  function checkAndResetUsage(): void {
    const now = Date.now();
    if (now - usage.lastResetDaily >= 24 * 60 * 60 * 1000) {
      usage.dailyUSD = 0;
      usage.lastResetDaily = now;
    }
    if (now - usage.lastResetMonthly >= 30 * 24 * 60 * 60 * 1000) {
      usage.monthlyUSD = 0;
      usage.lastResetMonthly = now;
    }
  }

  function checkCostLimit(estimatedCost: number): { allowed: boolean; reason?: string } {
    if (!costTracking.enabled) return { allowed: true };
    checkAndResetUsage();

    if (costTracking.dailyLimitUSD && (usage.dailyUSD + estimatedCost) > costTracking.dailyLimitUSD) {
      return {
        allowed: false,
        reason: `Daily cost cap of $${costTracking.dailyLimitUSD} exceeded (attempted +$${estimatedCost.toFixed(4)}, current $${usage.dailyUSD.toFixed(4)})`,
      };
    }
    if (costTracking.monthlyLimitUSD && (usage.monthlyUSD + estimatedCost) > costTracking.monthlyLimitUSD) {
      return {
        allowed: false,
        reason: `Monthly cost cap of $${costTracking.monthlyLimitUSD} exceeded (attempted +$${estimatedCost.toFixed(4)}, current $${usage.monthlyUSD.toFixed(4)})`,
      };
    }

    return { allowed: true };
  }

  function recordUsage(costUSD: number): void {
    if (!costTracking.enabled || costUSD <= 0) return;
    checkAndResetUsage();
    usage.dailyUSD += costUSD;
    usage.monthlyUSD += costUSD;
  }

  function getUsage(): { dailyUSD: number; monthlyUSD: number; lastResetDaily: number; lastResetMonthly: number } {
    checkAndResetUsage();
    return { ...usage };
  }

  function resetUsage(): void {
    usage.dailyUSD = 0;
    usage.monthlyUSD = 0;
    usage.lastResetDaily = Date.now();
    usage.lastResetMonthly = Date.now();
  }

  function estimateCost(taskType: 'text' | 'image' | 'video' | 'audio', params: Record<string, unknown>): number {
    const rule = getRoutingRule(taskType);
    const provider = (params.provider as ModelGatewayProvider) || rule?.preferredProvider || config.defaultProvider;
    const modelId = (params.model as string) || getModelForProvider(provider, taskType);
    const modelMeta = providers[provider]?.models.find(m => m.id === modelId);

    if (!modelMeta) return 0;

    switch (taskType) {
      case 'text': {
        const estTokens = typeof params.maxTokens === 'number' ? params.maxTokens : 1000;
        return ((modelMeta.costPer1kTokens || 0) * estTokens) / 1000;
      }
      case 'image': {
        const count = typeof params.count === 'number' ? params.count : 1;
        return (modelMeta.costPerImage || 0) * count;
      }
      case 'video': {
        const duration = typeof params.durationSeconds === 'number' ? params.durationSeconds : 5;
        return (modelMeta.costPerSecondVideo || 0) * duration;
      }
      case 'audio': {
        const charLen = typeof params.text === 'string' ? params.text.length : 100;
        const estSeconds = Math.max(1, Math.round(charLen / 15));
        return (modelMeta.costPerSecondAudio || 0) * estSeconds;
      }
      default:
        return 0;
    }
  }

  // =========================================================================
  // API EXECUTIONS WITH MULTI-PROVIDER FALLBACK
  // =========================================================================

  async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const chain = getProviderChain('text', params.provider);
    if (chain.length === 0) {
      throw new Error('No enabled text provider available in Model Gateway');
    }

    const estCost = estimateCost('text', params as unknown as Record<string, unknown>);
    const limitCheck = checkCostLimit(estCost);
    if (!limitCheck.allowed) {
      throw new Error(`Model Gateway Cost Limit: ${limitCheck.reason}`);
    }

    let lastError: Error | null = null;
    for (const provider of chain) {
      try {
        const model = params.model || getModelForProvider(provider, 'text');
        const providerConfig = providers[provider];
        const baseUrl = providerConfig.baseUrl || 'https://api.relayclaw.ai/v1';

        const res = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: params.messages,
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${provider}: ${await res.text()}`);
        }

        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const content = data.choices?.[0]?.message?.content || '';
        const usageData = data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined;

        recordUsage(estCost);

        return {
          content,
          usage: usageData,
          model,
          provider,
          costUSD: estCost,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Continue to fallback provider in chain
      }
    }

    throw new Error(`All providers failed for chat completion. Last error: ${lastError?.message}`);
  }

  async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    const chain = getProviderChain('image', params.provider);
    if (chain.length === 0) {
      throw new Error('No enabled image provider available in Model Gateway');
    }

    const estCost = estimateCost('image', params as unknown as Record<string, unknown>);
    const limitCheck = checkCostLimit(estCost);
    if (!limitCheck.allowed) {
      throw new Error(`Model Gateway Cost Limit: ${limitCheck.reason}`);
    }

    let lastError: Error | null = null;
    for (const provider of chain) {
      try {
        const model = params.model || getModelForProvider(provider, 'image');
        const providerConfig = providers[provider];
        const baseUrl = providerConfig.baseUrl || 'https://api.relayclaw.ai/v1';

        const res = await fetchFn(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            prompt: params.prompt,
            n: params.count || 1,
            size: `${params.width || 1024}x${params.height || 1024}`,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${provider}: ${await res.text()}`);
        }

        const data = await res.json() as {
          data?: Array<{ url?: string; b64_json?: string }>;
        };

        const images = (data.data || []).map((img, idx) => ({
          url: img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : ''),
          seed: params.seed ? params.seed + idx : undefined,
        }));

        recordUsage(estCost);

        return {
          images,
          model,
          provider,
          costUSD: estCost,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(`All providers failed for image generation. Last error: ${lastError?.message}`);
  }

  async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResponse> {
    const chain = getProviderChain('video', params.provider);
    if (chain.length === 0) {
      throw new Error('No enabled video provider available in Model Gateway');
    }

    const estCost = estimateCost('video', params as unknown as Record<string, unknown>);
    const limitCheck = checkCostLimit(estCost);
    if (!limitCheck.allowed) {
      throw new Error(`Model Gateway Cost Limit: ${limitCheck.reason}`);
    }

    let lastError: Error | null = null;
    for (const provider of chain) {
      try {
        const model = params.model || getModelForProvider(provider, 'video');
        const providerConfig = providers[provider];
        const baseUrl = providerConfig.baseUrl || 'https://api.relayclaw.ai/v1';

        const res = await fetchFn(`${baseUrl}/videos/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            prompt: params.prompt,
            image_url: params.imageUrl,
            duration: params.durationSeconds || 5,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${provider}: ${await res.text()}`);
        }

        const data = await res.json() as { video_url?: string; url?: string; duration?: number };
        recordUsage(estCost);

        return {
          videoUrl: data.video_url || data.url || '',
          durationSeconds: data.duration || params.durationSeconds || 5,
          model,
          provider,
          costUSD: estCost,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(`All providers failed for video generation. Last error: ${lastError?.message}`);
  }

  async function generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResponse> {
    const chain = getProviderChain('audio', params.provider);
    if (chain.length === 0) {
      throw new Error('No enabled audio provider available in Model Gateway');
    }

    const estCost = estimateCost('audio', params as unknown as Record<string, unknown>);
    const limitCheck = checkCostLimit(estCost);
    if (!limitCheck.allowed) {
      throw new Error(`Model Gateway Cost Limit: ${limitCheck.reason}`);
    }

    let lastError: Error | null = null;
    for (const provider of chain) {
      try {
        const model = params.model || getModelForProvider(provider, 'audio');
        const providerConfig = providers[provider];
        const baseUrl = providerConfig.baseUrl || 'https://api.relayclaw.ai/v1';

        const res = await fetchFn(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            input: params.text,
            voice: params.voiceId,
            speed: params.speed || 1.0,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${provider}: ${await res.text()}`);
        }

        const data = await res.json() as { audio_url?: string; url?: string; duration?: number };
        recordUsage(estCost);

        return {
          audioUrl: data.audio_url || data.url || '',
          durationSeconds: data.duration || Math.max(1, Math.round(params.text.length / 15)),
          model,
          provider,
          costUSD: estCost,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(`All providers failed for audio generation. Last error: ${lastError?.message}`);
  }

  return {
    config,
    isProviderEnabled,
    getProviderChain,
    getModelForProvider,
    getUsage,
    resetUsage,
    recordUsage,
    checkCostLimit,
    estimateCost,
    chatCompletion,
    generateImage,
    generateVideo,
    generateAudio,
  };
}
