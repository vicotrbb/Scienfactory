import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  AlignLeft,
  FileText,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [showText, setShowText] = useState(false);
  const [pageText, setPageText] = useState('');
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(600);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    setDocument(undefined);
    setPage(1);
    setZoom(1);
    setError('');
    const task = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true });
    task.promise
      .then((doc) => {
        if (alive) setDocument(doc);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      void task.destroy();
    };
  }, [bytes]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0]!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    setPageText('');
    void (async () => {
      const pdfPage = await document.getPage(page);
      if (cancelled || !canvas.current) return;
      const initial = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width / initial.width, 1.65) * zoom;
      const view = pdfPage.getViewport({ scale });
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.current.width = Math.ceil(view.width * ratio);
      canvas.current.height = Math.ceil(view.height * ratio);
      canvas.current.style.width = `${view.width}px`;
      canvas.current.style.height = `${view.height}px`;
      task = pdfPage.render({
        canvas: canvas.current,
        viewport: view,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
      const text = await pdfPage.getTextContent();
      if (!cancelled) {
        setRendering(false);
        setPageText(
          text.items
            .flatMap((item) => ('str' in item ? [item.str + (item.hasEOL ? '\n' : ' ')] : []))
            .join(''),
        );
      }
    })().catch((e) => {
      if (!cancelled && e.name !== 'RenderingCancelledException') {
        setError(e.message);
        setRendering(false);
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, page, zoom, width]);
  return (
    <div className="paper-reader" role="group" aria-label={`PDF reader: ${name}`}>
      <div className="paper-controls">
        <span className="paper-format">
          <FileText size={14} /> PDF
        </span>
        <div className="paper-pagination">
          <button
            aria-label="Previous PDF page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <label>
            <span className="sr-only">PDF page</span>
            <input
              type="number"
              min={1}
              max={document?.numPages ?? 1}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= (document?.numPages ?? 1)) setPage(n);
              }}
            />
          </label>
          <span>of {document?.numPages ?? '…'}</span>
          <button
            aria-label="Next PDF page"
            disabled={!document || page >= document.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="paper-zoom">
          <button
            aria-label="Zoom out PDF"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          >
            <ZoomOut size={15} />
          </button>
          <button aria-label="Fit PDF to width" title="Fit to width" onClick={() => setZoom(1)}>
            <Maximize size={14} />
          </button>
          <button
            aria-label="Zoom in PDF"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            <ZoomIn size={15} />
          </button>
          <button
            aria-label="Show PDF text"
            title="Text on this page"
            aria-pressed={showText}
            onClick={() => setShowText((v) => !v)}
          >
            <AlignLeft size={15} />
          </button>
        </div>
      </div>
      <div
        className="paper-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label={`Pages of ${name}`}
      >
        {error ? (
          <p className="paper-error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <div className="paper-render-status" role="status">
              {rendering ? 'Rendering page…' : ''}
            </div>
            <canvas
              ref={canvas}
              role="img"
              aria-label={`${name}, page ${page} of ${document?.numPages ?? 'unknown'}`}
              style={{ display: showText ? 'none' : 'block' }}
            />
            {showText && (
              <pre className="paper-accessible-text">
                {pageText || 'No extractable text on this page. Use file inspection for OCR.'}
              </pre>
            )}
          </>
        )}
      </div>
      <div className="paper-reader-footer">
        <span>{name}</span>
        <span>
          {document
            ? `${document.numPages} page${document.numPages === 1 ? '' : 's'}`
            : 'Opening document'}
        </span>
      </div>
    </div>
  );
}
