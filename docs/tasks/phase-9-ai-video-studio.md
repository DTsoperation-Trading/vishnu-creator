# Phase 9 — AI Video Studio: One-Click Storyline-to-Video Generation

**Status:** Proposed · **Default risk tier:** P2 (orchestration, new template, multi-stage pipeline, dual-track UI) · **Estimate:** ≈8–10 weeks · **Depends on:** Phase 8 (providers live), Phase 5 (VoxCPM2), Phase 3 (dub engine)
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases) · **ADR:** [ADR-0008](../adr/0008-ai-video-studio-one-click-generation.md)

## Goal

A new Creator template **"AI Video Studio"** with **dual-track architecture** (Canvas + Pipeline) that takes a **topic/idea** and produces a **complete, playable video** in one click:

**Topic** → **Storyline** → **Characters** → **Visual Assets** → **Voice Synthesis** → **Video Assembly** → **MP4 + SRT + Project**

Khmer-first: storylines, voices, subtitles, cultural context all native Khmer.

**Inspired by DramaClaw's proven architecture**: dual-track (Canvas + Pipeline), Xia Director agent, asset library, visual style extraction, workflow skills, model gateway, checkpoint/resume.

## Architecture: Dual-Track Studio (Canvas + Pipeline)

See [ADR-0008](../adr/0008-ai-video-studio-one-click-generation.md) for full architecture diagram.

### Dual-Track Architecture

| Track | Purpose | Key Features |
|-------|---------|--------------|
| **Pipeline** | Structured production | 5-stage orchestrator, checkpoints, progress SSE, approval gates |
| **Canvas** | Free exploration | 18 node types, visual style wall, Director World (future), commit to pipeline |
| **Asset Library (XiaTang)** | Shared identities | Characters, scenes, props, voices, visual styles |

### 5-Stage Pipeline Orchestrator (daemon executor with checkpoints)

| Stage | Input | Output | Key Providers | Checkpoint |
|-------|-------|--------|---------------|------------|
| 1. Storyline | Topic + style | Outline, character bible, full script | LLM (Gemini/Claude) | ✅ |
| 2. Characters | Character bible | Visual design, voice profiles, rig | FLUX/ControlNet, VoxCPM2 | ✅ |
| 3. Assets | Characters + script | Backgrounds, character art, props | FLUX, SD, ComfyUI | ✅ |
| 4. Voice | Script + voices | Multi-speaker audio + lip-sync | VoxCPM2, Edge-TTS, providers | ✅ |
| 5. Assembly | Assets + voice | Timeline, transitions, MP4 | FFmpeg, Runway/Luma | ✅ |

**Each stage is a daemon executor with checkpoint/resume** — kill job mid-pipeline → resume from last completed stage.

## Tasks

| ID | Task | Status | Evidence |
|---|---|---|---|
| T9.1 | **Foundation & Vishnu Director Agent**: Agent class (workflow planner, stage executor, canvas graph builder), Model Gateway (OpenAI-compatible, RelayClaw pattern), Asset Library schema (characters, scenes, props, voices, visual styles), Stage Checkpoint System (persist/resume at each of 5 stages) | done | Implemented in `apps/daemon/src/creator/ai-video-studio/` (`asset-library.ts`, `stage-checkpoint.ts`, `model-gateway.ts`, `visual-style-extractor.ts`, `vishnu-director-agent.ts`). Verified: `pnpm --filter @vishnucreator/daemon exec vitest run test/unit/ai-video-studio.test.ts` (6/6 passed), `pnpm typecheck` (9/9 passed 0 errors), `pnpm --filter @vishnucreator/daemon build` (exit 0). |
| T9.2 | **Storyline Generator**: LLM prompt templates (outline → script), character bible extraction (names, traits, arcs, voice profiles), Khmer cultural rules, JSON schema for script (scenes, dialogue, camera notes) | done | Implemented in `apps/daemon/src/creator/ai-video-studio/storyline-generator.ts` with Zod validation schemas, prompt templates, Khmer text normalization, and scene refinement. Verified: `pnpm --filter @vishnucreator/daemon exec vitest run test/unit/storyline-generator.test.ts test/unit/ai-video-studio.test.ts` (14/14 passed), `pnpm typecheck` (9/9 passed 0 errors), `pnpm --filter @vishnucreator/daemon build` (exit 0). |
| T9.3 | **Character Factory**: Visual design prompts (consistent seed + ControlNet + LoRA), voice profile assignment (VoxCPM2 clone/design/Edge-TTS), character registry (XiaTang-style), animation rig selection (stickman, sprite, Live2D) | todo | |
| T9.4 | **Asset Pipeline**: Scene image generation (backgrounds + characters), ControlNet for pose/consistency, asset management (versioning, regeneration, commit to pipeline), Visual Style extractor (reference → style params → apply) | todo | |
| T9.5 | **Multi-Speaker Voice Synthesis**: Dub-engine extension (per-character voice mapping), prosody/emotion tags → TTS params, lip-sync timing export, multi-speaker audio mixing | todo | |
| T9.6 | **Video Assembler**: Timeline composer (scenes→shots→cuts), transitions/effects (ken burns, zoom, pan), styled subtitle burn-in per speaker, music integration, multi-resolution export | todo | |
| T9.7 | **Creator Template & Daemon Integration**: Register `ai-video-studio` template, 5-stage executor with checkpoints, progress SSE, stage approval/regeneration API | todo | |
| T9.8 | **Dual-Track Studio Workspace**: Pipeline Tab (progress, preview, approval, regeneration), Canvas Tab (18 node types, style wall, commit to pipeline), Asset Library Tab (XiaTang: characters, scenes, props, voices, styles), Collaboration Panel + Task Center integration | todo | |
| T9.9 | **Settings, Providers & Cost**: Default provider config (text, image, video, tts, music, gateway), cost estimates, Khmer quality presets, Visual Style presets (45+ looks), hard cap setting | todo | |
| T9.9 | **E2E Test & Demo**: "Khmer folktale: The Rabbit and the Tiger" → 2-min animated video with 3 characters, Khmer voices, styled subtitles, background music, scene transitions | todo | |
| T9.10 | **Documentation & User Guide**: Studio workflow, prompt tips, character design guide, provider cost table, visual style guide | todo | |
| T9.11 | **Performance & Cost Optimization**: Stage caching, local-first fallbacks, provider cost estimates, overnight queue, stage regeneration | todo | |
| T9.12 | **Polish & Release**: Installer includes studio, Khmer folktale demo project, marketing assets | todo | |

