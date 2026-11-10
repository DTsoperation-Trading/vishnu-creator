import { nanoid } from 'nanoid';
import type {
  VideoAssemblyInput,
  VideoAssemblyOutput,
  ScriptScene,
  SceneAsset,
  CharacterAsset,
  VoiceSynthesisOutput,
  VisualStyleParams,
} from '@vishnucreator/protocol';

/**
 * Video Assembler - Stage 5 of AI Video Studio Pipeline
 * Timeline composition, transitions, subtitles, music, export
 * Uses existing dub-engine ffmpeg infrastructure
 */

export type VideoAssembler = ReturnType<typeof createVideoAssembler>;

export interface VideoAssemblerConfig {
  modelGateway: any;
  dubEngine: any; // Existing dub-engine ffmpeg infrastructure
  assetLibrary: any;
}

export function createVideoAssembler(config: VideoAssemblerConfig) {
  const { modelGateway, dubEngine, assetLibrary } = config;

  // =========================================================================
  // MAIN EXECUTION
  // =========================================================================

  async function assembleVideo(input: VideoAssemblyInput, jobId: string): Promise<VideoAssemblyOutput> {
    const { script, sceneAssets, characterArtAssets, voiceOutput, visualStyleParams, exportSettings } = input;

    // Build timeline - characterArtAssets are already CharacterAsset[]
    const timeline = buildTimeline(script, sceneAssets, characterArtAssets as CharacterAsset[], voiceOutput.lipSyncData);

    // Render video for each export setting
    const renderedResolutions: Record<string, string> = {};

    const exportFormats = exportSettings.formats && exportSettings.formats.length > 0 ? exportSettings.formats : ['mp4'];
    const exportResolutions = exportSettings.resolutions && exportSettings.resolutions.length > 0 ? exportSettings.resolutions : ['1080p'];

    for (const resolution of exportResolutions) {
      const videoArtifact = await renderVideo({
        timeline,
        resolution,
        format: exportFormats[0] ?? 'mp4',
        visualStyleParams,
        subtitles: exportSettings.burnSubtitles ? buildSubtitles(input, exportSettings) : [],
        audioTrackId: (voiceOutput?.audioMix?.masterTrackId as string) ?? '',
      });
      renderedResolutions[resolution] = videoArtifact.id;
    }

    // Generate subtitle artifacts
    const subtitleArtifacts = (exportSettings.subtitleFormats || ['srt']).map(format => ({
      format,
      language: 'km',
      artifactId: generateSubtitleArtifactSync(script, format, exportSettings.perSpeakerSubtitleColors ?? false),
      perSpeakerColors: exportSettings.perSpeakerSubtitleColors ?? false,
    }));

    // Calculate costs
    const providerCosts = await calculateProviderCosts();

    // Get first resolution for fallback
    const firstResolution = exportResolutions[0] ?? '1080p';
    const primaryVideoId = renderedResolutions[firstResolution] ?? Object.values(renderedResolutions)[0] ?? '';

    return {
      finalVideoArtifact: {
        id: primaryVideoId,
        resolutions: renderedResolutions,
        durationSeconds: script.reduce((sum, s) => sum + (s.estimatedDurationSeconds ?? 0), 0),
        fileSizeBytes: await getFileSize(renderedResolutions['1080p'] ?? primaryVideoId),
        sha256: await calculateSHA256(renderedResolutions['1080p'] ?? primaryVideoId),
      },
      subtitleArtifacts,
      exportManifest: {
        generatedAt: new Date().toISOString(),
        totalDurationSeconds: script.reduce((sum, s) => sum + (s.estimatedDurationSeconds ?? 0), 0),
        scenesRendered: script.length,
        assetsUsed: sceneAssets.length + characterArtAssets.length,
        providerCosts,
        checksums: {},
      },
    };
  }

  // =========================================================================
  // TIMELINE BUILDING
  // =========================================================================

  function buildTimeline(
    script: ScriptScene[],
    sceneAssets: SceneAsset[],
    characterArtAssets: CharacterAsset[],
    lipSyncData: any[]
  ): any {
    const tracks = {
      video: [] as any[],
      audio: [] as any[],
      subtitle: [] as any[],
    };

    for (const scene of script) {
      const sceneAsset = sceneAssets.find(a => a.metadata?.sceneNumber === scene.sceneNumber);
      const startTime = scene.startTimeMs ?? 0;
      const duration = (scene.estimatedDurationSeconds ?? 30) * 1000;

      // Video track
      if (sceneAsset) {
        tracks.video.push({
          type: 'video',
          assetId: sceneAsset.id,
          startMs: startTime,
          durationMs: duration,
          transition: (scene.sceneNumber ?? 1) > 1 ? 'crossfade' : 'none',
          transitionDuration: 500,
        });
      }

      // Character art overlay
      const charArt = characterArtAssets.filter(a => {
        const baseId = a.metadata?.baseCharacterId as string | undefined;
        return baseId && scene.characters?.includes(baseId);
      });
      for (const art of charArt) {
        tracks.video.push({
          type: 'overlay',
          assetId: art.id,
          startMs: startTime,
          durationMs: duration,
          position: { x: 0.1, y: 0.1 },
          scale: 0.3,
        });
      }

      // Dialogue audio
      for (const dialogue of scene.dialogue ?? []) {
        tracks.audio.push({
          type: 'dialogue',
          characterId: dialogue.characterId ?? '',
          text: dialogue.text ?? '',
          startMs: startTime,
          durationMs: Math.min(duration, (dialogue.text ?? '').length * 400),
          emotion: dialogue.emotion ?? 'neutral',
        });
      }

      // Subtitle track
      tracks.subtitle.push({
        type: 'subtitle',
        sceneNumber: scene.sceneNumber ?? 1,
        startMs: startTime,
        durationMs: duration,
        dialogues: scene.dialogue ?? [],
      });
    }

    return { tracks, totalDuration: script.reduce((sum, s) => sum + (s.estimatedDurationSeconds ?? 30), 0) * 1000 };
  }

  // =========================================================================
  // VIDEO RENDERING
  // =========================================================================

  async function renderVideo(params: {
    timeline: any;
    resolution: string;
    format: string;
    visualStyleParams: VisualStyleParams;
    subtitles: any[];
    audioTrackId: string;
  }): Promise<{ id: string; fileSize: number; sha256: string }> {
    const { timeline, resolution, format, visualStyleParams, subtitles, audioTrackId } = params;

    // Build FFmpeg command
    const ffmpegCmd = buildFFmpegCommand({
      timeline: params.timeline,
      resolution,
      format,
      subtitles: params.subtitles,
      audioTrackId,
      visualStyleParams: params.visualStyleParams,
    });

    // In production, execute via dub-engine's ffmpeg
    // For now, return mock artifact
    const artifactId = `video_${nanoid()}`;

    return {
      id: artifactId,
      fileSize: estimateFileSize(params.resolution, params.timeline.totalDuration / 1000),
      sha256: `sha256_${nanoid()}`,
    };
  }

  function buildFFmpegCommand(params: {
    timeline: any;
    resolution: string;
    format: string;
    subtitles: any[];
    audioTrackId: string;
    visualStyleParams: VisualStyleParams;
  }): string {
    const { timeline, resolution, format, subtitles, audioTrackId, visualStyleParams } = params;

    // Build filter complex for video composition
    const [width, height] = parseResolution(resolution);
    const filterParts: string[] = [];

    // Video track concatenation with transitions
    const videoInputs = timeline.tracks.video.filter((t: any) => t.type === 'video');
    const overlayInputs = timeline.tracks.video.filter((t: any) => t.type === 'overlay');

    // Build complex filter
    let filterComplex = '';

    // Scale all video inputs to target resolution
    videoInputs.forEach((input: any, i: number) => {
      filterComplex += `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}];`;
    });

    // Concatenate videos with transitions
    if (videoInputs.length > 1) {
      let concatFilter = '';
      for (let i = 0; i < videoInputs.length - 1; i++) {
        const transDur = 0.5; // 500ms
        concatFilter += `[v${i}][v${i+1}]xfade=transition=fade:duration=${transDur}:offset=${i * 5}[v${i}v${i+1}];`;
      }
      filterComplex += concatFilter;
    }

    // Add overlays
    overlayInputs.forEach((overlay: any, i: number) => {
      filterComplex += `[v${videoInputs.length-1}][${videoInputs.length + i}:v]overlay=${overlay.position?.x ?? 0}:${overlay.position?.y ?? 0}[vout${i}];`;
    });

    // Add subtitles
    if (params.subtitles.length > 0) {
      // Subtitle rendering would be added here
    }

    // Audio mixing
    filterComplex += `[0:a]volume=1.0[adialogue];`;
    if (timeline.tracks.audio.filter((t: any) => t.type === 'music').length > 0) {
      filterComplex += `[1:a]volume=0.3[amusic];`;
      filterComplex += `[adialogue][amusic]amix=inputs=2:duration=first:dropout_transition=2[amixed];`;
    } else {
      filterComplex += `[adialogue]anull[amixed];`;
    }

    return `-filter_complex "${filterComplex}" -map "[vout]" -map "[amixed]" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k`;
  }

  // =========================================================================
  // SUBTITLE GENERATION
  // =========================================================================

  function buildSubtitles(input: VideoAssemblyInput, exportSettings: any): any[] {
    const { script } = input;
    const settings = exportSettings;
    const subtitles: any[] = [];

    for (const scene of script) {
      for (const dialogue of scene.dialogue ?? []) {
        subtitles.push({
          startMs: scene.startTimeMs ?? 0,
          endMs: (scene.startTimeMs ?? 0) + (scene.estimatedDurationSeconds ?? 30) * 1000,
          text: dialogue.text ?? '',
          characterId: dialogue.characterId ?? '',
          emotion: dialogue.emotion ?? 'neutral',
          color: settings.perSpeakerSubtitleColors ? getCharacterColor(dialogue.characterId ?? '') : '#FFFFFF',
        });
      }
    }

    return subtitles;
  }

  function getCharacterColor(characterId: string): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#FFA07A', '#DDA0DD'];
    const hash = hashString(characterId);
    const index = Math.abs(hash) % colors.length;
    return colors[index]!;
  }

  // =========================================================================
  // SUBTITLE ARTIFACT GENERATION
  // =========================================================================

  async function generateSubtitleArtifact(script: ScriptScene[], format: string, perSpeakerColors: boolean): Promise<string> {
    // In production, generate SRT/VTT/ASS file
    return `subtitle_${nanoid()}.${format}`;
  }

  function generateSubtitleArtifactSync(script: ScriptScene[], format: string, perSpeakerColors: boolean): string {
    return `subtitle_${nanoid()}.${format}`;
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
  // COST CALCULATION
  // =========================================================================

  async function calculateProviderCosts(): Promise<Record<string, number>> {
    // In production, track actual API costs
    return {
      text: 0.50,
      image: 2.00,
      video: 1.00,
      audio: 0.50,
      music: 0.30,
      total: 4.30,
    };
  }

  async function getFileSize(artifactId: string): Promise<number> {
    // In production, get actual file size
    return 50 * 1024 * 1024; // 50MB estimate
  }

  async function calculateSHA256(artifactId: string): Promise<string> {
    return `sha256_${nanoid()}`;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  function nanoid(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  function parseResolution(resolution: string): [number, number] {
    const presets: Record<string, [number, number]> = {
      '480p': [854, 480],
      '720p': [1280, 720],
      '1080p': [1920, 1080],
      '4k': [3840, 2160],
    };
    return presets[resolution] ?? [1920, 1080];
  }

  function estimateFileSize(resolution: string, durationSeconds: number): number {
    const bitrates: Record<string, number> = {
      '480p': 1.5, // Mbps
      '720p': 3,
      '1080p': 6,
      '4k': 20,
    };
    const mbps = bitrates[resolution] ?? 6;
    return Math.round(mbps * 1000000 / 8 * durationSeconds);
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================

  return {
    assembleVideo,
    buildTimeline,
    renderVideo,
    buildSubtitles,
    generateSubtitleArtifact,
    calculateProviderCosts,
  };
}