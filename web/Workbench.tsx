import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Frame,
  Box,
  ChevronRight,
  Code2,
  FileCode,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe2,
  Image,
  Layers,
  PanelRightClose,
  Play,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import type { Artifact, Bootstrap, Language, Snapshot } from '../shared/protocol';
import { examples } from '../shared/examples';
import type { Send } from './connection';
import { ArtifactView } from './ArtifactView';
import { formatBytes, IconButton, navigateTabs } from './ui';
import { Canvas } from './Canvas';
import { instruments } from '../shared/instruments';
import { phaseLabel } from './Progress';

type Tab = 'canvas' | 'lab' | 'files' | 'sources' | 'agents' | 'activity' | string;
export function Workbench({
  snapshot,
  bootstrap,
  send,
  ensureResearch,
  notify,
  onCollapse,
}: {
  snapshot?: Snapshot;
  bootstrap?: Bootstrap;
  send: Send;
  ensureResearch: () => Promise<string>;
  notify: (message: string) => void;
  onCollapse: () => void;
}) {
  const [tab, setTab] = useState<Tab>('canvas');
  const [opened, setOpened] = useState<Artifact[]>([]);
  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState(examples.python);
  const [starting, setStarting] = useState(false);
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== snapshot?.research.id) {
      previous.current = snapshot?.research.id;
      setOpened([]);
      if (tab !== 'lab') setTab('canvas');
    }
  }, [snapshot?.research.id]);
  const openArtifact = (artifact: Artifact) => {
    setOpened((items) => (items.some((a) => a.id === artifact.id) ? items : [...items, artifact]));
    setTab(artifact.id);
  };
  const activeArtifact = opened.find((a) => a.id === tab);
  const running = snapshot?.research.status === 'running';
  async function run() {
    setStarting(true);
    try {
      const researchId = await ensureResearch();
      await send({ type: 'lab.run', researchId, language, code });
      setTab('canvas');
      notify('Experiment started on the canvas');
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setStarting(false);
    }
  }
  const tabs = [
    { id: 'canvas', label: 'Canvas', icon: Frame },
    { id: 'lab', label: 'Lab', icon: FlaskConical },
    { id: 'files', label: 'Files', icon: FolderOpen },
  ];
  const utilities = [
    { id: 'sources', label: 'Sources', icon: Globe2, count: snapshot?.sources.length },
    { id: 'agents', label: 'Agents', icon: Users, count: snapshot?.agents.length },
    { id: 'activity', label: 'Activity', icon: Terminal },
  ];
  return (
    <section className="workbench" aria-label="Research workbench">
      <div className="panel-tabs">
        <div
          className="tab-scroll"
          role="tablist"
          aria-label="Workbench tabs"
          onKeyDown={navigateTabs}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              tabIndex={tab === t.id ? 0 : -1}
              aria-selected={tab === t.id}
              className={`panel-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={15} />
              {t.label}
              {t.id === 'files' && !!snapshot?.artifacts.length && (
                <span className="count">{snapshot.artifacts.length}</span>
              )}
            </button>
          ))}
          {opened.map((a) => (
            <div key={a.id} className={`artifact-tab ${tab === a.id ? 'active' : ''}`}>
              <button
                role="tab"
                tabIndex={tab === a.id ? 0 : -1}
                aria-selected={tab === a.id}
                title={`${a.name} · Delete to close`}
                onKeyDown={(e) => {
                  if (e.key === 'Delete') {
                    setOpened((items) => items.filter((f) => f.id !== a.id));
                    if (tab === a.id) setTab('files');
                  }
                }}
                onClick={() => setTab(a.id)}
              >
                <FileText size={14} />
                <span>{a.name}</span>
                <span
                  className="tab-close"
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpened((items) => items.filter((f) => f.id !== a.id));
                    if (tab === a.id) setTab('files');
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            </div>
          ))}
        </div>
        <IconButton label="Collapse workbench" onClick={onCollapse}>
          <PanelRightClose size={16} />
        </IconButton>
      </div>
      <div className="workbench-subbar">
        <span>
          <span className={`status-dot ${bootstrap?.capabilities.image ? 'ready' : ''}`} />
          {bootstrap?.capabilities.image ? 'Lab ready' : 'Lab unavailable'}
        </span>
        <div>
          {utilities.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'selected' : ''}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={13} />
              {t.label}
              {!!t.count && <span>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>
      <div
        className="workbench-content"
        role="tabpanel"
        aria-label={activeArtifact?.name ?? `${tab} panel`}
      >
        {activeArtifact ? (
          <ArtifactView
            artifact={activeArtifact}
            send={send}
            notify={notify}
            relatedArtifacts={snapshot?.artifacts}
            onCanvas={() => setTab('canvas')}
            onSaved={openArtifact}
            onRun={(lang, source) => {
              setLanguage(lang);
              setCode(source);
              setTab('lab');
            }}
          />
        ) : tab === 'canvas' ? (
          <Canvas snapshot={snapshot} send={send} openArtifact={openArtifact} notify={notify} />
        ) : tab === 'lab' ? (
          <div className="lab-panel">
            <div className="lab-intro">
              <div className="section-heading">
                <h2>Experiment, directly.</h2>
                <span className="small-tag">Isolated container</span>
              </div>
              <p>
                Run code, check a proof, or render an idea. Every execution appears on the canvas.
              </p>
              <details className="instrument-directory">
                <summary>Scientific instruments & methods</summary>
                {instruments.map((i) => (
                  <div className="instrument-row" key={i.id}>
                    <h3>{i.name}</h3>
                    <p>{i.methods}</p>
                    <small>{i.tools}</small>
                    {i.id !== 'media' && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setLanguage('python');
                          setCode(i.recipe);
                        }}
                      >
                        Load recipe <ArrowUpRight size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </details>
            </div>
            <div className="editor-toolbar">
              <label>
                <Code2 size={14} />
                <select
                  aria-label="Execution language"
                  value={language}
                  onChange={(e) => {
                    const lang = e.target.value as Language;
                    setLanguage(lang);
                    setCode(examples[lang]);
                  }}
                >
                  {Object.keys(examples).map((lang) => (
                    <option key={lang} value={lang}>
                      {
                        (
                          {
                            python: 'Python',
                            javascript: 'JavaScript',
                            lean: 'Lean 4',
                            latex: 'LaTeX',
                            r: 'R',
                            blender: 'Blender',
                            graphviz: 'Graphviz',
                          } as Record<string, string>
                        )[lang]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <button className="button subtle compact" onClick={() => setCode(examples[language])}>
                Load example
              </button>
            </div>
            <textarea
              className="lab-editor"
              aria-label="Experiment code"
              value={code}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  setCode(code.slice(0, start) + '  ' + code.slice(e.currentTarget.selectionEnd));
                  requestAnimationFrame(() => {
                    target.setSelectionRange(start + 2, start + 2);
                  });
                }
              }}
            />
            <div className="lab-runbar">
              <span>2 CPUs · 1.5 GB · 110 sec · offline</span>
              <button
                className="button primary"
                disabled={starting || running || !code.trim() || !bootstrap?.capabilities.image}
                onClick={run}
              >
                <Play size={14} />
                {running ? 'Running…' : starting ? 'Starting…' : 'Run experiment'}
              </button>
            </div>
            <div className="lab-results">
              <div className="section-heading">
                <h3>Recent output</h3>
                <button className="text-button" onClick={() => setTab('files')}>
                  View files <ArrowUpRight size={13} />
                </button>
              </div>
              {snapshot?.activity.filter((a) => a.type === 'output' || a.type === 'error')
                .length ? (
                <pre>
                  {snapshot.activity
                    .filter((a) => a.type === 'output' || a.type === 'error')
                    .slice(-20)
                    .map((a) => a.text)
                    .join('')}
                </pre>
              ) : (
                <p>Execution output will appear here.</p>
              )}
            </div>
          </div>
        ) : tab === 'files' ? (
          <div className="files-panel">
            <div className="content-heading">
              <div>
                <h2>Research files</h2>
                <p>Source, results, and documents. Each version preserved.</p>
              </div>
              <span>{snapshot?.artifacts.length ?? 0} files</span>
            </div>
            {snapshot?.artifacts.length ? (
              <div className="file-list">
                {[...snapshot.artifacts].reverse().map((a) => (
                  <button className="file-row" key={a.id} onClick={() => openArtifact(a)}>
                    <span className="file-icon">
                      {a.mime.startsWith('image') ? (
                        <Image size={19} />
                      ) : a.name.endsWith('.glb') ? (
                        <Box size={19} />
                      ) : a.mime.includes('json') || a.name.endsWith('.py') ? (
                        <FileCode size={19} />
                      ) : (
                        <FileText size={19} />
                      )}
                    </span>
                    <span>
                      <strong>{a.name}</strong>
                      <small>
                        {formatBytes(a.size)} ·{' '}
                        {new Date(a.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                icon={FolderOpen}
                title="Your research takes shape here"
                text="Ask the agent to produce a document, run an experiment in the lab, or attach a file to the conversation."
              />
            )}
          </div>
        ) : tab === 'sources' ? (
          <div className="sources-panel">
            <div className="content-heading">
              <div>
                <h2>Follow the evidence</h2>
                <p>Real retrieved sources, with provenance.</p>
              </div>
            </div>
            {snapshot?.sources.length ? (
              snapshot.sources.map((s, i) => (
                <article className="source-row" key={s.id}>
                  <span className="source-index">{i + 1}</span>
                  <div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      <h3>
                        {s.title}
                        <ArrowUpRight size={14} />
                      </h3>
                    </a>
                    <small>
                      {new URL(s.url).hostname} · Retrieved{' '}
                      {new Date(s.retrievedAt).toLocaleDateString()}
                    </small>
                    <p>
                      {s.excerpt.slice(0, 300)}
                      {s.excerpt.length > 300 ? '…' : ''}
                    </p>
                    <details>
                      <summary>Source excerpt</summary>
                      <p>{s.excerpt}</p>
                      <code>{s.id}</code>
                    </details>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                icon={Globe2}
                title="A trail you can follow"
                text="When agents search literature or read a source, its URL, excerpt, and retrieval date are recorded here."
              />
            )}
          </div>
        ) : tab === 'agents' ? (
          <div className="agents-panel">
            <div className="content-heading">
              <div>
                <h2>A team around your question</h2>
                <p>Independent tasks. Shared evidence. Visible progress.</p>
              </div>
            </div>
            <div className="agent-budget">
              <Users size={18} />
              <span>
                {snapshot?.agents.filter((a) => a.status === 'running').length ?? 0} active
              </span>
              <span>Up to {bootstrap?.settings.limits.maxAgents ?? 16} agents per run</span>
            </div>
            {snapshot?.agents.length ? (
              snapshot.agents.map((a) => (
                <details key={a.id} className={`agent-row ${a.parentId ? 'child' : ''}`}>
                  <summary>
                    <span className={`agent-state ${a.status}`}>
                      <Users size={15} />
                    </span>
                    <strong>{a.name}</strong>
                    <span className={`state-label ${a.status}`}>{phaseLabel(a)}</span>
                  </summary>
                  <p>{a.task}</p>
                  <div className="agent-output">
                    {snapshot.messages
                      .filter((m) => m.agentId === a.id && m.role === 'assistant')
                      .map((m) => (
                        <p key={m.id}>{m.text}</p>
                      ))}
                  </div>
                </details>
              ))
            ) : (
              <Empty
                icon={Users}
                title="Specialists, when you need them"
                text="The lead researcher can delegate independent questions, experiments, and reviews. Set your team size and concurrency in settings."
              />
            )}
          </div>
        ) : tab === 'activity' ? (
          <div className="activity-panel">
            <div className="content-heading">
              <div>
                <h2>The research log</h2>
                <p>Inspect what actually happened.</p>
              </div>
              <span className="live-label">
                {running && <span className="status-dot ready" />}
                {running ? 'Live' : 'Saved'}
              </span>
            </div>
            {snapshot?.activity.length ? (
              <div className="activity-list">
                {[...snapshot.activity].reverse().map((a) => (
                  <details
                    key={a.id}
                    className={`activity-entry ${a.type}`}
                    open={a.type === 'error'}
                  >
                    <summary>
                      <time>{new Date(a.createdAt).toLocaleTimeString([], { hour12: false })}</time>
                      <span className="activity-kind">{a.type}</span>
                      <span>{a.text.split('\n')[0]?.slice(0, 120)}</span>
                    </summary>
                    <pre>{a.text}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <Empty
                icon={Terminal}
                title="Nothing runs behind the curtain"
                text="Agent steps, tool calls, container output, and failures appear in this log as work happens."
              />
            )}
          </div>
        ) : null}
      </div>
      <div className="workbench-footer">
        <span>
          <Layers size={12} />
          Local research workspace
        </span>
        <span>
          {snapshot?.artifacts.length ?? 0} artifacts <span className="footer-dot">·</span>{' '}
          {snapshot?.sources.length ?? 0} sources
        </span>
      </div>
    </section>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof FolderOpen;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={28} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
