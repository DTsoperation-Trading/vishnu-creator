# ADR-0008: AI Video Studio — One-Click Storyline-to-Video Generation

- **Status:** Proposed
- **Date:** 2026-11-09
- **Deciders:** Project owner

## Context

The current Vishnu Creator (Phases 0-8) provides:
- Video translation & dubbing (EN→KM with VoxCPM2, Edge-TTS)
- Smart dubbing (TTS with multiple providers)
- Subtitle editing & burn-in
- Cover/thumbnail generation
- Article/SEO writing
- Video download from platforms
- Stickman animation videos
- Image generation (FLUX, Stability, etc.)
- Video generation (Runway, Luma, MiniMax, ComfyUI)

**Gap:** No unified "one-click" pipeline that takes a **topic/idea** and produces a **complete video** with:
1. **Storyline/script** — AI-written narrative with scenes, dialogue, pacing
2. **Characters** — Consistent character design, voices, personalities
3. **Visuals** — Scene images, character sprites, backgrounds, transitions
4. **Voice** — Multi-speaker TTS with character-appropriate voices
5. **Full video** — Assembled with timing, music, effects, captions

This is the "CapCut/Canva for AI video" use case: **Idea → Complete Video in one click.**

**Inspiration from DramaClaw**: DramaClaw demonstrates a production-grade "novel → finished video" pipeline with:
- **Dual-track architecture**: Canvas (free exploration) + Pipeline (structured production) sharing one asset library
- **Xia Director Agent**: Built-in agent that plans workflows, drives pipeline tasks, builds node graphs
- **Asset library**: Characters, scenes, props, voices with stable identities across episodes
- **Director World**: 3D previs for scene layout, character blocking, camera design
- **Visual Style extraction**: Reference image → style params → apply across project
- **Workflow Skills**: 11 workflow skills, 60 recipes, install/export/share bundles
- **Ports & Adapters**: Hexagonal architecture - core decoupled from runtime
- **In-process task execution**: No Redis/Celery needed
- **Model gateway**: OpenAI-compatible gateway for all models
- **Asset library**: Characters, scenes, props, voices with stable identities
- **Visual Style extraction**: Reference image → style params → apply across project
- **Task Center**: Status, progress, logs, cancel/retry, resume-from-checkpoint

## Decision

Add **Phase 9: AI Video Studio — One-Click Generation** as a new major phase after Phase 8.

### Architecture: Dual-Track Studio (Canvas + Pipeline)

Following DramaClaw's proven dual-track architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        AI VIDEO STUDIO (Creator Template)                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐                    ┌─────────────────────────────────────┐  │
│  │   CANVAS TRACK      │ ←→ shared assets → │         PIPELINE TRACK               │  │
│  │  (Free Exploration) │    (Asset Library)  │    (Structured Production)          │  │
│  ├─────────────────────┤                    ├─────────────────────────────────────┤  │
│  │ • Node-based canvas │                    │ Stage 1: STORYLINE GENERATOR         │  │
│  │ • 18 node types     │                    │   ├─ Topic → Outline (acts, beats)   │  │
│  │ • Free exploration  │                    │   ├─ Character bible (traits, arcs)  │  │
│  │ • Commit to pipeline│                    │   └─ Full script (dialogue, camera)  │  │
│  │ • Visual Style ref  │                    │                                       │  │
│  │ • Director World    │                    │ Stage 2: CHARACTER FACTORY           │  │
│  │   (3D previs)       │                    │   ├─ Visual design (LoRA + seed)     │  │
│  └─────────────────────┘                    │   ├─ Voice profiles (VoxCPM2/Edge)   │  │
│                                             │   └─ Animation rig (stickman/sprite) │  │
│  Shared Asset Library (XiaTang):           │                                       │  │
│  • Characters (portraits, variants)        │ Stage 3: ASSET PIPELINE              │  │
│  • Scenes (backgrounds, 360° sets)         │   ├─ Backgrounds (FLUX, SD, ComfyUI) │  │
│  • Props / overlays                        │   ├─ Character art (consistent)      │  │
│  • Voices (VoxCPM2, Edge-TTS, providers)   │   ├─ Props / overlays / effects      │  │
│  • Visual Styles (extracted from ref)      │   └─ Subtitle templates (per char)   │  │
│  • Visual Style params (from reference)    │                                       │  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Stages (5-Stage Orchestrator with Checkpoints)

| Stage | Input | Output | Key Providers | Checkpoint |
|-------|-------|--------|---------------|------------|
| 1. Storyline | Topic + style | Outline, character bible, full script | LLM (Gemini/Claude) | ✅ |
| 2. Characters | Character bible | Visual design, voice profiles, rig | FLUX/ControlNet, VoxCPM2 | ✅ |
| 3. Assets | Characters + script | Backgrounds, character art, props | FLUX, SD, ComfyUI | ✅ |
| 4. Voice | Script + voices | Multi-speaker audio + lip-sync | VoxCPM2, Edge-TTS, providers | ✅ |
| 5. Assembly | Assets + voice | Timeline, transitions, MP4 | FFmpeg, Runway/Luma | ✅ |

