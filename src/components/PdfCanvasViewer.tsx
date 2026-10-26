import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  FileText,
  AlertCircle,
  Loader2,
  Maximize2
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfCanvasViewerProps {
  url?: string;
  data?: Uint8Array | ArrayBuffer | string;
  fileName: string;
  onDownload: () => void;
  textContentFallback?: string;
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  url,
  data,
  fileName,
  onDownload,
  textContentFallback
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState<boolean>(false);

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setPageNum(1);

    const loadPdf = async () => {
      try {
        let loadingTask: any = null;

        if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
          loadingTask = pdfjsLib.getDocument({ data });
        } else if (typeof data === 'string' && data.startsWith('data:application/pdf')) {
          // Decode Base64 data URL to Uint8Array for maximum stability
          const base64Part = data.split(',')[1];
          const rawBinary = atob(base64Part);
          const uint8Array = new Uint8Array(rawBinary.length);
          for (let i = 0; i < rawBinary.length; i++) {
            uint8Array[i] = rawBinary.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        } else if (url && url !== '#') {
          if (url.startsWith('data:application/pdf')) {
            const base64Part = url.split(',')[1];
            const rawBinary = atob(base64Part);
            const uint8Array = new Uint8Array(rawBinary.length);
            for (let i = 0; i < rawBinary.length; i++) {
              uint8Array[i] = rawBinary.charCodeAt(i);
            }
            loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          } else {
            // For standard URLs or Blob URLs
            loadingTask = pdfjsLib.getDocument({ url });
          }
        } else {
          throw new Error('No PDF source provided');
        }

        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        }
      } catch (err: any) {
        console.warn('PDF.js loading error:', err);
        if (!isCancelled) {
          setError(err?.message || 'Failed to load PDF document');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [url, data]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let renderTask: any = null;
    let isCancelled = false;
    setRendering(true);

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Support High DPI screens (Retina)
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport,
          transform
        };

        renderTask = page.render(renderContext as any);
        await renderTask.promise;

        if (!isCancelled) {
          setRendering(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Page rendering error:', err);
        }
        if (!isCancelled) {
          setRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNum, scale, rotation]);

  const changePage = (offset: number) => {
    setPageNum((prev) => Math.min(Math.max(1, prev + offset), numPages));
  };

  return (
    <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-4xl h-[78vh] flex flex-col overflow-hidden text-slate-100 select-none">
      {/* 1. TOP PDF TOOLBAR */}
      <div className="bg-slate-800/95 border-b border-slate-700 px-4 py-2.5 flex items-center justify-between gap-3 text-xs shrink-0">
        {/* Left: Document Info & Page Controls */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-rose-400 font-bold truncate">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-xs">{fileName}</span>
          </div>

          {numPages > 0 && (
            <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700 text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => changePage(-1)}
                disabled={pageNum <= 1 || rendering}
                className="p-1 hover:bg-slate-700 disabled:opacity-30 rounded cursor-pointer transition"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono px-1">
                {pageNum} / {numPages}
              </span>
              <button
                type="button"
                onClick={() => changePage(1)}
                disabled={pageNum >= numPages || rendering}
                className="p-1 hover:bg-slate-700 disabled:opacity-30 rounded cursor-pointer transition"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Zoom & Rotate & Download */}
        <div className="flex items-center gap-2 shrink-0">
          {numPages > 0 && (
            <div className="hidden sm:flex items-center bg-slate-900/80 rounded-md border border-slate-700 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] text-slate-300 min-w-[42px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white border-l border-slate-700 ml-0.5 transition cursor-pointer"
                title="Rotate Page"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Download Button */}
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md font-bold text-xs shadow-xs transition cursor-pointer"
            title="Download PDF file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN VIEWER CANVAS CONTAINER */}
      <div
        ref={containerRef}
        className="flex-1 w-full bg-slate-950 overflow-auto p-4 sm:p-6 flex items-start justify-center relative min-h-0"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 py-12">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            <p className="text-xs font-semibold">Loading PDF Document...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-4 p-6">
            <div className="w-12 h-12 rounded-full bg-rose-900/40 text-rose-400 flex items-center justify-center border border-rose-700">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">{fileName}</h4>
              <p className="text-xs text-slate-400 mt-1">
                {textContentFallback
                  ? 'Previewing extracted document text contents below.'
                  : 'Document is ready to view or download to your device.'}
              </p>
            </div>

            {textContentFallback ? (
              <div className="w-full text-left bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {textContentFallback}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onDownload}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download & Open PDF</span>
            </button>
          </div>
        ) : (
          <div className="relative shadow-2xl rounded-sm overflow-hidden bg-white">
            {rendering && (
              <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-2xs flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
              </div>
            )}
            <canvas ref={canvasRef} className="block" />
          </div>
        )}
      </div>

      {/* 3. BOTTOM STATUS BAR */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <span>
          {numPages > 0 ? `Page ${pageNum} of ${numPages} • Native Canvas Engine` : 'PDF Document Viewer'}
        </span>
        <button
          type="button"
          onClick={onDownload}
          className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
        >
          <Download className="w-3 h-3" />
          <span>Save File</span>
        </button>
      </div>
    </div>
  );
};
