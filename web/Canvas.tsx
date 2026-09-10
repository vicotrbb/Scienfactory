import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Code2,
  FlaskConical,
  Frame,
  LoaderCircle,
  Pause,
  Play,
  Terminal,
  AlertCircle,
  Maximize2,
  List,
  ChevronDown,
  FileText,
} from 'lucide-react';
import type { Artifact, CanvasItem, Snapshot } from '../shared/protocol';
import type { Send } from './connection';
import { ArtifactView } from './ArtifactView';
import { Elapsed } from './Progress';
import { Modal, formatBytes } from './ui';

function partialField(input: string, field: string) {
  const start = input.indexOf(`"${field}"`);
  if (start < 0) return '';
  const match = /^\s*:\s*"/.exec(input.slice(start + field.length + 2));
  if (!match) return '';
  const raw = input.slice(start + field.length + 2 + match[0].length);
  const value = /^(?:\\.|[^"\\])*/s.exec(raw)?.[0] ?? '';
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replaceAll('\\n', '\n').replaceAll('\\"', '"');
  }
}

function CanvasPreview({
  artifact,
  relatedArtifacts,
  send,
  openArtifact,
  notify,
}: {
  artifact: Artifact;
  relatedArtifacts: Artifact[];
  send: Send;
  openArtifact: (a: Artifact) => void;
  notify: (s: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`canvas-preview ${artifact.mime.replaceAll('/', '-').replaceAll('+', '-')}`}
    >
      <div className="canvas-file-label">
        <span className="canvas-file-type">
          {artifact.mime === 'application/pdf'
            ? 'Paper'
            : artifact.mime.startsWith('image/')
              ? 'Figure'
              : artifact.mime === 'model/gltf-binary'
                ? '3D model'
                : artifact.mime === 'text/html'
                  ? 'Interactive'
                  : 'Document'}
        </span>
        <span>{artifact.name}</span>
        <button
          title="Expand preview"
          aria-label={`Expand ${artifact.name}`}
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={14} />
        </button>
        <button
          title="Open file"
          aria-label={`Open ${artifact.name}`}
          onClick={() => openArtifact(artifact)}
        >
          <ArrowUpRight size={14} />
        </button>
      </div>
      {visible ? (
        <ArtifactView
          artifact={artifact}
          relatedArtifacts={relatedArtifacts}
          send={send}
          notify={notify}
          onSaved={openArtifact}
          onRun={() => openArtifact(artifact)}
          embedded
        />
      ) : (
        <div className="canvas-preview-placeholder">{artifact.name}</div>
      )}
      <div className="canvas-preview-meta">
        <span>{formatBytes(artifact.size)}</span>
        <span>Saved in Files</span>
      </div>
      <Modal
        open={expanded}
        onOpenChange={setExpanded}
        title={artifact.name}
        description="Focus view. Original file and provenance are available in the toolbar."
        wide
      >
        <div className="canvas-focus">
          <ArtifactView
            artifact={artifact}
            relatedArtifacts={relatedArtifacts}
            send={send}
            notify={notify}
            onSaved={openArtifact}
            onRun={() => openArtifact(artifact)}
          />
        </div>
      </Modal>
    </div>
  );
}
function CanvasBlock({
  item,
  snapshot,
  send,
  openArtifact,
  notify,
}: {
  item: CanvasItem;
  snapshot: Snapshot;
  send: Send;
  openArtifact: (a: Artifact) => void;
  notify: (s: string) => void;
}) {
  const files = item.artifactIds.flatMap((id) => {
    const a = snapshot.artifacts.find((a) => a.id === id);
    return a ? [a] : [];
  });
  const hasPdf = files.some((a) => a.mime === 'application/pdf');
  const previews = files.filter(
    (a) =>
      /markdown|html|^image\/|^video\/|^audio\/|pdf|gltf/.test(a.mime) &&
      !(hasPdf && /^(?:paper-)?page-\d+\.png$/.test(a.name)),
  );
  const supporting = files.filter((a) => !previews.includes(a));
  const author =
    snapshot.agents.find((a) => a.id === item.agentId)?.name ??
    (item.agentId === 'manual' ? 'Your experiment' : 'Scienfactory');
  const outputRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (outputRef.current && item.status === 'running')
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [item.output]);
  return (
    <article className={`canvas-block ${item.kind} ${item.status}`} data-canvas-id={item.id}>
      <header className="canvas-block-heading">
        <span className="canvas-block-symbol">
          {item.kind === 'experiment' ? <FlaskConical size={17} /> : <Frame size={17} />}
        </span>
        <div>
          <h2>{item.title}</h2>
          <small>
            {author}
            {item.language ? ` · ${item.language}` : ''}
          </small>
        </div>
        {item.kind === 'experiment' && (
          <span className={`execution-state ${item.status}`}>
            {item.status === 'running' ? (
              <LoaderCircle className="spin" size={13} />
            ) : item.status === 'completed' ? (
              <Check size={13} />
            ) : (
              <AlertCircle size={13} />
            )}
            <span>{item.status === 'completed' ? 'Exit 0' : item.status}</span>
            {item.durationMs != null ? (
              <span>{(item.durationMs / 1000).toFixed(1)}s</span>
            ) : (
              <Elapsed
                since={item.createdAt}
                until={item.status !== 'running' ? item.updatedAt : undefined}
              />
            )}
          </span>
        )}
      </header>
      {item.caption && <p className="canvas-caption">{item.caption}</p>}
      {item.kind === 'experiment' && (
        <div className="canvas-execution">
          <details className="canvas-code" open={item.status === 'running' ? true : undefined}>
            <summary>
              <Code2 size={13} />
              <span>Source</span>
              <span>{item.code?.split('\n').length ?? 0} lines</span>
            </summary>
            <pre>
              <code>{item.code}</code>
            </pre>
          </details>
          <div className="canvas-output">
            <div>
              <Terminal size={13} />
              <span>Output</span>
              {item.status === 'running' && (
                <span className="output-live">
                  Live <i className="status-dot ready pulse" />
                </span>
              )}
            </div>
            <pre ref={outputRef} aria-label={`${item.title} output`}>
              {item.output ||
                (item.status === 'running' ? 'Waiting for container output…' : 'No text output.')}
              {item.status === 'running' && (
                <span className="output-cursor" aria-hidden="true">
                  ▍
                </span>
              )}
            </pre>
          </div>
        </div>
      )}
      <div className="canvas-results">
        {previews.map((a) => (
          <CanvasPreview
            relatedArtifacts={snapshot.artifacts}
            key={a.id}
            artifact={a}
            send={send}
            openArtifact={openArtifact}
            notify={notify}
          />
        ))}
      </div>
      {!!supporting.length && (
        <div className="canvas-supporting" role="group" aria-label="Supporting files">
          {supporting.map((a) => (
            <button key={a.id} onClick={() => openArtifact(a)}>
              <FileText size={13} />
              <span>{a.name}</span>
              <small>{formatBytes(a.size)}</small>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
export function Canvas({
  snapshot,
  send,
  openArtifact,
  notify,
}: {
  snapshot?: Snapshot;
  send: Send;
  openArtifact: (a: Artifact) => void;
  notify: (s: string) => void;
}) {
  const [follow, setFollow] = useState(true);
  const [count, setCount] = useState(20);
  const [filter, setFilter] = useState<'all' | 'artifact' | 'experiment'>('all');
  const [indexOpen, setIndexOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const autoScrolling = useRef(false);
  useEffect(() => {
    setFollow(true);
    setCount(20);
    setFilter('all');
    setIndexOpen(false);
  }, [snapshot?.research.id]);
  const items = snapshot?.canvas?.length
    ? snapshot.canvas
    : (snapshot?.artifacts ?? [])
        .filter((a) => /markdown|html|image|pdf|video|gltf/.test(a.mime))
        .map((a) => ({
          id: a.id,
          researchId: a.researchId,
          agentId: 'legacy',
          kind: 'artifact' as const,
          title: a.name,
          caption: '',
          status: 'completed' as const,
          artifactIds: [a.id],
          createdAt: a.createdAt,
          updatedAt: a.createdAt,
        }));
  const revision = items.map((i) => `${i.id}:${i.updatedAt}`).join('|');
  const filtered = items.filter((item) => filter === 'all' || item.kind === filter);
  useEffect(() => {
    if (!follow || !items.length) return;
    autoScrolling.current = true;
    const raf = requestAnimationFrame(() => {
      end.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
      autoScrolling.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [revision, follow]);
  const running = snapshot?.research.status === 'running';
  const preparing =
    snapshot?.tools?.filter(
      (t) =>
        t.preparing &&
        t.status === 'running' &&
        ['execute', 'execute_batch', 'present', 'write_artifact'].includes(t.name),
    ) ?? [];
  return (
    <div className="research-canvas">
      <div className="canvas-toolbar">
        <button
          className="canvas-index-toggle"
          aria-expanded={indexOpen}
          aria-label="Canvas contents"
          onClick={() => setIndexOpen((v) => !v)}
        >
          <List size={15} />
          <span>{items.length ? `${items.length} canvas items` : 'Canvas'}</span>
          <ChevronDown size={12} />
        </button>
        {!!items.length && (
          <div className="canvas-filters" role="group" aria-label="Canvas filter">
            {(['all', 'artifact', 'experiment'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setFollow(false);
                }}
              >
                {value === 'all' ? 'All' : value === 'artifact' ? 'Presentations' : 'Experiments'}
              </button>
            ))}
          </div>
        )}
        <button
          className={`canvas-follow ${follow ? 'selected' : ''}`}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
        >
          {follow ? <Play size={12} /> : <Pause size={12} />}{' '}
          {follow ? 'Following agent' : 'Explore freely'}
        </button>
      </div>
      {indexOpen && (
        <nav className="canvas-index" aria-label="Canvas contents list">
          {items.length ? (
            items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => {
                  setCount(items.length);
                  setFilter('all');
                  setFollow(false);
                  setIndexOpen(false);
                  requestAnimationFrame(() =>
                    scroller.current
                      ?.querySelector(`[data-canvas-id="${CSS.escape(item.id)}"]`)
                      ?.scrollIntoView({
                        block: 'start',
                        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                          ? 'instant'
                          : 'smooth',
                      }),
                  );
                }}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {item.kind === 'experiment' ? <FlaskConical size={14} /> : <FileText size={14} />}
                <span>{item.title}</span>
                <i className={`status-dot ${item.status === 'completed' ? 'ready' : ''}`} />
              </button>
            ))
          ) : (
            <p>The canvas outline will appear as research develops.</p>
          )}
        </nav>
      )}
      <div
        className="canvas-scroll"
        ref={scroller}
        onWheel={(e) => {
          if (e.deltaY < 0 && !autoScrolling.current) setFollow(false);
        }}
        onTouchStart={() => {
          if (items.length) setFollow(false);
        }}
      >
        {!items.length && !preparing.length ? (
          <div className={`canvas-empty ${running ? 'is-active' : ''}`}>
            <Frame size={28} strokeWidth={1.2} />
            <h2>{running ? 'The investigation is taking shape' : 'Room for discovery'}</h2>
            <p>
              {running
                ? 'Experiments, diagrams, and findings will appear here as the agent works.'
                : 'Your agent will use this canvas for experiments, visualizations, and discoveries.'}
            </p>
            {running && (
              <span className="canvas-wait">
                <LoaderCircle size={14} className="spin" /> Preparing the first step
              </span>
            )}
          </div>
        ) : (
          <div className="canvas-sheet">
            {filtered.length > count && (
              <button
                className="button subtle"
                onClick={() => {
                  setFollow(false);
                  setCount((n) => n + 20);
                }}
              >
                Show {Math.min(20, filtered.length - count)} earlier items
              </button>
            )}
            {snapshot &&
              filtered
                .slice(-count)
                .map((item) => (
                  <CanvasBlock
                    key={item.id}
                    item={item}
                    snapshot={snapshot}
                    send={send}
                    openArtifact={openArtifact}
                    notify={notify}
                  />
                ))}
            {!filtered.length && !!items.length && (
              <p className="canvas-filter-empty">
                No {filter === 'artifact' ? 'presentations' : 'experiments'} yet.
              </p>
            )}
            {preparing.map((tool) => (
              <article key={tool.id} className="canvas-block preparing">
                <header className="canvas-block-heading">
                  <Code2 size={17} />
                  <div>
                    <h2>
                      {partialField(tool.arguments, 'title') || 'Preparing the next canvas item'}
                    </h2>
                    <small>Source arriving from the model</small>
                  </div>
                  <LoaderCircle size={15} className="spin" />
                </header>
                <pre className="draft-source">
                  {partialField(tool.arguments, 'code') ||
                    partialField(tool.arguments, 'content') ||
                    'Preparing…'}
                  <span className="output-cursor">▍</span>
                </pre>
              </article>
            ))}
            {running && (
              <div className="canvas-continuing">
                <span className="status-dot ready pulse" /> Investigation in progress
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>
      {!follow && running && (
        <button className="canvas-catchup button" onClick={() => setFollow(true)}>
          <ArrowDown size={14} /> Follow live work
        </button>
      )}
    </div>
  );
}
