import { CheckCircle2, Download, FileText, Loader2, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Chapter, ClauseNote, LanguageCode, LawBook } from '../types/library';
import {
  buildChapterExportDocument,
  downloadStyledChapterPdf,
  type ChapterExportDocument,
  type ExportPaperSize,
} from '../utils/chapterPdfExporter';

interface ChapterExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: LawBook;
  chapter: Chapter;
  language: LanguageCode;
  languageName: string;
  compareLanguage: LanguageCode;
  compareLanguageName: string;
  notes: ClauseNote[];
  defaultIncludeExplanations: boolean;
  defaultIncludeParallelLanguage: boolean;
  onRequestPrint: (doc: ChapterExportDocument) => void;
}

/**
 * Print / PDF Export studio modal for ReaderView.
 * Lets users customize legal document formatting (A4/Letter, Deep Explanations,
 * Real-World Context, Parallel Language, Study Notes), preview the formatted sheet,
 * download a styled multi-page PDF, or print cleanly.
 */
export function ChapterExportModal({
  isOpen,
  onClose,
  book,
  chapter,
  language,
  languageName,
  compareLanguage,
  compareLanguageName,
  notes,
  defaultIncludeExplanations,
  defaultIncludeParallelLanguage,
  onRequestPrint,
}: ChapterExportModalProps) {
  const [paperSize, setPaperSize] = useState<ExportPaperSize>('a4');
  const [includeExplanations, setIncludeExplanations] = useState(defaultIncludeExplanations);
  const [includeRealWorldExamples, setIncludeRealWorldExamples] = useState(true);
  const [includeParallelLanguage, setIncludeParallelLanguage] = useState(
    defaultIncludeParallelLanguage
  );
  const [includeStudyNotes, setIncludeStudyNotes] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExportSuccessMessage(null);
    setExportError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const exportDoc = useMemo(
    () =>
      buildChapterExportDocument({
        book,
        chapter,
        language,
        languageName,
        compareLanguageName,
        notes,
        options: {
          paperSize,
          includeExplanations,
          includeRealWorldExamples,
          includeParallelLanguage,
          compareLanguage,
          includeStudyNotes,
        },
      }),
    [
      book,
      chapter,
      language,
      languageName,
      compareLanguageName,
      notes,
      paperSize,
      includeExplanations,
      includeRealWorldExamples,
      includeParallelLanguage,
      compareLanguage,
      includeStudyNotes,
    ]
  );

  const chapterNotesCount = useMemo(
    () => exportDoc.clauses.reduce((acc, c) => acc + c.studyNotes.length, 0),
    [exportDoc]
  );

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    setExportError(null);
    setExportSuccessMessage(null);
    try {
      // Yield one paint frame so the loading state renders smoothly
      await new Promise((r) => window.setTimeout(r, 40));
      const { filename, pageCount } = downloadStyledChapterPdf(exportDoc);
      setExportSuccessMessage(
        `Downloaded ${filename} (${pageCount} ${pageCount === 1 ? 'page' : 'pages'}).`
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Unable to generate PDF document. Please try Print.'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Print and PDF Export"
        data-testid="chapter-export-modal"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[26px] border border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620] sm:max-w-4xl sm:rounded-[26px]"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                Print &amp; PDF Export
              </span>
              <span aria-hidden="true">·</span>
              <span>{exportDoc.clauses.length} clauses</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">~{exportDoc.wordCount} words</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                ~{exportDoc.estimatedPages} {exportDoc.estimatedPages === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <h2 className="mt-1 truncate font-display text-lg font-bold text-slate-950 dark:text-white">
              {exportDoc.chapterNumberLabel}: {exportDoc.chapterTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: Settings + Live Formatted Legal Paper Preview */}
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[280px_1fr]">
          {/* Left Export Configuration Panel */}
          <div className="space-y-5 border-b border-slate-100 p-5 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Paper Format</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-[#0D111A]">
                {(['a4', 'letter'] as ExportPaperSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={paperSize === size}
                    onClick={() => setPaperSize(size)}
                    className={`min-h-[38px] rounded-lg text-xs font-bold uppercase transition cursor-pointer ${
                      paperSize === size
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-300'
                    }`}
                  >
                    {size === 'a4' ? 'A4 Standard' : 'US Letter'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Include in Legal Document
              </p>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-blue-300 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeExplanations}
                  onChange={(e) => setIncludeExplanations(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#2563EB]"
                />
                <span>Deep Explanations</span>
              </label>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-blue-300 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeRealWorldExamples}
                  onChange={(e) => setIncludeRealWorldExamples(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#2563EB]"
                />
                <span>Real-World Context</span>
              </label>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-blue-300 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeParallelLanguage}
                  onChange={(e) => setIncludeParallelLanguage(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#2563EB]"
                />
                <span>Parallel Text ({compareLanguageName})</span>
              </label>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-blue-300 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeStudyNotes}
                  onChange={(e) => setIncludeStudyNotes(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#2563EB]"
                />
                <span>
                  Personal Study Notes {chapterNotesCount > 0 ? `(${chapterNotesCount})` : ''}
                </span>
              </label>
            </div>

            <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="truncate">{exportDoc.filename}</span>
              </div>
              <p className="mt-1 leading-relaxed">
                Formatted with legal masthead, numbered clauses, page footers, and print-ready margins.
              </p>
            </div>
          </div>

          {/* Right Live Styled Legal Sheet Preview */}
          <div className="bg-slate-100/90 p-4 dark:bg-[#0B0F17] sm:p-6">
            <div
              data-testid="pdf-document-preview"
              className="mx-auto max-w-[620px] rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
            >
              <div className="h-1 w-full rounded-full bg-[#2563EB]" />
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">
                <span>{exportDoc.jurisdiction}</span>
                <span aria-hidden="true">·</span>
                <span>{exportDoc.year}</span>
                <span aria-hidden="true">·</span>
                <span>{exportDoc.languageName}</span>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-slate-600">{exportDoc.bookTitle}</p>
              <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-950">
                {exportDoc.chapterNumberLabel}: {exportDoc.chapterTitle}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {exportDoc.chapterSummary}
              </p>

              <div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
                {exportDoc.clauses.map((clause) => (
                  <div key={clause.id} className="py-4 first:pt-4 last:pb-2">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">
                      {clause.numberLabel}
                    </p>
                    <h4 className="mt-0.5 font-display text-sm font-bold text-slate-950">
                      {clause.principle}
                    </h4>
                    <p className="mt-1.5 text-[13px] leading-[1.7] text-slate-800">
                      {clause.legalText}
                    </p>

                    {clause.parallelText && (
                      <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-blue-700">
                          Parallel ({clause.parallelLanguageName})
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {clause.parallelText}
                        </p>
                      </div>
                    )}

                    {clause.explanation && (
                      <div className="mt-2.5 rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-2.5">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-amber-700">
                          Deep Explanation
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {clause.explanation}
                        </p>
                      </div>
                    )}

                    {clause.realWorldExample && (
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-800">Real-World Context: </span>
                        {clause.realWorldExample}
                      </p>
                    )}

                    {clause.studyNotes.length > 0 && (
                      <div className="mt-2 rounded-lg border border-blue-200/80 bg-blue-50/60 px-3 py-2">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-blue-700">
                          Study Notes
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-700">
                          {clause.studyNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-500">
                <span>
                  The Constitution &amp; Law · Exported {exportDoc.generatedAtDisplay}
                </span>
                <span className="font-mono">
                  {exportDoc.paperSize.toUpperCase()} · Page 1 of {exportDoc.estimatedPages}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="border-t border-slate-100 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-[#121620]">
          {exportSuccessMessage && (
            <div
              role="status"
              data-testid="pdf-export-success"
              className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{exportSuccessMessage}</span>
            </div>
          )}

          {exportError && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
            >
              {exportError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => onRequestPrint(exportDoc)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              <span>Print Chapter</span>
            </button>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={() => void handleDownloadPdf()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {isExportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isExportingPdf ? 'Generating PDF…' : 'Download Styled PDF'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