## Implementation Phases (DramaClaw-Inspired)

### Phase 9.1: Foundation & Vishnu Director Agent (Week 1-2)
- **Vishnu Director Agent**: Workflow planner, stage executor, canvas graph builder, visual style extractor
- **Model Gateway**: OpenAI-compatible gateway (RelayClaw pattern - DramaClaw)
- **Asset Library Schema**: Characters, scenes, props, voices, visual styles (XiaTang-style)
- **Stage Checkpoint System**: Persist/resume at each of 5 stages (DramaClaw Task Center pattern)

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
- **Canvas Tab**: Node-based (18 types), free exploration, visual style wall (45+)
- **Asset Library Tab (XiaTang)**: Characters, scenes, props, voices, styles
- **Collaboration Panel** + **Task Center** integration (DramaClaw pattern)

### Phase 9.8: Settings, Providers & Polish (Week 8-9)
- Default provider config (text, image, video, tts, music, gateway)
- Cost estimates, Khmer quality presets
- Visual Style presets (45+ looks like DramaClaw)
- E2E test: "Khmer folktale → 2-min video"

### Phase 9.9: Documentation & Release (Week 9-10)
- Documentation & User Guide
- Installer includes studio, Khmer folktale demo project
- Marketing assets

## Rules for this Phase

- **No fake pipeline**: Each stage must produce real output verifiable by the next stage. No stubbing.
- **Khmer-first**: Story prompts, character names, voice profiles, subtitle styles all Khmer-native.
- **Checkpoint resume**: Kill job mid-pipeline → resume from last completed stage (DramaClaw Task Center).
- **Provider flexibility**: Each stage configurable (local/cloud) per ADR-0003 tiers.
- **Cost transparency**: Show estimated API cost before generation starts.
- **Dual-track sync**: Canvas commits → Pipeline stages; Pipeline results → Canvas nodes.

## Acceptance Criteria (Exit Gate)

1. **E2E Demo**: User enters "រឿងខ្មែរ: ឃ្លានជាតិ ខ្លែងនិងខ្លា" → clicks Generate → gets 2-min MP4 with:
   - 3 distinct characters (visual + voice)
   - Khmer narration + dialogue (VoxCPM2)
   - Styled subtitles (per-speaker colors)
   - Background music
   - Scene transitions
2. **Resume Test**: Kill at Stage 3 → restart → completes from Stage 3.
3. **Regeneration**: User rejects Stage 2 characters → re-generates only Stage 2+3+4+5.
4. **Cost Estimate**: Shows $ estimate before Stage 1 starts.
5. **Dual-Track**: User can switch between Pipeline ↔ Canvas, commit Canvas nodes to Pipeline.
4. **All checks green**: `pnpm typecheck`, `pnpm test`, `pytest`, `pnpm build`.

## Dependencies

| Phase | Provides |
|-------|----------|
| Phase 3 | Dub engine (TTS, audio mixing, checkpointing) |
| Phase 5 | VoxCPM2 (clone, design, LoRA, 48kHz) |
| Phase 6 | Creator template framework, Collaboration Panel, Task Center |
| Phase 8 | Live provider adapters (text, image, video, TTS, music, gateway) |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Character visual inconsistency | High | High | ControlNet + LoRA + fixed seed per character (DramaClaw) |
| Multi-speaker voice sync | Medium | High | Dub-engine extension with per-speaker timing |
| Pipeline too slow on T1 CPU | High | Medium | Stage checkpoints + overnight queue + local-first (DramaClaw) |
| API cost runaway | Medium | Low | Pre-flight estimate + hard cap setting |
| Script quality variance | Medium | Medium | Structured JSON schema + few-shot prompts |
| Dual-track complexity | High | Medium | Incremental: Pipeline first, then Canvas; shared Asset Library |
| Character consistency across scenes | High | High | ControlNet + LoRA + fixed seed + Director World prep |