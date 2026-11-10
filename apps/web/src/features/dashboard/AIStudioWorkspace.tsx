import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Download,
  HardDriveDownload,
  Image,
  LoaderCircle,
  Layers,
  Mic2,
  Play,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
  Zap,
  Film,
  Music,
  MessageSquare,
  Palette,
  GitBranch,
  Eye,
  Monitor,
  WandSparkles,
  Zap as ZapIcon,
} from 'lucide-react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import type { DubEngineRuntimeStatus, ModelCatalogItem, ModelDownloadProgress, VoiceLibraryItem } from '@vishnucreator/protocol';
import './ai-studio.css';

export type AIStudioPhase = 'storyline' | 'characters' | 'assets' | 'voice' | 'assembly';

export interface AIStudioConfig {
  onBackToDashboard(): void;
  onGenerateVideo(topic: string, style: string): void;
  onOpenSettings?(tab?: string, section?: string): void;
  creatorServicesService?: CreatorServicesSettingsService | null;
}

const PHASE_INFO: Record<AIStudioPhase, {
  label: string;
  labelEn: string;
  icon: React.ReactNode;
  description: string;
  descriptionEn: string;
  estimatedTime: string;
}> = {
  storyline: {
    label: '故事大纲',
    labelEn: 'Storyline',
    icon: <MessageSquare size={20} />,
    description: '生成大纲、角色设定、完整剧本',
    descriptionEn: 'Generate outline, character bible, and full script',
    estimatedTime: '~2 min',
  },
  characters: {
    label: '角色工厂',
    labelEn: 'Characters',
    icon: <Image size={20} />,
    description: '设计外观、分配音色、创建动画绑定',
    descriptionEn: 'Design visual appearance, assign voices, create rigs',
    estimatedTime: '~3 min',
  },
  assets: {
    label: '视觉资产',
    labelEn: 'Visual Assets',
    icon: <Film size={20} />,
    description: '生成背景、角色图、道具、提取视觉风格',
    descriptionEn: 'Generate backgrounds, character art, props, extract visual style',
    estimatedTime: '~5 min',
  },
  voice: {
    label: '语音合成',
    labelEn: 'Voice Synthesis',
    icon: <Mic2 size={20} />,
    description: '多说话人 TTS、韵律、口型同步',
    descriptionEn: 'Multi-speaker TTS, prosody, lip-sync',
    estimatedTime: '~4 min',
  },
  assembly: {
    label: '视频组装',
    labelEn: 'Video Assembly',
    icon: <ZapIcon size={20} />,
    description: '时间轴、转场、字幕、音乐、导出',
    descriptionEn: 'Timeline, transitions, subtitles, music, export',
    estimatedTime: '~3 min',
  },
};

const PHASE_ORDER: AIStudioPhase[] = ['storyline', 'characters', 'assets', 'voice', 'assembly'];

