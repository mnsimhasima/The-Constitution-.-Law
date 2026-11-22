import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  BulkImportParseResult,
  CmsBook,
  CmsBookStatus,
  StaffRole,
  SystemSettingsRecord,
} from '../../types/backend';
import {
  parseBulkBooksCsv,
  parseBulkBooksJson,
  parseBulkBooksRows,
  SAMPLE_BULK_CSV,
  SAMPLE_BULK_JSON,
} from '../../utils/bulkImportParser';
import { canRunBulkImport } from '../../utils/rbacLogic';

interface AdminBulkImportPanelProps {
  activeRole: StaffRole;
  actor: StaffActor;
  settings: SystemSettingsRecord;
  onImportBooks: (books: CmsBook[], actor: StaffActor) => void;
}

type ImportFormat = 'json' | 'csv' | 'excel';

export function AdminBulkImportPanel({
  activeRole,
  actor,
  settings,
  onImportBooks,
}: AdminBulkImportPanelProps) {
  const canImport = canRunBulkImport(activeRole);
  const [format, setFormat] = useState<ImportFormat>('json');
  const [rawText, setRawText] = useState<string>(SAMPLE_BULK_JSON);
  const [publishImmediately, setPublishImmediately] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<BulkImportParseResult | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const defaultStatus: 'draft' | 'pending_review' | 'published' =
    activeRole === 'admin' && publishImmediately
      ? 'published'
      : settings.requireReviewBeforePublish
        ? 'pending_review'
        : 'published';

  const handleValidateText = () => {
    setImportSuccess(null);
    setFileError(null);
    const context = { uid: actor.uid, email: actor.email, defaultStatus } as const;
    const res =
      format === 'csv'
        ? parseBulkBooksCsv(rawText, context)
        : parseBulkBooksJson(rawText, context);
    setParseResult(res);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSuccess(null);
    setFileError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const context = { uid: actor.uid, email: actor.email, defaultStatus } as const;

    try {
      if (ext === 'xlsx') {
        setFormat('excel');
        const rows = await readSheet(file);
        const res = parseBulkBooksRows(rows as unknown[][], context);
        setParseResult(res);
      } else if (ext === 'csv') {
        setFormat('csv');
        const text = await file.text();
        setRawText(text);
        setParseResult(parseBulkBooksCsv(text, context));
      } else if (ext === 'json') {
        setFormat('json');
        const text = await file.text();
        setRawText(text);
        setParseResult(parseBulkBooksJson(text, context));
      } else {
        setFileError('Unsupported file format. Please upload .json, .csv, or .xlsx files.');
      }
    } catch (err) {
      setFileError(
        err instanceof Error ? `Failed to read file: ${err.message}` : 'Unable to parse uploaded file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleCommitImport = () => {
    if (!canImport || !parseResult || parseResult.books.length === 0) return;
    const booksToCommit: CmsBook[] = parseResult.books.map((book) => ({
      ...book,
      status: defaultStatus as CmsBookStatus,
    }));
    onImportBooks(booksToCommit, actor);
    setImportSuccess(
      `Imported ${booksToCommit.length} book(s) into CMS as "${defaultStatus.replace('_', ' ')}".`
    );
    setParseResult(null);
  };

  const downloadTemplate = (kind: 'json' | 'csv') => {
    const content = kind === 'json' ? SAMPLE_BULK_JSON : SAMPLE_BULK_CSV;
    const mime = kind === 'json' ? 'application/json' : 'text/csv';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = kind === 'json' ? 'constitution-books-template.json' : 'constitution-books-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-950">
            Bulk Book Imports (JSON, CSV &amp; Excel)
          </h1>
          <p className="text-xs text-slate-500">
            Upload structured constitutional and law books in JSON, CSV, or Excel (.xlsx) spreadsheets with instant schema validation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadTemplate('json')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            JSON Template
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate('csv')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            CSV / Excel Columns
          </button>
        </div>
      </div>

      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{importSuccess}</span>
        </div>
      )}

      {fileError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Upload Dropzone + Format Tabs */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  { id: 'json', label: 'JSON', icon: FileJson },
                  { id: 'csv', label: 'CSV', icon: FileSpreadsheet },
                  { id: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = format === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFormat(tab.id);
                      if (tab.id === 'json') setRawText(SAMPLE_BULK_JSON);
                      if (tab.id === 'csv') setRawText(SAMPLE_BULK_CSV);
                      setParseResult(null);
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition cursor-pointer ${
                      active ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
              <Upload className="h-3.5 w-3.5" />
              Upload .json / .csv / .xlsx
              <input
                type="file"
                accept=".json,.csv,.xlsx"
                onChange={(e) => void handleFileUpload(e)}
                className="hidden"
              />
            </label>
          </div>

          {format !== 'excel' ? (
            <>
              <textarea
                rows={12}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                aria-label="Bulk import payload"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {activeRole === 'admin' ? (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={publishImmediately}
                      onChange={(e) => setPublishImmediately(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Publish immediately (Admin override; otherwise queues for Reviewer)
                  </label>
                ) : (
                  <span className="text-xs text-slate-500">
                    Editor imports queue as <strong>Pending Review</strong> for Reviewer approval.
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleValidateText}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Validate &amp; Preview
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <FileSpreadsheet className="mx-auto h-9 w-9 text-emerald-600" />
              <p className="mt-2 font-display text-sm font-bold text-slate-950">
                Upload an Excel (.xlsx) Workbook
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Use the CSV/Excel template columns (<code className="font-mono">book_id</code>,{' '}
                <code className="font-mono">title_en</code>, <code className="font-mono">chapter_title_en</code>,{' '}
                <code className="font-mono">clause_number</code>, <code className="font-mono">clause_text_en</code>,{' '}
                <code className="font-mono">explanation_en</code>). Multiple rows sharing a{' '}
                <code className="font-mono">book_id</code> automatically group into chapters &amp; clauses.
              </p>
              <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8]">
                <Upload className="h-4 w-4" />
                Choose .xlsx File
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => void handleFileUpload(e)}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Live Validation & Import Preview */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <h2 className="font-display text-base font-bold text-slate-950">Validation Preview</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Verify parsed books, chapters, and multilingual clauses before writing to the library.
          </p>

          {!parseResult ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              Click <strong>Validate &amp; Preview</strong> or upload a file to inspect parsed books here.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Books Ready</p>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-emerald-700">
                    {parseResult.books.length}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Errors</p>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-rose-600">
                    {parseResult.errors.length}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Warnings</p>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-amber-600">
                    {parseResult.warnings.length}
                  </p>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {parseResult.errors.map((err, i) => (
                    <p key={i} className="mb-1 last:mb-0">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              {parseResult.books.length > 0 && (
                <div className="space-y-2">
                  {parseResult.books.map((book) => (
                    <div key={book.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                      <p className="font-semibold text-slate-950">{book.shortTitle}</p>
                      <p className="text-[11px] text-slate-500">
                        {book.title.en} · {book.chapters.length} ch ·{' '}
                        {book.chapters.reduce((s, c) => s + c.clauses.length, 0)} clauses
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={!canImport || parseResult.books.length === 0}
                onClick={handleCommitImport}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Import {parseResult.books.length} Book(s) to CMS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
