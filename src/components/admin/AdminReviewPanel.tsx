import {
  CheckCircle2,
  Loader2,
  Pause,
  RotateCcw,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type { CmsBook, CmsBookStatus, StaffRole } from '../../types/backend';
import { canPublishOrReviewBook, canUnpublishOrDeleteBook } from '../../utils/rbacLogic';

interface AdminReviewPanelProps {
  activeRole: StaffRole;
  actor: StaffActor;
  cmsBooks: CmsBook[];
  onReviewBook: (bookId: string, status: CmsBookStatus, notes: string, actor: StaffActor) => void;
}

export function AdminReviewPanel({
  activeRole,
  actor,
  cmsBooks,
  onReviewBook,
}: AdminReviewPanelProps) {
  const canReview = canPublishOrReviewBook(activeRole);
  const canUnpublish = canUnpublishOrDeleteBook(activeRole);

  const [statusFilter, setStatusFilter] = useState<'all' | CmsBookStatus>('all');
  const [selectedBookId, setSelectedBookId] = useState<string>(
    cmsBooks.find((b) => b.status === 'pending_review')?.id ?? cmsBooks[0]?.id ?? ''
  );
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [playingClauseId, setPlayingClauseId] = useState<string | null>(null);
  const [loadingClauseId, setLoadingClauseId] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<'en' | 'te'>('en');
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stopPreviewAudio = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    setPlayingClauseId(null);
    setLoadingClauseId(null);
  };

  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
    };
  }, []);

  const filteredBooks = cmsBooks.filter((b) =>
    statusFilter === 'all' ? true : b.status === statusFilter
  );
  const activeBook =
    cmsBooks.find((b) => b.id === selectedBookId) ?? filteredBooks[0] ?? cmsBooks[0];

  const handlePlayClause = async (clauseId: string, audioUrl?: string) => {
    if (playingClauseId === clauseId || loadingClauseId === clauseId) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    if (!audioUrl) {
      setActionBanner(
        'No manual audio file attached to this block yet. Upload an audio file in Books & Structures CMS.'
      );
      return;
    }
    setLoadingClauseId(clauseId);
    try {
      const audio = new Audio(audioUrl);
      audioElRef.current = audio;
      audio.onended = () => setPlayingClauseId(null);
      audio.onerror = () => {
        setPlayingClauseId(null);
        setActionBanner('Unable to play the uploaded audio file for this block.');
      };
      setLoadingClauseId(null);
      setPlayingClauseId(clauseId);
      await audio.play();
    } catch (err) {
      setLoadingClauseId(null);
      setPlayingClauseId(null);
      setActionBanner(
        err instanceof Error ? err.message : 'Unable to play uploaded audio file.'
      );
    }
  };

  const handleDecision = (nextStatus: CmsBookStatus) => {
    if (!activeBook) return;
    onReviewBook(
      activeBook.id,
      nextStatus,
      reviewNotes.trim() ||
        (nextStatus === 'published'
          ? 'Reviewed text and audio narration; approved for Mobile App release.'
          : 'Editorial revision requested by reviewer.'),
      actor
    );
    setActionBanner(
      nextStatus === 'published'
        ? `"${activeBook.shortTitle}" is now PUBLISHED and live in the Mobile App Library.`
        : `"${activeBook.shortTitle}" status updated to "${nextStatus.replace('_', ' ')}".`
    );
    setReviewNotes('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-950">
            Review &amp; Publish Control
          </h1>
          <p className="text-xs text-slate-500">
            Inspect every chapter, read English &amp; Telugu text, play audio narration directly, and approve books for the mobile app.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {(
            [
              { id: 'all', label: `All (${cmsBooks.length})` },
              {
                id: 'pending_review',
                label: `Pending (${cmsBooks.filter((b) => b.status === 'pending_review').length})`,
              },
              {
                id: 'published',
                label: `Published (${cmsBooks.filter((b) => b.status === 'published').length})`,
              },
              {
                id: 'changes_requested',
                label: `Revisions (${cmsBooks.filter((b) => b.status === 'changes_requested').length})`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`h-8 rounded-md px-3 font-semibold transition cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {actionBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {actionBanner}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Queue List */}
        <div className="space-y-2 lg:col-span-4">
          {filteredBooks.map((book) => {
            const selected = activeBook?.id === book.id;
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => {
                  setSelectedBookId(book.id);
                  setActionBanner(null);
                }}
                className={`block w-full rounded-xl border p-4 text-left transition cursor-pointer ${
                  selected
                    ? 'border-[#2563EB] bg-blue-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm font-bold text-slate-950">{book.shortTitle}</p>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      book.status === 'published'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : book.status === 'pending_review'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {book.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-slate-600">{book.title.en}</p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  By {book.createdByEmail} · {book.chapters.length} ch
                </p>
              </button>
            );
          })}
        </div>

        {/* Full Content & Audio Reviewer Inspection Pane */}
        {activeBook && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase text-blue-600">
                  {activeBook.category} · {activeBook.jurisdiction} · {activeBook.year}
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-950">
                  {activeBook.title.en}
                </h2>
                {activeBook.title.te && (
                  <p className="text-xs font-medium text-indigo-800">{activeBook.title.te}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Source: {activeBook.sourceAttribution} · License: {activeBook.rightsLicense}
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewLang('en')}
                  className={`h-7 rounded px-2.5 font-mono font-bold cursor-pointer ${
                    previewLang === 'en' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLang('te')}
                  className={`h-7 rounded px-2.5 font-mono font-bold cursor-pointer ${
                    previewLang === 'te' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  T (తెలుగు)
                </button>
              </div>
            </div>

            {/* Chapter & Clause Reader + Direct Audio Playback */}
            <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
              {activeBook.chapters.map((chapter) => {
                const chapterTitle = chapter.title[previewLang] ?? chapter.title.en;
                const chapterSummary = chapter.summary[previewLang] ?? chapter.summary.en;
                const headerKey = `header-${chapter.id}`;
                const isHeaderPlaying = playingClauseId === headerKey;
                const isHeaderLoading = loadingClauseId === headerKey;
                return (
                  <div key={chapter.id} className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-bold text-slate-900">
                          {chapter.number}: {chapterTitle}
                        </h3>
                        {chapterSummary && (
                          <p className="mt-0.5 text-xs text-slate-600">{chapterSummary}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handlePlayClause(headerKey, chapter.overviewAudioUrl)}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition cursor-pointer ${
                          isHeaderPlaying || isHeaderLoading
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-blue-200 bg-white text-blue-700 hover:border-blue-500'
                        }`}
                      >
                        {isHeaderLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                          </>
                        ) : isHeaderPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" /> Stop
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" /> Play Header
                          </>
                        )}
                      </button>
                    </div>
                    {chapter.clauses.map((clause) => {
                      const clausePrinciple = clause.principle[previewLang] ?? clause.principle.en;
                      const clauseText = clause.text[previewLang] ?? clause.text.en;
                      const clauseMeaning = clause.explanation[previewLang] ?? clause.explanation.en;
                      const clauseExample =
                        clause.realWorldExample?.[previewLang] ?? clause.realWorldExample?.en ?? '';
                      const isPlaying = playingClauseId === clause.id;
                      const isLoading = loadingClauseId === clause.id;
                      return (
                        <div key={clause.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-950">
                              <span className="mr-2 font-mono text-blue-600">{clause.number}</span>
                              {clausePrinciple}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const clauseAudio =
                                  clause.audioAttachments?.full?.audioUrl ||
                                  clause.audioAttachments?.definition?.audioUrl ||
                                  clause.audioAttachments?.text?.audioUrl ||
                                  clause.audioAttachments?.explanation?.audioUrl;
                                void handlePlayClause(clause.id, clauseAudio);
                              }}
                              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition cursor-pointer ${
                                isPlaying || isLoading
                                  ? 'bg-[#2563EB] text-white'
                                  : 'border border-slate-300 bg-white text-slate-700 hover:border-blue-500'
                              }`}
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                                </>
                              ) : isPlaying ? (
                                <>
                                  <Pause className="h-3.5 w-3.5" /> Stop Audio
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5" /> Play Audio
                                </>
                              )}
                            </button>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-800">{clauseText}</p>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                            <strong className="text-slate-900">Meaning: </strong>
                            {clauseMeaning}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Reviewer Action Footer */}
            {canReview && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <label className="block text-xs font-semibold text-slate-700">
                  Review Notes / Audit Comment
                </label>
                <input
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional review feedback (e.g. Verified Article citations & Telugu audio accuracy)…"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecision('published')}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve &amp; Publish to Mobile App
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision('changes_requested')}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    <XCircle className="h-4 w-4" />
                    Request Editorial Changes
                  </button>
                  {canUnpublish && activeBook.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => handleDecision('draft')}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Unpublish to Draft
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