export function AIStudioWorkspace(props: AIStudioConfig) {
  const l = useLocalizedCopy();
  const [currentPhase, setCurrentPhase] = useState<AIStudioPhase>('storyline');
  const [phaseProgress, setPhaseProgress] = useState<Record<AIStudioPhase, number>>({
    storyline: 0,
    characters: 0,
    assets: 0,
    voice: 0,
    assembly: 0,
  });
  const [phaseStatus, setPhaseStatus] = useState<Record<AIStudioPhase, 'pending' | 'running' | 'completed' | 'failed'>>({
    storyline: 'pending',
    characters: 'pending',
    assets: 'pending',
    voice: 'pending',
    assembly: 'pending',
  });
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState<string>('animation');
  const [targetLanguage, setTargetLanguage] = useState('km');
  const [targetDuration, setTargetDuration] = useState(120);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [generatedAssets, setGeneratedAssets] = useState<any[]>([]);
  const [costEstimate, setCostEstimate] = useState<number>(0);
  const [showCostEstimate, setShowCostEstimate] = useState(false);

  const phaseRefs = useRef<Record<AIStudioPhase, HTMLDivElement | null>>({
    storyline: null,
    characters: null,
    assets: null,
    voice: null,
    assembly: null,
  });

  // Canvas tab state
  const [activeTab, setActiveTab] = useState<'pipeline' | 'canvas'>('pipeline');
  const [canvasNodes, setCanvasNodes] = useState<any[]>([]);
  const [canvasConnections, setCanvasConnections] = useState<any[]>([]);

  // Cost estimate calculation
  useEffect(() => {
    const estimates: Record<string, number> = {
      storyline: 0.50,
      characters: 2.00,
      assets: 5.00,
      voice: 1.00,
      assembly: 0.30,
    };
    const total = Object.values(estimates).reduce((sum, v) => sum + v, 0);
    setCostEstimate(total);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      setError(l('请输入主题或故事创意', 'Please enter a topic or story idea'));
      return;
    }

    setError(null);
    setIsGenerating(true);
    setCurrentPhase('storyline');
    setPhaseStatus(prev => ({ ...prev, storyline: 'running' }));
    setPhaseProgress(prev => ({ ...prev, storyline: 10 }));

    try {
      // Call the generation API
      const response = await fetch('/api/ai-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          style,
          targetLanguage,
          targetDuration,
        }),
      });

      if (!response.ok) {
        throw new Error('Generation failed');
      }

      const result = await response.json();
      setCurrentJobId(result.jobId);

      // Simulate phase progression
      await simulatePhaseProgression(result.jobId);

    } catch (err) {
      setError(l('生成失败: ', 'Generation failed: ') + (err instanceof Error ? err.message : String(err)));
      setPhaseStatus(prev => ({ ...prev, [currentPhase]: 'failed' }));
      setIsGenerating(false);
    }
  }, [topic, style, targetLanguage, currentPhase, l]);

  const simulatePhaseProgression = async (jobId: string) => {
    const phases = PHASE_ORDER;
    let currentIndex = 0;

    for (const phase of phases) {
      if (phase === 'storyline') continue; // Already running

      setCurrentPhase(phase);
      setPhaseStatus(prev => ({ ...prev, [phase]: 'running' }));
      setPhaseProgress(prev => ({ ...prev, [phase]: 10 }));

      // Simulate progress
      for (let progress = 10; progress <= 100; progress += 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setPhaseProgress(prev => ({ ...prev, [phase]: progress }));
      }

      setPhaseStatus(prev => ({ ...prev, [phase]: 'completed' }));
      setPhaseProgress(prev => ({ ...prev, [phase]: 100 }));
    }

    setIsGenerating(false);
    setPhaseStatus(prev => ({ ...prev, assembly: 'completed' }));
  };

  const handlePhaseClick = useCallback((phase: AIStudioPhase) => {
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    const targetIndex = PHASE_ORDER.indexOf(phase);

    if (targetIndex <= currentIndex || phaseStatus[phase] === 'completed') {
      setCurrentPhase(phase);
    }
  }, [currentPhase, phaseStatus]);

  const handleCanvasNodeAdd = useCallback((node: any) => {
    setCanvasNodes(prev => [...prev, { ...node, id: `node_${Date.now()}` }]);
  }, []);

  const handleCanvasConnection = useCallback((connection: any) => {
    setCanvasConnections(prev => [...prev, { ...connection, id: `conn_${Date.now()}` }]);
  }, []);

  const handleCommitToPipeline = useCallback(() => {
    // Commit canvas nodes to pipeline
    console.log('Committing canvas nodes to pipeline:', canvasNodes);
  }, [canvasNodes]);

  const currentPhaseInfo = PHASE_INFO[currentPhase];

  return (
    <div className="ai-studio-workspace">
      {/* Header */}
      <header className="ai-studio-header">
        <button
          className="ai-studio-back"
          onClick={props.onBackToDashboard}
          aria-label={l('返回仪表盘', 'Back to Dashboard')}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="ai-studio-title">
          <h1>
            <Sparkles size={24} className="ai-studio-icon" />
            {l('AI 视频工作室', 'AI Video Studio')}
          </h1>
          <p className="ai-studio-subtitle">{l('一键：主题 → 大纲 → 角色 → 资产 → 语音 → 视频', 'One-click: Topic → Storyline → Characters → Assets → Voice → Video')}</p>
        </div>

        <div className="ai-studio-actions">
          {currentJobId && (
            <button
              className="ai-studio-btn ai-studio-btn-secondary"
              onClick={() => setShowCostEstimate(!showCostEstimate)}
            >
              <HardDriveDownload size={16} />
              {l('成本: $', 'Cost: $')} {costEstimate.toFixed(2)}
            </button>
          )}
          {currentJobId && !isGenerating && (
            <button
              className="ai-studio-btn ai-studio-btn-primary"
              onClick={() => window.open(`/api/ai-studio/download/${currentJobId}`, '_blank')}
              disabled={phaseStatus.assembly !== 'completed'}
            >
              <Download size={16} />
              {l('下载视频', 'Download Video')}
            </button>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="ai-studio-error-banner">
          <CircleAlert size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label={l('关闭', 'Dismiss')}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="ai-studio-tabs">
        <button
          className={`ai-studio-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
        >
          <Layers size={18} />
          {l('流水线', 'Pipeline')}
        </button>
        <button
          className={`ai-studio-tab ${activeTab === 'canvas' ? 'active' : ''}`}
          onClick={() => setActiveTab('canvas')}
        >
          <ZapIcon size={18} />
          {l('画布', 'Canvas')}
        </button>
      </div>

      {/* Pipeline View */}
      {activeTab === 'pipeline' && (
        <div className="ai-studio-pipeline">
          {/* Phase Progress Bar */}
          <div className="ai-studio-phase-bar">
            {PHASE_ORDER.map((phase, index) => {
              const info = PHASE_INFO[phase];
              const status = phaseStatus[phase];
              const progress = phaseProgress[phase];
              const isCurrent = phase === currentPhase;
              const isCompleted = status === 'completed';
              const isRunning = status === 'running';
              const isFailed = status === 'failed';
              const canClick = status === 'completed' || (index <= PHASE_ORDER.indexOf(currentPhase) && (status === 'pending' || isRunning));

              return (
                <div
                  key={phase}
                  className={`ai-studio-phase ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${isRunning ? 'running' : ''} ${isFailed ? 'failed' : ''}`}
                  onClick={() => canClick && handlePhaseClick(phase)}
                  style={{ cursor: canClick ? 'pointer' : 'default' }}
                  ref={(el) => { phaseRefs.current[phase] = el; }}
                >
                  <div className="ai-studio-phase-header">
                    <div className="ai-studio-phase-icon-wrapper">
                      <span className={`ai-studio-phase-icon ${isCompleted ? 'completed' : ''} ${isRunning ? 'running' : ''} ${isFailed ? 'failed' : ''}`}>
                        {isCompleted ? <CheckCircle2 size={20} /> : isRunning ? <LoaderCircle size={20} className="spin" /> : isFailed ? <CircleAlert size={20} /> : info.icon}
                      </span>
                      {index < PHASE_ORDER.length - 1 && (
                        <div className={`ai-studio-phase-connector ${isCompleted ? 'completed' : ''}`} />
                      )}
                    </div>
                    <div className="ai-studio-phase-info">
                      <span className="ai-studio-phase-label">{l(info.label, info.labelEn)}</span>
                      <span className="ai-studio-phase-time">{info.estimatedTime}</span>
                    </div>
                    {isRunning && (
                      <div className="ai-studio-phase-progress">
                        <div
                          className="ai-studio-progress-bar"
                          style={{ width: `${phaseProgress[phase]}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current Phase Detail */}
          <div className="ai-studio-phase-detail" ref={(el) => { phaseRefs.current[currentPhase] = el; }}>
            {currentPhase === 'storyline' && (
              <StorylinePhase
                topic={topic}
                setTopic={setTopic}
                style={style}
                setStyle={setStyle}
                targetLanguage={targetLanguage}
                setTargetLanguage={setTargetLanguage}
                targetDuration={targetDuration}
                setTargetDuration={setTargetDuration}
                isGenerating={isGenerating}
                onGenerate={handleGenerate}
                error={error}
                l={l}
              />
            )}

            {currentPhase === 'characters' && (
              <CharactersPhase
                jobId={currentJobId}
                phaseStatus={phaseStatus.characters}
                l={l}
              />
            )}

            {currentPhase === 'assets' && (
              <AssetsPhase
                jobId={currentJobId}
                phaseStatus={phaseStatus.assets}
                l={l}
              />
            )}

            {currentPhase === 'voice' && (
              <VoicePhase
                jobId={currentJobId}
                phaseStatus={phaseStatus.voice}
                l={l}
              />
            )}

            {currentPhase === 'assembly' && (
              <AssemblyPhase
                jobId={currentJobId}
                phaseStatus={phaseStatus.assembly}
                l={l}
              />
            )}
          </div>

          {/* Cost Estimate Modal */}
          {showCostEstimate && (
            <div className="ai-studio-modal-overlay" onClick={() => setShowCostEstimate(false)}>
              <div className="ai-studio-modal" onClick={e => e.stopPropagation()}>
                <h3>{l('预估成本明细', 'Estimated Cost Breakdown')}</h3>
                <div className="ai-studio-cost-breakdown">
                  {Object.entries({
                    Storyline: 0.50,
                    Characters: 2.00,
                    Assets: 5.00,
                    Voice: 1.00,
                    Assembly: 0.30,
                  }).map(([stage, cost]) => (
                    <div key={stage} className="ai-studio-cost-item">
                      <span>{l(stage, stage)}</span>
                      <span>${cost.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="ai-studio-cost-total">
                    <span>{l('预估总计', 'Total Estimated')}</span>
                    <span>${costEstimate.toFixed(2)} USD</span>
                  </div>
                </div>
                <button className="ai-studio-btn ai-studio-btn-primary" onClick={() => setShowCostEstimate(false)}>
                  {l('关闭', 'Close')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Canvas View */}
      {activeTab === 'canvas' && (
        <div className="ai-studio-canvas">
          <div className="ai-studio-canvas-toolbar">
            <h3>{l('画布 - 自由探索', 'Canvas - Free Exploration')}</h3>
            <div className="ai-studio-canvas-actions">
              <button className="ai-studio-btn ai-studio-btn-secondary" onClick={handleCommitToPipeline}>
                <GitBranch size={16} />
                {l('提交到流水线', 'Commit to Pipeline')}
              </button>
            </div>
          </div>
          <div className="ai-studio-canvas-area">
            <div className="ai-studio-canvas-nodes">
              {canvasNodes.map(node => (
                <div
                  key={node.id}
                  className="ai-studio-canvas-node"
                  style={{ left: node.x, top: node.y }}
                >
                  <span>{node.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// PHASE COMPONENTS
// =========================================================================

function StorylinePhase(props: {
  topic: string;
  setTopic: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  targetLanguage: string;
  setTargetLanguage: (v: string) => void;
  targetDuration: number;
  setTargetDuration: (v: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  error: string | null;
  l: (chinese: string, english: string) => string;
}) {
  return (
    <div className="ai-studio-phase-content">
      <div className="ai-studio-form">
        <div className="ai-studio-form-group">
          <label>{props.l('故事主题 / 创意', 'Story Topic / Idea')}</label>
          <textarea
            value={props.topic}
            onChange={e => props.setTopic(e.target.value)}
            placeholder={props.l('例如："高棉民间故事：兔子和老虎"', 'e.g., "Khmer folktale: The Rabbit and the Tiger"')}
            rows={3}
            disabled={props.isGenerating}
          />
        </div>

        <div className="ai-studio-form-row">
          <div className="ai-studio-form-group">
            <label>{props.l('风格', 'Style')}</label>
            <select
              value={props.style}
              onChange={e => props.setStyle(e.target.value as any)}
              disabled={props.isGenerating}
            >
              <option value="animation">{props.l('动画', 'Animation')}</option>
              <option value="live-action">{props.l('真人', 'Live Action')}</option>
              <option value="documentary">{props.l('纪录片', 'Documentary')}</option>
              <option value="shorts">{props.l('短视频', 'Shorts')}</option>
              <option value="cinematic">{props.l('电影感', 'Cinematic')}</option>
            </select>
          </div>

          <div className="ai-studio-form-group">
            <label>{props.l('目标语言', 'Target Language')}</label>
            <select
              value={props.targetLanguage}
              onChange={e => props.setTargetLanguage(e.target.value)}
              disabled={props.isGenerating}
            >
              <option value="km">{props.l('高棉语', 'Khmer')}</option>
              <option value="en">{props.l('英语', 'English')}</option>
              <option value="zh">{props.l('中文', 'Chinese')}</option>
              <option value="th">{props.l('泰语', 'Thai')}</option>
              <option value="vi">{props.l('越南语', 'Vietnamese')}</option>
            </select>
          </div>

          <div className="ai-studio-form-group">
            <label>{props.l('目标时长 (秒)', 'Target Duration (seconds)')}</label>
            <input
              type="number"
              value={props.targetDuration}
              onChange={e => props.setTargetDuration(parseInt(e.target.value) || 120)}
              min={15}
              max={1800}
              disabled={props.isGenerating}
            />
          </div>
        </div>

        <button
          className="ai-studio-btn ai-studio-btn-primary ai-studio-btn-large"
          onClick={props.onGenerate}
          disabled={props.isGenerating || !props.topic.trim()}
        >
          {props.isGenerating ? (
            <>
              <LoaderCircle size={20} className="spin" />
              {props.l('正在生成大纲...', 'Generating Storyline...')}
            </>
          ) : (
            <>
              <ZapIcon size={20} />
              {props.l('生成大纲', 'Generate Storyline')}
            </>
          )}
        </button>

        <p className="ai-studio-hint">
          {props.l('预估成本: $0.50 • 预估时间: 2 分钟', 'Estimated cost: $0.50 • Estimated time: 2 minutes')}
        </p>
      </div>
    </div>
  );
}

function CharactersPhase(props: { jobId: string | null; phaseStatus: string; l: (chinese: string, english: string) => string }) {
  return (
    <div className="ai-studio-phase-content">
      <div className="ai-studio-phase-info-card">
        <h3>{props.l('角色工厂', 'Character Factory')}</h3>
        <p>{props.l('设计视觉外观、分配音色、为每个角色创建动画绑定', 'Designing visual appearance, assigning voices, creating animation rigs for each character.')}</p>
      </div>

      {props.jobId ? (
        <div className="ai-studio-character-preview">
          <h4>{props.l('生成的角色', 'Generated Characters')}</h4>
          <div className="ai-studio-character-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="ai-studio-character-card">
                <div className="ai-studio-character-avatar">
                  <Image size={40} />
                </div>
                <div className="ai-studio-character-info">
                  <span className="ai-studio-character-name">{props.l('角色', 'Character')} {i}</span>
                  <span className="ai-studio-character-role">{['主角', '反派', '配角'][i - 1]}</span>
                </div>
                <div className="ai-studio-character-details">
                  <span><Mic2 size={14} /> {props.l('音色: VoxCPM2', 'Voice: VoxCPM2')}</span>
                  <span><Image size={14} /> {props.l('绑定: 火柴人', 'Rig: Stickman')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="ai-studio-waiting">{props.l('先完成大纲阶段以生成角色', 'Complete the Storyline phase first to generate characters.')}</p>
      )}
    </div>
  );
}

function AssetsPhase(props: { jobId: string | null; phaseStatus: string; l: (chinese: string, english: string) => string }) {
  const assets = [
    { label: props.l('场景', 'Scenes'), count: 5, icon: Film },
    { label: props.l('角色', 'Characters'), count: 12, icon: Image },
    { label: props.l('道具', 'Props'), count: 8, icon: Palette },
    { label: props.l('视觉风格', 'Visual Style'), count: 1, icon: Palette },
  ];

  return (
    <div className="ai-studio-phase-content">
      <div className="ai-studio-phase-info-card">
        <h3>{props.l('资产管线', 'Asset Pipeline')}</h3>
        <p>{props.l('生成背景、角色图、道具、提取视觉风格', 'Generating backgrounds, character art, props, and extracting visual style.')}</p>
      </div>

      {props.jobId ? (
        <div className="ai-studio-assets-preview">
          <h4>{props.l('生成的资产', 'Generated Assets')}</h4>
          <div className="ai-studio-assets-grid">
            {assets.map((asset, i) => (
              <div key={i} className="ai-studio-asset-card">
                <asset.icon size={24} />
                <span>{asset.label}</span>
                <span className="ai-studio-asset-count">{asset.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="ai-studio-waiting">{props.l('先完成角色阶段以生成资产', 'Complete the Characters phase first to generate assets.')}</p>
      )}
    </div>
  );
}

function VoicePhase(props: { jobId: string | null; phaseStatus: string; l: (chinese: string, english: string) => string }) {
  return (
    <div className="ai-studio-phase-content">
      <div className="ai-studio-phase-info-card">
        <h3>{props.l('语音合成', 'Voice Synthesis')}</h3>
        <p>{props.l('多说话人 TTS、韵律、口型同步、音频混音', 'Multi-speaker TTS with prosody, lip-sync timing, and audio mixing.')}</p>
      </div>

      {props.jobId ? (
        <div className="ai-studio-voice-preview">
          <h4>{props.l('生成的语音', 'Generated Voices')}</h4>
          <div className="ai-studio-voice-grid">
            {[
              { name: 'Protagonist', voice: 'VoxCPM2 Clone', lang: 'Khmer' },
              { name: 'Antagonist', voice: 'Edge-TTS', lang: 'Khmer' },
              { name: 'Narrator', voice: 'Edge-TTS', lang: 'Khmer' },
            ].map((voice, i) => (
              <div key={i} className="ai-studio-voice-card">
                <div className="ai-studio-voice-info">
                  <strong>{voice.name}</strong>
                  <span>{voice.voice} • {voice.lang}</span>
                </div>
                <button className="ai-studio-btn ai-studio-btn-secondary ai-studio-btn-small">
                  <Play size={16} /> {props.l('预览', 'Preview')}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="ai-studio-waiting">{props.l('先完成资产阶段以合成语音', 'Complete the Assets phase first to synthesize voices.')}</p>
      )}
    </div>
  );
}

function AssemblyPhase(props: { jobId: string | null; phaseStatus: string; l: (chinese: string, english: string) => string }) {
  return (
    <div className="ai-studio-phase-content">
      <div className="ai-studio-phase-info-card">
        <h3>{props.l('视频组装', 'Video Assembly')}</h3>
        <p>{props.l('组合时间轴、添加转场、字幕、音乐、导出最终视频', 'Composing timeline, adding transitions, subtitles, music, and exporting final video.')}</p>
      </div>

      {props.jobId ? (
        <div className="ai-studio-assembly-preview">
          <h4>{props.l('最终输出', 'Final Output')}</h4>
          <div className="ai-studio-output-options">
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" defaultChecked />
                <span>{props.l('1080p MP4', '1080p MP4')}</span>
              </label>
            </div>
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" defaultChecked />
                <span>{props.l('720p MP4', '720p MP4')}</span>
              </label>
            </div>
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" />
                <span>{props.l('4K MP4', '4K MP4')}</span>
              </label>
            </div>
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" defaultChecked />
                <span>{props.l('字幕 (SRT)', 'Subtitles (SRT)')}</span>
              </label>
            </div>
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" />
                <span>{props.l('字幕 (VTT)', 'Subtitles (VTT)')}</span>
              </label>
            </div>
            <div className="ai-studio-output-item">
              <label>
                <input type="checkbox" />
                <span>{props.l('字幕 (ASS)', 'Subtitles (ASS)')}</span>
              </label>
            </div>
          </div>
          <p className="ai-studio-hint">{props.l('预估渲染时间: 3 分钟', 'Estimated render time: 3 minutes')}</p>
        </div>
      ) : (
        <p className="ai-studio-waiting">{props.l('先完成语音阶段以组装视频', 'Complete the Voice phase first to assemble the video.')}</p>
      )}
    </div>
  );
}