import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Download, Code2, Eye, File, Save, Play, Info, ScanText, FileText } from 'lucide-react';
import type { Artifact, Language } from '../shared/protocol';
import type { Send } from './connection';
import { Markdown } from './Markdown';
import { latexDependencies } from '../shared/latex';
import { download, formatBytes } from './ui';
const ModelViewer = lazy(() => import('./ModelViewer'));
const PdfViewer = lazy(() => import('./PdfViewer'));

export function ArtifactView({
  artifact,
  send,
  notify,
  onRun,
  onSaved,
  embedded = false,
  relatedArtifacts = [],
  onCanvas,
}: {
  artifact: Artifact;
  send: Send;
  notify: (text: string) => void;
  onRun: (language: Language, code: string) => void;
  onSaved: (artifact: Artifact) => void;
  embedded?: boolean;
  relatedArtifacts?: Artifact[];
  onCanvas?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ data: string }>();
  const [error, setError] = useState('');
  const [source, setSource] = useState(false);
  const [edit, setEdit] = useState('');
  const [info, setInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(undefined);
    setError('');
    setSource(false);
    void send<{ data: string }>({
      type: 'artifact.read',
      researchId: artifact.researchId,
      artifactId: artifact.id,
    })
      .then((data) => {
        if (active) {
          setLoaded(data);
          setEdit(
            new TextDecoder().decode(Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))),
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [artifact.id]);
  const bytes = useMemo(
    () => (loaded ? Uint8Array.from(atob(loaded.data), (c) => c.charCodeAt(0)) : new Uint8Array()),
    [loaded],
  );
  const url = useMemo(
    () => URL.createObjectURL(new Blob([bytes], { type: artifact.mime })),
    [bytes, artifact.mime],
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const text = new TextDecoder().decode(bytes);
  const textual = /text|json|csv|svg/.test(artifact.mime);
  const language: Language | undefined = artifact.name.endsWith('.py')
    ? 'python'
    : artifact.name.endsWith('.lean')
      ? 'lean'
      : artifact.name.endsWith('.tex')
        ? 'latex'
        : artifact.name.endsWith('.js')
          ? 'javascript'
          : artifact.name.endsWith('.R')
            ? 'r'
            : artifact.name.endsWith('.dot')
              ? 'graphviz'
              : undefined;
  const save = async () => {
    setSaving(true);
    try {
      const file = await send<Artifact>({
        type: 'artifact.write',
        researchId: artifact.researchId,
        name: artifact.name,
        mime:
          artifact.mime === 'application/json'
            ? 'application/json'
            : artifact.mime === 'text/markdown'
              ? 'text/markdown'
              : 'text/plain',
        content: edit,
      });
      onSaved(file);
      notify('Saved as a new version');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const inspect = async (compile = false) => {
    setStarting(true);
    try {
      if (compile) {
        const inputs = await latexDependencies(text, artifact, relatedArtifacts, async (a) => {
          const file = await send<{ data: string }>({
            type: 'artifact.read',
            researchId: a.researchId,
            artifactId: a.id,
          });
          return new TextDecoder().decode(Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0)));
        });
        await send({
          type: 'artifact.compile',
          researchId: artifact.researchId,
          sourceArtifactId: artifact.id,
          inputArtifactIds: inputs.map((a) => a.id),
        });
      } else
        await send({
          type: 'artifact.inspect',
          researchId: artifact.researchId,
          artifactId: artifact.id,
        });
      notify(
        compile ? 'Typesetting started on the canvas' : 'File inspection started on the canvas',
      );
      onCanvas?.();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="artifact-view">
      {!embedded && (
        <div className="artifact-toolbar">
          <div className="segmented">
            <button className={!source ? 'active' : ''} onClick={() => setSource(false)}>
              <Eye size={14} />
              Preview
            </button>
            {textual && (
              <button className={source ? 'active' : ''} onClick={() => setSource(true)}>
                <Code2 size={14} />
                Source
              </button>
            )}
          </div>
          <div className="toolbar-actions">
            <button
              className="button subtle compact"
              title="Inspect file contents in the isolated lab"
              disabled={starting || !loaded}
              onClick={() => void inspect()}
            >
              <ScanText size={14} />
              <span>Inspect</span>
            </button>
            {language === 'latex' && (
              <button
                className="button primary compact"
                disabled={starting || !loaded}
                onClick={() => void inspect(true)}
              >
                <FileText size={14} />
                {starting ? 'Starting…' : 'Compile PDF'}
              </button>
            )}
            {language && (
              <button className="button subtle compact" onClick={() => onRun(language, edit)}>
                <Play size={13} />
                Open in lab
              </button>
            )}
            <button
              className="icon-button"
              title="File details"
              aria-label="File details"
              onClick={() => setInfo(!info)}
            >
              <Info size={15} />
            </button>
            <button
              className="icon-button"
              title="Download artifact"
              aria-label="Download artifact"
              disabled={!loaded}
              onClick={() => download(artifact.name, bytes, artifact.mime)}
            >
              <Download size={15} />
            </button>
          </div>
        </div>
      )}
      {info && (
        <div className="artifact-info">
          <strong>{artifact.name}</strong>
          <span>
            {formatBytes(artifact.size)} · {artifact.mime}
          </span>
          <p>{artifact.provenance}</p>
          <code>SHA-256 {artifact.sha256}</code>
        </div>
      )}
      {error ? (
        <div className="empty-state">
          <File />
          <h3>Couldn’t open this file</h3>
          <p role="alert">{error}</p>
        </div>
      ) : !loaded ? (
        <div className="skeleton-page">
          <i />
          <i />
          <i />
        </div>
      ) : source ? (
        <div className="source-editor">
          <textarea
            aria-label="Artifact source"
            spellCheck={false}
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
          />
          <div className="source-footer">
            <span>Changes are saved as a new version.</span>
            <button
              className="button primary compact"
              onClick={save}
              disabled={saving || edit === text}
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save version'}
            </button>
          </div>
        </div>
      ) : artifact.mime === 'text/markdown' || artifact.name.endsWith('.md') ? (
        <article className="document-preview">
          <Markdown text={text} />
        </article>
      ) : artifact.mime.startsWith('image/') ? (
        <div className="image-preview">
          <img src={url} alt={artifact.name} />
        </div>
      ) : artifact.mime === 'application/pdf' ? (
        <Suspense
          fallback={
            <div className="skeleton-page">
              <i />
              <i />
              <i />
            </div>
          }
        >
          <PdfViewer bytes={bytes} name={artifact.name} />
        </Suspense>
      ) : artifact.mime.startsWith('video/') ? (
        <video className="media-preview" src={url} controls />
      ) : artifact.mime.startsWith('audio/') ? (
        <audio className="media-preview" src={url} controls />
      ) : artifact.mime === 'model/gltf-binary' || artifact.name.endsWith('.glb') ? (
        <Suspense fallback={<div className="empty-state">Opening 3D viewer…</div>}>
          <ModelViewer bytes={bytes} />
        </Suspense>
      ) : artifact.mime === 'text/html' ? (
        <iframe
          className="full-preview"
          title={artifact.name}
          sandbox="allow-scripts"
          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; form-action 'none'; base-uri 'none'">${text}`}
        />
      ) : artifact.mime === 'text/csv' || artifact.name.endsWith('.csv') ? (
        <div className="csv-preview">
          <p>Text preview · CSV values may contain quoted separators</p>
          <pre>{text}</pre>
        </div>
      ) : language === 'latex' ? (
        <div className="latex-source-preview">
          <div>
            <FileText size={24} />
            <h2>LaTeX manuscript</h2>
            <p>
              Compile this source to inspect its actual typeset pages, equations, references, and
              figures.
            </p>
          </div>
          <pre className="code-preview">{text}</pre>
        </div>
      ) : textual ? (
        <pre className="code-preview">
          {artifact.mime === 'application/json'
            ? (() => {
                try {
                  return JSON.stringify(JSON.parse(text), null, 2);
                } catch {
                  return text;
                }
              })()
            : text}
        </pre>
      ) : (
        <div className="empty-state">
          <File size={30} />
          <h3>Ready to download</h3>
          <p>
            {artifact.name} · {formatBytes(artifact.size)}
          </p>
          <button className="button" onClick={() => download(artifact.name, bytes, artifact.mime)}>
            Download file
          </button>
        </div>
      )}
    </div>
  );
}