**Each stage is a daemon executor with checkpoint/resume** — kill job mid-pipeline → resume from last completed stage.

### Integration Points

| Component | Reuse | Extend |
|-----------|-------|--------|
| `services/dub-engine` | TTS, voice cloning, audio mixing | Multi-speaker orchestration |
| `apps/daemon/src/creator/video-generation` | Video gen providers | Timeline composer |
| `apps/daemon/src/creator/image-generation` | Image providers | Consistent character gen (ControlNet) |
| `apps/daemon/src/creator/smart-dubbing` | TTS pipeline | Prosody/emotion control |
| `packages/protocol` | Creator templates, job types | New `ai-video-studio` template |
| `apps/web/src/features/dashboard` | Workspaces, collaboration panel | Studio workspace (dual-track UI) |
| `apps/daemon/src/creator/agents` | Creator agents | **Xia Director Agent** (workflow planner) |

### New Agent: **Vishnu Director** (inspired by DramaClaw's Xia Director)

```typescript
// apps/daemon/src/creator/agents/vishnu-director.ts
export class VishnuDirectorAgent {
  // Plans workflow from topic → structured Intent
  async planWorkflow(topic: string, style: Style): Promise<WorkflowIntent>
  
  // Drives pipeline stages with checkpoints
  async executeStage(stage: StageId, context: StageContext): Promise<StageResult>
  
  // Builds canvas node graphs for exploration
  async buildCanvasGraph(intent: WorkflowIntent): Promise<CanvasGraph>
  
  // Extracts visual style from reference image
  async extractVisualStyle(image: ImageRef): Promise<VisualStyleParams>
  
  // Manages asset library identities
  async registerCharacter(char: CharacterProfile): Promise<AssetId>
  async getCharacter(assetId: AssetId): Promise<CharacterProfile>
}
```

### New Creator Template: `ai-video-studio`

```typescript
// packages/protocol/src/creator-templates.ts
export const AI_VIDEO_STUDIO_TEMPLATE: CreatorTemplate = {
  id: 'ai-video-studio',
  name: 'AI Video Studio',
  description: 'One-click: Topic → Storyline → Characters → Full Video (Canvas + Pipeline)',
  phases: [
    { id: 'storyline', name: 'Storyline', dependsOn: [] },
    { id: 'characters', name: 'Characters', dependsOn: ['storyline'] },
    { id: 'assets', name: 'Visual Assets', dependsOn: ['characters'] },
    { id: 'voice', name: 'Voice Synthesis', dependsOn: ['characters'] },
    { id: 'assembly', name: 'Video Assembly', dependsOn: ['assets', 'voice'] },
  ],
  defaultProviders: {
    text: 'gemini-2.5-pro',        // Long-context storyline
    image: 'flux-pro',             // Consistent characters (ControlNet)
    video: 'runway-gen4',          // Scene motion
    tts: 'voxcpm2',                // Character voices
    music: 'suno',                 // Background music
    gateway: 'relayclaw',          // Model gateway (DramaClaw pattern)
  },
  // Dual-track UI config
  ui: {
    dualTrack: true,               // Canvas + Pipeline tabs
    assetLibrary: true,            // XiaTang-style library
    visualStyleExtractor: true,    // Style from reference
    directorWorld: false,          // 3D previs (future)
    taskCenter: true,              // Progress, logs, cancel/retry
  },
};
```

### User Flow (Dual-Track)

```
1. User opens "AI Video Studio" from dashboard
   ├─ Tab 1: PIPELINE — Structured production (default)
   └─ Tab 2: CANVAS — Free exploration (node-based)

2. PIPELINE MODE:
   ├─ Enters topic: "Khmer folktale: The Rabbit and the Tiger"
   ├─ Selects style: [Animation] [Live-action] [Documentary] [Shorts]
   ├─ Clicks "Generate Video"
   ├─ Studio shows: Storyline → Characters → Scenes → Voice → Assembly
   ├─ Each stage: preview → approve/regenerate → next
   └─ Final: MP4 + SRT + Project (auto-committed to Canvas)

3. CANVAS MODE:
   ├─ Node-based exploration (18 node types)
   ├─ Generate/regenerate individual assets
   ├─ Visual Style wall (45+ looks)
   ├─ Director World (3D previs - future)
   └─ Commit to Pipeline: promotes nodes → structured production

4. Asset Library (XiaTang):
   ├─ Characters: portraits, voice profiles, variants
   ├─ Scenes: backgrounds, 360° sets
   ├─ Props, overlays, effects
   ├─ Voices: VoxCPM2 clones, Edge-TTS, providers
   └─ Visual Styles: extracted params from references
```

