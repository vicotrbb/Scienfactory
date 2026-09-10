import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Download,
  FlaskConical,
  History,
  MessageSquare,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Square,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { Artifact, Message, Research, Snapshot } from '../shared/protocol';
import { useConnection } from './connection';
import { Brand, download, IconButton, Modal, navigateTabs } from './ui';
import { Settings } from './Settings';
import { Workbench } from './Workbench';
import { ChatTimeline } from './ChatTimeline';
import { ResearchProgress } from './Progress';
import { ModelSelect } from './ModelSelect';

export function App() {
  const connection = useConnection();
  const { bootstrap, snapshot, status, send, open, clear, streams } = connection;
  const [sidebar, setSidebar] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [workCollapsed, setWorkCollapsed] = useState(false);
  const [mobile, setMobile] = useState<'chat' | 'work'>('chat');
  const [split, setSplit] = useState(Number(localStorage.getItem('scienfactory.split')) || 44);
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState('');
  const [rename, setRename] = useState('');
  const [theme, setTheme] = useState(
    localStorage.getItem('scienfactory.theme') ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Artifact[]>([]);
  const [toast, setToast] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const attachment = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6500);
  };
  const activeId = snapshot?.research.id;
  const busy = snapshot?.research.status === 'running';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('scienfactory.theme', theme);
  }, [theme]);
  useEffect(() => {
    if (activeId) setOpenIds((ids) => (ids.includes(activeId) ? ids : [...ids, activeId]));
  }, [activeId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') {
          e.preventDefault();
          setPalette((p) => !p);
        }
        if (e.key === '\\') {
          e.preventDefault();
          setSidebar((s) => !s);
        }
        if (e.key === 'n') {
          e.preventDefault();
          newResearch();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (atBottom && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot?.messages, snapshot?.tools, streams, busy, atBottom]);
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
    }
  }, [draft]);
  const newResearch = () => {
    clear();
    setDraft('');
    setChatCollapsed(false);
    setMobile('chat');
    setPalette(false);
    requestAnimationFrame(() => textarea.current?.focus());
  };
  const openResearch = async (id: string) => {
    try {
      await open(id);
      setPalette(false);
      setChatCollapsed(false);
      setMobile('chat');
      setAtBottom(true);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const ensureResearch = async () => {
    if (activeId) return activeId;
    const research = await send<Research>({
      type: 'research.create',
      title: draft.trim().slice(0, 80) || 'Untitled research',
    });
    await open(research.id);
    return research.id;
  };
  async function submit() {
    if (!draft.trim() || sending || busy || uploading) return;
    if (!bootstrap?.credentials[bootstrap.settings.provider]) {
      setSettings(true);
      notify('Connect a provider key to begin.');
      return;
    }
    setSending(true);
    const text = draft;
    try {
      const id = await ensureResearch();
      await send({
        type: 'chat.send',
        researchId: id,
        text,
        artifactIds: attachments.filter((a) => a.researchId === id).map((a) => a.id),
      });
      setAttachments((items) => items.filter((a) => a.researchId !== id));
      setDraft('');
      setAtBottom(true);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const researchId = await ensureResearch();
      if (files.length + attachments.filter((a) => a.researchId === researchId).length > 20)
        throw new Error(
          'Attach up to 20 files per message. Send these attachments before adding more.',
        );
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) throw new Error('Files must be 8 MB or smaller.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const added = await send<Artifact>({
          type: 'artifact.upload',
          researchId,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          data: btoa(binary),
        });
        setAttachments((items) => [...items, added]);
      }
      notify(`${files.length} file${files.length === 1 ? '' : 's'} added to the research`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
      if (attachment.current) attachment.current.value = '';
    }
  }
  const messages: Message[] = [...(snapshot?.messages ?? [])];
  for (const [id, stream] of Object.entries(streams)) {
    if (stream.researchId !== activeId) continue;
    const existing = messages.find((m) => m.id === id);
    if (existing) {
      if (stream.text.length > existing.text.length)
        messages[messages.indexOf(existing)] = { ...existing, text: stream.text };
    } else
      messages.push({
        id,
        researchId: stream.researchId,
        agentId: stream.agentId,
        role: 'assistant',
        text: stream.text,
        createdAt: stream.createdAt,
      });
  }
  const researchTabs = bootstrap?.researches.filter((r) => openIds.includes(r.id)) ?? [];
  const totalTokens =
    snapshot?.runs.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0) ?? 0;
  const filtered =
    bootstrap?.researches.filter((r) => r.title.toLowerCase().includes(query.toLowerCase())) ?? [];
  const changeSplit = (value: number) => {
    const next = Math.max(30, Math.min(68, value));
    setSplit(next);
    localStorage.setItem('scienfactory.split', String(next));
  };
  return (
    <div
      className={`app ${sidebar ? 'sidebar-open' : ''} ${chatCollapsed ? 'chat-collapsed' : ''} ${workCollapsed ? 'work-collapsed' : ''} mobile-${mobile}`}
      style={{ '--chat-width': `${split}%` } as CSSProperties}
    >
      <aside className="sidebar" aria-label="Research history">
        <div className="sidebar-top">
          <button
            className="brand-button"
            aria-label="Toggle research history"
            onClick={() => setSidebar(!sidebar)}
          >
            <Brand small />
            {sidebar && <strong>Scienfactory</strong>}
          </button>
          {sidebar && (
            <IconButton label="Collapse history" onClick={() => setSidebar(false)}>
              <PanelLeftClose size={16} />
            </IconButton>
          )}
        </div>
        <div className="sidebar-main">
          <button className="new-research" title="New research" onClick={newResearch}>
            <Plus size={19} />
            {sidebar && (
              <>
                <span>New research</span>
                <kbd>⌘ N</kbd>
              </>
            )}
          </button>
          <button
            className="sidebar-action"
            aria-label="Search research"
            title="Search research"
            onClick={() => setPalette(true)}
          >
            <Search size={18} />
            {sidebar && (
              <>
                <span>Search</span>
                <kbd>⌘ K</kbd>
              </>
            )}
          </button>
          <button
            className="sidebar-action"
            aria-label="Show research history"
            title="Research history"
            onClick={() => setSidebar(!sidebar)}
          >
            <History size={18} />
            {sidebar && <span>Research history</span>}
          </button>
          {sidebar && (
            <div className="history-list">
              <p className="history-caption">Your research</p>
              {bootstrap?.researches.length ? (
                bootstrap.researches.map((r) => (
                  <button
                    key={r.id}
                    className={`history-item ${r.id === activeId ? 'active' : ''}`}
                    onClick={() => void openResearch(r.id)}
                  >
                    <MessageSquare size={15} />
                    <span>{r.title}</span>
                    {r.status === 'running' && <span className="status-dot ready" />}
                  </button>
                ))
              ) : (
                <p className="history-empty">Your questions will find a home here.</p>
              )}
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="sidebar-action"
            title="Workspace guide"
            aria-label="Workspace guide"
            onClick={() => setHelp(true)}
          >
            <BookOpen size={18} />
            {sidebar && <span>Workspace guide</span>}
          </button>
          <button
            className="sidebar-action"
            title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}{' '}
            {sidebar && <span>Appearance</span>}
          </button>
          <button
            className="sidebar-action"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={18} />
            {sidebar && <span>Settings</span>}
          </button>
          <div className="local-profile">
            <span>V</span>
            {sidebar && (
              <div>
                <strong>Personal workspace</strong>
                <small>Local · Bring your own key</small>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span className="workspace-name">Personal workspace</span>
            <ChevronRight size={13} />
            <strong title={snapshot?.research.title}>
              {snapshot?.research.title ?? 'New research'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className={`connection-status ${status}`}>
              <span className="status-dot" />
              {status === 'online'
                ? 'Connected'
                : status === 'connecting'
                  ? 'Connecting…'
                  : 'Reconnecting…'}
            </span>
            {activeId && (
              <>
                <IconButton
                  label="Export research"
                  onClick={async () => {
                    try {
                      const data = await send<Snapshot>({
                        type: 'research.export',
                        researchId: activeId,
                      });
                      const files = [];
                      for (const file of data.artifacts)
                        files.push(
                          await send<Artifact & { data: string }>({
                            type: 'artifact.read',
                            researchId: activeId,
                            artifactId: file.id,
                          }),
                        );
                      download(
                        `${snapshot.research.title.replace(/[^a-z0-9]+/gi, '-')}.scienfactory.json`,
                        JSON.stringify({ ...data, files }, null, 2),
                      );
                      notify('Research exported with evidence and files');
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <Download size={16} />
                </IconButton>
                <IconButton
                  label="Manage research"
                  onClick={() => {
                    setRename(snapshot.research.title);
                    setManage(true);
                  }}
                >
                  <MoreHorizontal size={19} />
                </IconButton>
              </>
            )}
            <button
              className="button subtle compact settings-shortcut"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={14} />
              Research settings
            </button>
          </div>
        </header>
        <div className="mobile-switch" role="group" aria-label="Workspace panel">
          <button className={mobile === 'chat' ? 'active' : ''} onClick={() => setMobile('chat')}>
            <MessageSquare size={15} />
            Conversation
          </button>
          <button className={mobile === 'work' ? 'active' : ''} onClick={() => setMobile('work')}>
            <FlaskConical size={15} />
            Workbench
          </button>
        </div>
        <div className="workspace" ref={layout}>
          {chatCollapsed ? (
            <button className="collapsed-panel" onClick={() => setChatCollapsed(false)}>
              <PanelLeftOpen size={18} />
              <span>Conversation</span>
            </button>
          ) : (
            <section className="chat-panel" aria-label="Research conversation">
              <div className="panel-tabs">
                <div
                  className="tab-scroll"
                  role="tablist"
                  aria-label="Conversation tabs"
                  onKeyDown={navigateTabs}
                >
                  {!activeId && (
                    <button role="tab" aria-selected="true" className="panel-tab active">
                      <MessageSquare size={15} />
                      New research
                    </button>
                  )}
                  {researchTabs.map((r) => (
                    <div
                      className={`conversation-tab ${r.id === activeId ? 'active' : ''}`}
                      key={r.id}
                    >
                      <button
                        role="tab"
                        tabIndex={r.id === activeId ? 0 : -1}
                        aria-selected={r.id === activeId}
                        title={`${r.title} · Delete to close`}
                        onKeyDown={(e) => {
                          if (e.key === 'Delete') {
                            setOpenIds((ids) => ids.filter((id) => id !== r.id));
                            if (r.id === activeId) newResearch();
                          }
                        }}
                        onClick={() => void openResearch(r.id)}
                      >
                        <MessageSquare size={14} />
                        <span>{r.title}</span>
                        <span
                          className="tab-close"
                          aria-hidden="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenIds((ids) => ids.filter((id) => id !== r.id));
                            if (r.id === activeId) newResearch();
                          }}
                        >
                          <X size={12} />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <IconButton label="New conversation tab" onClick={newResearch}>
                  <Plus size={15} />
                </IconButton>
                <IconButton
                  label="Collapse conversation"
                  onClick={() => {
                    setChatCollapsed(true);
                    setWorkCollapsed(false);
                  }}
                >
                  <PanelLeftClose size={16} />
                </IconButton>
              </div>
              <div
                className="chat-scroll"
                ref={scroll}
                onScroll={() => {
                  if (scroll.current)
                    setAtBottom(
                      scroll.current.scrollHeight -
                        scroll.current.scrollTop -
                        scroll.current.clientHeight <
                        80,
                    );
                }}
              >
                {snapshot &&
                (messages.length ||
                  snapshot.research.status === 'running' ||
                  snapshot.tools?.length) ? (
                  <ChatTimeline messages={messages} snapshot={snapshot} notify={notify} />
                ) : (
                  <div className="chat-welcome chat-empty">
                    <div className="welcome-brand">
                      <Brand />
                      <span>Scienfactory</span>
                    </div>
                    <h1>Let’s investigate.</h1>
                    <p>
                      Bring a question, an idea, or an unsolved problem.
                      <br />
                      We’ll explore it together.
                    </p>
                  </div>
                )}
              </div>
              {!atBottom && (
                <button
                  className="scroll-bottom"
                  aria-label="Scroll to latest message"
                  onClick={() => {
                    setAtBottom(true);
                    scroll.current?.scrollTo({
                      top: scroll.current.scrollHeight,
                      behavior: 'smooth',
                    });
                  }}
                >
                  <ArrowDown size={16} />
                </button>
              )}
              {snapshot && <ResearchProgress snapshot={snapshot} />}
              <div className="composer-area">
                <form
                  className={`composer ${busy ? 'is-running' : ''}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  {(uploading || attachments.some((a) => a.researchId === activeId)) && (
                    <div
                      className="composer-attachments"
                      role="group"
                      aria-label="Attached research files"
                    >
                      {attachments
                        .filter((a) => a.researchId === activeId)
                        .map((a) => (
                          <span key={a.id}>
                            <Paperclip size={13} />
                            <span>{a.name}</span>
                            <button
                              type="button"
                              aria-label={`Remove attachment ${a.name}`}
                              onClick={() =>
                                setAttachments((items) => items.filter((item) => item.id !== a.id))
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      {uploading && <small role="status">Adding files…</small>}
                    </div>
                  )}
                  <label className="sr-only" htmlFor="research-prompt">
                    Research question
                  </label>
                  <textarea
                    id="research-prompt"
                    ref={textarea}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      busy
                        ? 'Add your next question while research runs…'
                        : 'Ask anything. Question everything.'
                    }
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                  />
                  <div className="composer-toolbar">
                    <div>
                      <IconButton
                        label="Attach research files"
                        onClick={() => attachment.current?.click()}
                        disabled={status !== 'online' || uploading}
                      >
                        <Paperclip size={17} />
                      </IconButton>
                      <input
                        ref={attachment}
                        type="file"
                        className="sr-only"
                        multiple
                        onChange={(e) => void upload(e.target.files)}
                        aria-label="Upload files"
                      />
                      {bootstrap && (
                        <ModelSelect
                          compact
                          provider={bootstrap.settings.provider}
                          value={bootstrap.settings.model}
                          connected={bootstrap.credentials[bootstrap.settings.provider]}
                          send={send}
                          disabled={busy}
                          onChange={(model) => {
                            void send({
                              type: 'settings.update',
                              settings: { ...bootstrap.settings, model },
                            }).catch((e) => notify(e.message));
                          }}
                        />
                      )}
                    </div>
                    {busy ? (
                      <button
                        className="send-button stop"
                        type="button"
                        aria-label="Stop research"
                        title="Stop research"
                        onClick={() =>
                          activeId &&
                          void send({ type: 'run.cancel', researchId: activeId }).catch((e) =>
                            notify(e.message),
                          )
                        }
                      >
                        <Square size={15} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        className="send-button"
                        type="submit"
                        aria-label="Start research"
                        title="Start research"
                        disabled={!draft.trim() || sending || status !== 'online'}
                      >
                        <ArrowUp size={19} />
                      </button>
                    )}
                  </div>
                </form>
                <div className="composer-caption">
                  <span>
                    <span className="status-dot ready" />
                    Your key. Your research.
                  </span>
                  <span>
                    {totalTokens
                      ? `${totalTokens.toLocaleString()} tokens used`
                      : 'Enter to send · Shift + Enter for a new line'}
                  </span>
                </div>
              </div>
            </section>
          )}
          {!chatCollapsed && !workCollapsed && (
            <div
              className="panel-resizer"
              role="separator"
              aria-label="Resize workspace panels"
              aria-orientation="vertical"
              aria-valuenow={split}
              aria-valuemin={30}
              aria-valuemax={68}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  changeSplit(split - 2);
                }
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  changeSplit(split + 2);
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId) && layout.current) {
                  const rect = layout.current.getBoundingClientRect();
                  changeSplit(((e.clientX - rect.left) / rect.width) * 100);
                }
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            >
              <span />
            </div>
          )}
          {workCollapsed ? (
            <button className="collapsed-panel" onClick={() => setWorkCollapsed(false)}>
              <PanelRightOpen size={18} />
              <span>Workbench</span>
            </button>
          ) : (
            <Workbench
              snapshot={snapshot}
              bootstrap={bootstrap}
              send={send}
              ensureResearch={ensureResearch}
              notify={notify}
              onCollapse={() => {
                setWorkCollapsed(true);
                setChatCollapsed(false);
              }}
            />
          )}
        </div>
      </div>
      {bootstrap && (
        <Settings
          open={settings}
          onOpenChange={setSettings}
          bootstrap={bootstrap}
          send={send}
          notify={notify}
        />
      )}
      <Modal
        open={palette}
        onOpenChange={setPalette}
        title="Find a research"
        description="Pick up a question where you left it."
      >
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Search your research…"
            aria-label="Search research history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="palette-results">
          <button className="palette-result" onClick={newResearch}>
            <Plus size={17} />
            <strong>Start a new research</strong>
            <kbd>⌘ N</kbd>
          </button>
          {filtered.map((r) => (
            <button key={r.id} className="palette-result" onClick={() => void openResearch(r.id)}>
              <MessageSquare size={16} />
              <strong>{r.title}</strong>
              <span>{r.status}</span>
            </button>
          ))}
          {query && !filtered.length && (
            <p className="search-empty">No research matches “{query}”.</p>
          )}
        </div>
      </Modal>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="A workspace for discovery"
        description="Ask, investigate, compute, verify, and document."
      >
        <div className="guide">
          <p>
            Start with a question in the conversation. Your agent can retrieve literature, read
            public sources, delegate to specialists, and run experiments. Open the workbench to
            inspect its evidence.
          </p>
          <h3>The scientific lab</h3>
          <p>
            Python, R, JavaScript, Lean 4 (Std), LaTeX, Graphviz, and Blender run in disposable,
            offline containers. Save output under <code>artifacts/</code>. Uploaded files can be
            passed to tools by the agent.
          </p>
          <h3>Evidence stays inspectable</h3>
          <p>
            Files retain their source, timestamps, and SHA-256 hashes. Sources retain retrieval
            dates and excerpts. Export a research to keep its messages, files, and execution records
            together.
          </p>
          <h3>Stay in control</h3>
          <p>
            Set your provider and agent budgets in settings. Stop a research at any time. Completed
            outputs survive cancellation and reloads. In-flight work is marked interrupted after a
            server restart.
          </p>
          <div className="shortcut-list">
            <span>
              Search research<kbd>⌘ K</kbd>
            </span>
            <span>
              New research<kbd>⌘ N</kbd>
            </span>
            <span>
              Toggle history<kbd>⌘ \</kbd>
            </span>
          </div>
          <p className="field-help">
            An agent assessment is not scientific certification. Evaluate assumptions, evidence, and
            reproducibility before relying on a conclusion.
          </p>
        </div>
      </Modal>
      <Modal
        open={manage}
        onOpenChange={setManage}
        title="Manage research"
        description="Rename this research or remove its saved workspace."
      >
        <div className="settings-body">
          <label className="field">
            Research title
            <input value={rename} onChange={(e) => setRename(e.target.value)} maxLength={160} />
          </label>
          <p className="field-help">
            Deleting removes the research, messages, and artifact references. Export anything you
            want to keep first.
          </p>
        </div>
        <div className="dialog-footer">
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (!activeId) return;
              try {
                await send({ type: 'research.delete', researchId: activeId });
                setOpenIds((ids) => ids.filter((id) => id !== activeId));
                newResearch();
                setManage(false);
                notify('Research deleted');
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Trash2 size={14} />
            Delete research
          </button>
          <button
            className="button primary"
            disabled={!rename.trim()}
            onClick={async () => {
              if (!activeId) return;
              try {
                await send({ type: 'research.rename', researchId: activeId, title: rename });
                setManage(false);
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Save title
          </button>
        </div>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