## Consequences

### Positive
- **Killer feature** — Differentiates from CapCut/Canva by being fully AI-native + dual-track
- **DramaClaw-proven architecture** — Dual-track, asset library, agent planner, checkpoints
- **Reuses existing infrastructure** — Dub engine, TTS, image/video providers, daemon
- **Khmer-first** — Storylines, voices, subtitles all natively Khmer
- **Resumable** — Checkpoint at each stage (storyline, characters, assets, voice)
- **Editable** — User can intervene at any stage; Canvas for fine-tuning
- **Model-neutral** — Gateway pattern (DramaClaw) for provider flexibility

### Risks
| Risk | Mitigation |
|------|------------|
| Complex orchestration | Build as daemon executor pipeline with checkpoints (DramaClaw pattern) |
| Character consistency | Use LoRA/ControlNet for character locking + fixed seed per character |
| Long generation time | Stage-by-stage previews; overnight queue; local-first fallbacks |
| Cost (API calls) | Show estimate before start; local-first options; hard cap setting |
| Quality variance | Regeneration per stage; human-in-the-loop approval |

## Implementation Phases

### Phase 9.1: Foundation & Xia Director Agent (Week 1-2)
- **Vishnu Director Agent**: Workflow planner, stage executor, canvas graph builder
- **Model Gateway**: OpenAI-compatible gateway (RelayClaw pattern)
- **Asset Library Schema**: Characters, scenes, props, voices, visual styles
- **Stage Checkpoint System**: Persist/resume at each of 5 stages

### Phase 9.2: Storyline Generator (Week 2-3)
- LLM prompt templates for outline → script
- Character bible extraction (names, traits, arcs, voice profiles)
- Khmer cultural rules integration
- JSON schema for script (scenes, dialogue, camera notes)

### Phase 9.3: Character Factory (Week 3-4)
- Visual design prompts (consistent seed + ControlNet + LoRA)
- Voice profile assignment (VoxCPM2 clone/design, Edge-TTS)
- Character registry persisted per project (XiaTang-style)
- Animation rig selection (stickman, sprite sheets, Live2D)

### Phase 9.4: Asset Pipeline (Week 4-5)
- Scene image generation (backgrounds + characters)
- ControlNet for pose/consistency (DramaClaw Director World prep)
- Asset management (versioning, regeneration, commit to pipeline)
- Visual Style extractor: reference image → style params → apply

### Phase 9.5: Multi-Speaker Voice Synthesis (Week 5-6)
- Dub-engine extension: per-character voice mapping
- Prosody/emotion tags in script → TTS parameters
- Lip-sync timing export for animation sync
- Multi-speaker audio mixing (voice + SFX + music)

### Phase 9.6: Video Assembler (Week 6-7)
- Timeline composer (scenes → shots → cuts)
- Transition/effects library (ken burns, zoom, pan)
- Styled subtitle burn-in (per-speaker colors)
- Music integration (AI-generated or library)
- Multi-resolution export (MP4, WebM)

### Phase 9.7: Dual-Track Studio Workspace (Week 7-8)
- **Pipeline Tab**: Progress tracking, per-stage preview/approval, regeneration
- **Canvas Tab**: Node-based (18 types), free exploration, visual style wall
- **Asset Library (XiaTang)**: Characters, scenes, props, voices, styles
- **Collaboration Panel** integration (existing)
- **Task Center**: Progress, logs, cancel/retry, resume-from-checkpoint
- **Export options**: MP4 + SRT + Project (dual-track sync)

### Phase 9.8: Settings, Providers & Polish (Week 8-9)
- Default provider config (text, image, video, tts, music, gateway)
- Cost estimates, Khmer quality presets
- Visual Style presets (45+ looks like DramaClaw)
- E2E test: "Khmer folktale → 2-min video"
- Documentation & User Guide

## Alternatives Considered

1. **External tool integration** (CapCut API, Runway) — Limited control, subscription costs
2. **Pure local** — Too slow on T1 hardware for full pipeline
3. **Template-only** (no AI storyline) — Less magical, more manual work
4. **Pipeline-only** (no Canvas) — Loses exploration/iteration capability

## References

- **DramaClaw** — Dual-track architecture, Xia Director, Asset Library, Workflow Skills, Gateway pattern
- Phase 6 (Creator Studios) — Template framework, Collaboration Panel
- Phase 5 (VoxCPM2) — Voice cloning/design, 48kHz
- Phase 3 (Dub Engine) — TTS, audio mixing, checkpointing
- Phase 8 (AI Providers) — Live provider adapters (text, image, video, TTS, music)
- ADR-0003 — Adaptive compute tiers (T1 CPU pipeline)
- ADR-0004 — Reference folder policy (DramaClaw source available)