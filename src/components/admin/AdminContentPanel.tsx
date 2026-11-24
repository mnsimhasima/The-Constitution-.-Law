import {
  BookPlus,
  CheckCircle2,
  Cloud,
  Database,
  FileAudio,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  AudioTrackRecord,
  AudioTrackStatus,
  CmsBook,
  CmsBookStatus,
  ContentAudioBlockRole,
  ContentAudioLanguageCode,
  ContentAudioMetadataRecord,
  StaffRole,
} from '../../types/backend';
import type { BookCategory, Chapter, Clause, LanguageCode, LawBook } from '../../types/library';
import type { OttAudioBlockRole } from '../../types/ott';
import { sanitizeSlugId } from '../../utils/bulkImportParser';
import {
  BLOCK_ROLE_LABELS,
  buildClauseAudioAttachment,
  buildContentAudioDocId,
  formatAudioFileSize,
  inferContentNodeType,
} from '../../utils/contentAudioMetadata';
import { uploadAudioFileForContentNode } from '../../utils/contentAudioUploadClient';
import {
  canCreateOrEditBook,
  canPublishOrReviewBook,
  canUnpublishOrDeleteBook,
} from '../../utils/rbacLogic';
import {
  type DraftClauseAudioMap,
  DraftClauseAudioUploads,
  ExistingClauseAudioPanel,
} from './SectionArticleAudioFields';

interface AdminContentPanelProps {
  mode: 'books' | 'verses' | 'audio';
  activeRole: StaffRole;
  actor: StaffActor;
  isFirebaseSignedIn: boolean;
  cmsBooks: CmsBook[];
  audioTracks: AudioTrackRecord[];
  contentAudioMetadata: ContentAudioMetadataRecord[];
  onUpsertBook: (book: CmsBook, actor: StaffActor) => void;
  onReviewBook: (bookId: string, status: CmsBookStatus, notes: string, actor: StaffActor) => void;
  onDeleteBook: (bookId: string, actor: StaffActor) => void;
  onAddChapter: (bookId: string, chapter: Chapter, actor: StaffActor) => void;
  onUpsertClause: (bookId: string, chapterId: string, clause: Clause, actor: StaffActor) => void;
  onDeleteClause: (bookId: string, chapterId: string, clauseId: string, actor: StaffActor) => void;
  onUpsertContentAudio: (
    input: Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'>,
    actor: StaffActor
  ) => Promise<{ record: ContentAudioMetadataRecord; firestoreSynced: boolean; error?: string }>;
  onDeleteContentAudio: (audioId: string, actor: StaffActor) => Promise<void>;
  onUpdateContentAudioStatus: (
    audioId: string,
    status: AudioTrackStatus,
    actor: StaffActor
  ) => Promise<void>;
  onUpsertAudioTrack: (track: AudioTrackRecord, actor: StaffActor) => void;
  onUpdateAudioStatus: (trackId: string, status: AudioTrackStatus, actor: StaffActor) => void;
}

function mapDraftRoleToOttRole(role: ContentAudioBlockRole): OttAudioBlockRole {
  switch (role) {
    case 'text':
    case 'definition':
      return 'unit_definition';
    case 'purpose':
      return 'unit_purpose';
    case 'explanation':
      return 'unit_explanation';
    case 'example':
      return 'unit_examples';
    case 'full':
    default:
      return 'unit_full';
  }
}

export function AdminContentPanel({
  mode,
  activeRole,
  actor,
  isFirebaseSignedIn,
  cmsBooks,
  audioTracks,
  contentAudioMetadata,
  onUpsertBook,
  onReviewBook,
  onDeleteBook,
  onAddChapter,
  onUpsertClause,
  onDeleteClause,
  onUpsertContentAudio,
  onDeleteContentAudio,
  onUpdateContentAudioStatus,
  onUpsertAudioTrack,
  onUpdateAudioStatus,
}: AdminContentPanelProps) {
  const canEdit = canCreateOrEditBook(activeRole);
  const canApprove = canPublishOrReviewBook(activeRole);
  const canDelete = canUnpublishOrDeleteBook(activeRole);

  // ---- BOOKS & STRUCTURES STATE ----
  const [showNewBookForm, setShowNewBookForm] = useState(false);
  const [bookShortTitle, setBookShortTitle] = useState('');
  const [bookTitleEn, setBookTitleEn] = useState('');
  const [bookTitleTe, setBookTitleTe] = useState('');
  const [bookSubtitleEn, setBookSubtitleEn] = useState('');
  const [bookJurisdiction, setBookJurisdiction] = useState('Republic of India');
  const [bookYear, setBookYear] = useState('2025');
  const [bookCategory, setBookCategory] = useState<Exclude<BookCategory, 'custom'>>('statutory');
  const [bookCoverTone, setBookCoverTone] = useState<LawBook['coverTone']>('cobalt');
  const [bookSource, setBookSource] = useState('Official Gazette / Legislative Department');
  const [bookLicense, setBookLicense] = useState('Public Domain / Civic Education');
  const [firstChapterTitle, setFirstChapterTitle] = useState('Chapter 1 — Core Provisions');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // ---- VERSES & MEANING STATE ----
  const [selectedBookId, setSelectedBookId] = useState<string>(cmsBooks[0]?.id ?? '');
  const activeBook = cmsBooks.find((b) => b.id === selectedBookId) ?? cmsBooks[0];
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    activeBook?.chapters[0]?.id ?? ''
  );
  const activeChapter =
    activeBook?.chapters.find((c) => c.id === selectedChapterId) ?? activeBook?.chapters[0];

  const [newChapterTitleEn, setNewChapterTitleEn] = useState('');
  const [editingClauseId, setEditingClauseId] = useState<string | null>(null);
  const [clauseNumber, setClauseNumber] = useState('');
  const [clausePrincipleEn, setClausePrincipleEn] = useState('');
  const [clausePrincipleTe, setClausePrincipleTe] = useState('');
  const [clauseTextEn, setClauseTextEn] = useState('');
  const [clauseTextTe, setClauseTextTe] = useState('');
  const [clauseMeaningEn, setClauseMeaningEn] = useState('');
  const [clauseMeaningTe, setClauseMeaningTe] = useState('');
  const [clauseExampleEn, setClauseExampleEn] = useState('');
  const [draftAudioLang, setDraftAudioLang] = useState<ContentAudioLanguageCode>('en');
  const [draftAudioNarrator, setDraftAudioNarrator] = useState('Legal Audio Studio');
  const [draftClauseAudio, setDraftClauseAudio] = useState<DraftClauseAudioMap>({});
  const [draftUploadingRole, setDraftUploadingRole] = useState<ContentAudioBlockRole | null>(null);
  const [draftAudioError, setDraftAudioError] = useState<string | null>(null);

  // ---- AUDIO LIBRARY STATE ----
  const [audioBookId, setAudioBookId] = useState<string>(cmsBooks[0]?.id ?? '');
  const [audioLanguage, setAudioLanguage] = useState<LanguageCode>('en');
  const [audioNarrator, setAudioNarrator] = useState('');
  const [audioDuration, setAudioDuration] = useState('05:00');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioUploading, setAudioUploading] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const handleCreateBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !bookTitleEn.trim() || !bookShortTitle.trim()) return;
    const id = sanitizeSlugId(bookShortTitle, 'book');
    const nowIso = new Date().toISOString();
    const initialStatus: CmsBookStatus = activeRole === 'admin' ? 'draft' : 'pending_review';
    const newBook: CmsBook = {
      id,
      shortTitle: bookShortTitle.trim(),
      title: { en: bookTitleEn.trim(), ...(bookTitleTe.trim() ? { te: bookTitleTe.trim() } : {}) },
      subtitle: {
        en: bookSubtitleEn.trim() || `${bookTitleEn.trim()} official text and plain-language explanation.`,
      },
      jurisdiction: bookJurisdiction.trim() || 'Republic of India',
      year: bookYear.trim() || '2025',
      category: bookCategory,
      coverTone: bookCoverTone,
      status: initialStatus,
      sourceAttribution: bookSource.trim(),
      rightsLicense: bookLicense.trim(),
      chapters: [
        {
          id: `${id}-ch-1`,
          number: 'Chapter 1',
          title: { en: firstChapterTitle.trim() || 'Introduction & Core Clauses' },
          summary: { en: 'Primary statutory provisions and plain-language guidance.' },
          estimatedMinutes: 5,
          clauses: [],
        },
      ],
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      reviewedByEmail: '',
      reviewNotes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onUpsertBook(newBook, actor);
    setSelectedBookId(newBook.id);
    setSelectedChapterId(newBook.chapters[0].id);
    setBookShortTitle('');
    setBookTitleEn('');
    setBookTitleTe('');
    setBookSubtitleEn('');
    setShowNewBookForm(false);
    setFeedbackMsg(`Created "${newBook.shortTitle}". Add verses & audio or submit for review.`);
  };

  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !activeBook || !newChapterTitleEn.trim()) return;
    const chNum = activeBook.chapters.length + 1;
    const chapter: Chapter = {
      id: sanitizeSlugId(`${activeBook.id}-ch-${chNum}-${newChapterTitleEn}`, `ch-${chNum}`),
      number: `Chapter ${chNum}`,
      title: { en: newChapterTitleEn.trim() },
      summary: { en: `${newChapterTitleEn.trim()} — structured legal commentary.` },
      estimatedMinutes: 5,
      clauses: [],
    };
    onAddChapter(activeBook.id, chapter, actor);
    setSelectedChapterId(chapter.id);
    setNewChapterTitleEn('');
    setFeedbackMsg(`Added "${chapter.title.en}" to ${activeBook.shortTitle}.`);
  };

  const resetClauseForm = () => {
    setEditingClauseId(null);
    setClauseNumber('');
    setClausePrincipleEn('');
    setClausePrincipleTe('');
    setClauseTextEn('');
    setClauseTextTe('');
    setClauseMeaningEn('');
    setClauseMeaningTe('');
    setClauseExampleEn('');
    setDraftClauseAudio({});
    setDraftAudioError(null);
  };

  const handleLoadClauseForEdit = (cl: Clause) => {
    setEditingClauseId(cl.id);
    setClauseNumber(cl.number);
    setClausePrincipleEn(cl.principle.en);
    setClausePrincipleTe(cl.principle.te ?? '');
    setClauseTextEn(cl.text.en);
    setClauseTextTe(cl.text.te ?? '');
    setClauseMeaningEn(cl.explanation.en);
    setClauseMeaningTe(cl.explanation.te ?? '');
    setClauseExampleEn(cl.realWorldExample.en);
    setDraftClauseAudio({});
    setDraftAudioError(null);
  };

  const handleUploadDraftClauseAudio = async (role: ContentAudioBlockRole, file: File) => {
    if (!canEdit || !activeChapter) return;
    setDraftUploadingRole(role);
    setDraftAudioError(null);
    try {
      const provisionalId =
        editingClauseId ??
        sanitizeSlugId(`${activeChapter.id}-${clauseNumber || 'draft-node'}`, 'clause');
      const uploaded = await uploadAudioFileForContentNode({
        file,
        entityType: 'cms_clause',
        entityId: provisionalId,
        blockRole: mapDraftRoleToOttRole(role),
        uploadedByUid: actor.uid,
      });
      setDraftClauseAudio((prev) => ({ ...prev, [role]: uploaded }));
    } catch (err) {
      setDraftAudioError(err instanceof Error ? err.message : 'Unable to upload audio file.');
    } finally {
      setDraftUploadingRole(null);
    }
  };

  const handleSaveClause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !activeBook || !activeChapter) return;
    if (!clauseNumber.trim() || !clauseTextEn.trim() || !clauseMeaningEn.trim()) return;

    const existingClause = editingClauseId
      ? activeChapter.clauses.find((c) => c.id === editingClauseId)
      : undefined;
    const clauseId =
      editingClauseId ?? sanitizeSlugId(`${activeChapter.id}-${clauseNumber}`, 'clause');
    const nodeType = inferContentNodeType(clauseNumber);
    const nowIso = new Date().toISOString();

    const stagedRoles = (Object.keys(draftClauseAudio) as ContentAudioBlockRole[]).filter(
      (role) => Boolean(draftClauseAudio[role])
    );

    const nextAudioAttachments = { ...(existingClause?.audioAttachments ?? {}) };
    const metadataInputs: Array<
      Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'>
    > = [];

    for (const role of stagedRoles) {
      const uploaded = draftClauseAudio[role];
      if (!uploaded) continue;
      const docId = buildContentAudioDocId('cms_books', clauseId, role, draftAudioLang);
      const recordInput: Omit<
        ContentAudioMetadataRecord,
        'createdAt' | 'updatedAt' | 'firestoreSynced'
      > = {
        id: docId,
        contentSource: 'cms_books',
        bookId: activeBook.id,
        bookTitle: activeBook.shortTitle,
        editionId: '',
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title.en,
        contentNodeId: clauseId,
        contentNodeType: nodeType,
        contentNodeNumber: clauseNumber.trim(),
        contentNodeTitle: clausePrincipleEn.trim() || clauseNumber.trim(),
        blockRole: role,
        language: draftAudioLang,
        narrator: draftAudioNarrator.trim() || actor.email || 'Legal Audio Studio',
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        byteSize: uploaded.byteSize,
        durationSec: uploaded.durationSec,
        durationLabel: uploaded.durationLabel,
        audioUrl: uploaded.audioUrl,
        assetId: uploaded.assetId,
        sha256Checksum: uploaded.sha256Checksum,
        status: activeRole === 'admin' ? 'published' : 'pending_review',
        uploadedByUid: actor.uid,
        uploadedByEmail: actor.email,
      };
      metadataInputs.push(recordInput);
      nextAudioAttachments[role] = buildClauseAudioAttachment({
        ...recordInput,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    const clause: Clause = {
      id: clauseId,
      number: clauseNumber.trim(),
      principle: {
        en: clausePrincipleEn.trim() || clauseNumber.trim(),
        ...(clausePrincipleTe.trim() ? { te: clausePrincipleTe.trim() } : {}),
      },
      text: {
        en: clauseTextEn.trim(),
        ...(clauseTextTe.trim() ? { te: clauseTextTe.trim() } : {}),
      },
      explanation: {
        en: clauseMeaningEn.trim(),
        ...(clauseMeaningTe.trim() ? { te: clauseMeaningTe.trim() } : {}),
      },
      realWorldExample: {
        en: clauseExampleEn.trim() || `Everyday constitutional application of ${clauseNumber.trim()}.`,
      },
      ...(Object.keys(nextAudioAttachments).length > 0
        ? { audioAttachments: nextAudioAttachments }
        : {}),
    };

    onUpsertClause(activeBook.id, activeChapter.id, clause, actor);

    let syncedCount = 0;
    for (const metaInput of metadataInputs) {
      const res = await onUpsertContentAudio(metaInput, actor);
      if (res.firestoreSynced) syncedCount += 1;
    }

    const audioSummary =
      metadataInputs.length > 0
        ? syncedCount > 0
          ? ` Linked ${metadataInputs.length} audio file(s) and stored metadata in Supabase DB + S3.`
          : ` Linked ${metadataInputs.length} audio file(s) to content_audio_metadata (${clause.id}).`
        : '';

    resetClauseForm();
    setFeedbackMsg(`Saved ${clause.number} to ${activeBook.shortTitle}.${audioSummary}`);
  };

  const handleUploadAudioTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const targetBook = cmsBooks.find((b) => b.id === audioBookId) ?? cmsBooks[0];
    const targetChapter = targetBook?.chapters[0];
    if (!targetBook || !targetChapter || !audioNarrator.trim()) return;
    const nowIso = new Date().toISOString();
    const track: AudioTrackRecord = {
      id: sanitizeSlugId(`aud-${targetBook.id}-${audioLanguage}-${Date.now().toString(36)}`, 'aud'),
      bookId: targetBook.id,
      bookTitle: targetBook.shortTitle,
      chapterId: targetChapter.id,
      chapterTitle: targetChapter.title.en,
      language: audioLanguage,
      narrator: audioNarrator.trim(),
      durationLabel: audioDuration.trim() || '05:00',
      audioUrl: audioUrl.trim(),
      status: activeRole === 'admin' ? 'published' : 'pending_review',
      uploadedByUid: actor.uid,
      uploadedByEmail: actor.email,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onUpsertAudioTrack(track, actor);
    setAudioNarrator('');
    setAudioUrl('');
    setFeedbackMsg(`Added audio track for "${targetBook.shortTitle}" (${audioLanguage.toUpperCase()}).`);
  };

  const handleLocalAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUploading(true);
    try {
      const targetBook = cmsBooks.find((b) => b.id === audioBookId) ?? cmsBooks[0];
      const uploaded = await uploadAudioFileForContentNode({
        file,
        entityType: 'cms_clause',
        entityId: targetBook?.id ?? 'chapter-audio',
        blockRole: 'chapter_overview',
        uploadedByUid: actor.uid,
      });
      setAudioUrl(uploaded.audioUrl);
      setAudioDuration(uploaded.durationLabel);
      if (!audioNarrator) {
        setAudioNarrator(file.name.replace(/\.[^/.]+$/, ''));
      }
      setFeedbackMsg(`Uploaded "${uploaded.fileName}" (${uploaded.durationLabel}). Click "Add Audio Track" to save.`);
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Unable to upload audio file.');
    } finally {
      setAudioUploading(false);
      e.target.value = '';
    }
  };

  const togglePlayDirectUrl = (playKey: string, url: string) => {
    if (playingTrackId === playKey) {
      audioElRef.current?.pause();
      audioElRef.current = null;
      setPlayingTrackId(null);
      return;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    setPlayingTrackId(playKey);
    const audio = new Audio(url);
    audioElRef.current = audio;
    audio.onended = () => setPlayingTrackId(null);
    audio.onerror = () => setPlayingTrackId(null);
    void audio.play().catch(() => setPlayingTrackId(null));
  };

  const togglePlayTrack = async (track: AudioTrackRecord) => {
    if (playingTrackId === track.id) {
      audioElRef.current?.pause();
      audioElRef.current = null;
      setPlayingTrackId(null);
      return;
    }

    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }

    setPlayingTrackId(track.id);
    if (
      track.audioUrl &&
      (track.audioUrl.startsWith('http') ||
        track.audioUrl.startsWith('blob:') ||
        track.audioUrl.startsWith('/api/'))
    ) {
      const audio = new Audio(track.audioUrl);
      audioElRef.current = audio;
      audio.onended = () => setPlayingTrackId(null);
      void audio.play().catch(() => setPlayingTrackId(null));
      return;
    }

    setPlayingTrackId(null);
    setFeedbackMsg(
      'No manual audio file uploaded for this track yet. Upload an audio file in Books & Structures or Audio Library to enable playback.'
    );
  };

  // =========================================================================
  // VIEW 1: BOOKS & STRUCTURES
  // =========================================================================
  if (mode === 'books') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Books &amp; Structures</h1>
            <p className="text-xs text-slate-500">
              Create, organize chapters, submit for review, and control publication to the mobile app.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNewBookForm((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              <BookPlus className="h-4 w-4" />
              {showNewBookForm ? 'Close Form' : 'Add New Book'}
            </button>
          )}
        </div>

        {feedbackMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {feedbackMsg}
          </div>
        )}

        {showNewBookForm && canEdit && (
          <form
            onSubmit={handleCreateBook}
            className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700">Short Title *</label>
              <input
                required
                value={bookShortTitle}
                onChange={(e) => setBookShortTitle(e.target.value)}
                placeholder="e.g. RTI Act 2005"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Full Title (English) *</label>
              <input
                required
                value={bookTitleEn}
                onChange={(e) => setBookTitleEn(e.target.value)}
                placeholder="e.g. Right to Information Act, 2005"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Full Title (Telugu — Optional)</label>
              <input
                value={bookTitleTe}
                onChange={(e) => setBookTitleTe(e.target.value)}
                placeholder="సమాచార హక్కు చట్టం, 2005"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Jurisdiction &amp; Year</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={bookJurisdiction}
                  onChange={(e) => setBookJurisdiction(e.target.value)}
                  className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
                <input
                  value={bookYear}
                  onChange={(e) => setBookYear(e.target.value)}
                  className="h-10 w-24 rounded-lg border border-slate-300 px-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Category</label>
              <select
                value={bookCategory}
                onChange={(e) => setBookCategory(e.target.value as Exclude<BookCategory, 'custom'>)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="constitutions">Constitutions</option>
                <option value="statutory">Statutory Law</option>
                <option value="history">Ambedkar &amp; Constitutional History</option>
                <option value="international">International Covenants</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Cover Tone</label>
              <select
                value={bookCoverTone}
                onChange={(e) => setBookCoverTone(e.target.value as LawBook['coverTone'])}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="cobalt">Cobalt Blue</option>
                <option value="emerald">Emerald</option>
                <option value="amber">Amber Gold</option>
                <option value="sapphire">Sapphire</option>
                <option value="slate">Slate</option>
                <option value="obsidian">Obsidian</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">Subtitle / Description</label>
              <input
                value={bookSubtitleEn}
                onChange={(e) => setBookSubtitleEn(e.target.value)}
                placeholder="Plain-language summary of this book's civic purpose"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Initial Chapter Title</label>
              <input
                value={firstChapterTitle}
                onChange={(e) => setFirstChapterTitle(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Source &amp; License</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={bookSource}
                  onChange={(e) => setBookSource(e.target.value)}
                  className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
                <input
                  value={bookLicense}
                  onChange={(e) => setBookLicense(e.target.value)}
                  className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                Save Book to CMS
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th className="px-5 py-3">Book Title</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3 text-right">Chapters</th>
                <th className="px-3 py-3 text-right">Clauses</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cmsBooks.map((book) => {
                const clauseCount = book.chapters.reduce((s, ch) => s + ch.clauses.length, 0);
                return (
                  <tr key={book.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-950">{book.shortTitle}</p>
                      <p className="text-[11px] text-slate-500">
                        {book.title.en} · {book.year}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 capitalize text-slate-600">{book.category}</td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-800">
                      {book.chapters.length}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-800">
                      {clauseCount}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          book.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : book.status === 'pending_review'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : book.status === 'changes_requested'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {book.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canEdit && book.status !== 'pending_review' && book.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() =>
                              onReviewBook(book.id, 'pending_review', 'Submitted by editor for review.', actor)
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                          >
                            <Send className="h-3 w-3" />
                            Submit Review
                          </button>
                        )}
                        {canApprove && book.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() =>
                              onReviewBook(book.id, 'published', 'Approved & published to mobile app.', actor)
                            }
                            className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                          >
                            Publish
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteBook(book.id, actor)}
                            aria-label={`Delete ${book.shortTitle}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: VERSES / CLAUSES & MEANING
  // =========================================================================
  if (mode === 'verses') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Verses, Articles &amp; Meaning</h1>
            <p className="text-xs text-slate-500">
              Manage primary legal text, Telugu translations, and plain-language civic explanations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select book"
              value={activeBook?.id ?? ''}
              onChange={(e) => {
                const nextBook = cmsBooks.find((b) => b.id === e.target.value);
                setSelectedBookId(e.target.value);
                setSelectedChapterId(nextBook?.chapters[0]?.id ?? '');
              }}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              {cmsBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortTitle} ({b.status})
                </option>
              ))}
            </select>
            <select
              aria-label="Select chapter"
              value={activeChapter?.id ?? ''}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              {(activeBook?.chapters ?? []).map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.number}: {ch.title.en}
                </option>
              ))}
            </select>
          </div>
        </div>

        {feedbackMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {feedbackMsg}
          </div>
        )}

        {canEdit && activeBook && (
          <form
            onSubmit={handleAddChapter}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4"
          >
            <input
              value={newChapterTitleEn}
              onChange={(e) => setNewChapterTitleEn(e.target.value)}
              placeholder={`Add new chapter to ${activeBook.shortTitle}…`}
              className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Chapter
            </button>
          </form>
        )}

        <div className="grid gap-5 lg:grid-cols-12">
          {/* Existing Clauses List with Dedicated Per-Section / Per-Article Audio Upload Fields */}
          <div className="space-y-3 lg:col-span-7">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Articles &amp; Sections in {activeChapter?.title.en ?? 'Chapter'} ({activeChapter?.clauses.length ?? 0})
            </h2>
            {(activeChapter?.clauses ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
                No articles or sections added to this chapter yet.
              </div>
            ) : (
              activeChapter?.clauses.map((cl) => (
                <article
                  key={cl.id}
                  className={`rounded-xl border bg-white p-4 transition ${
                    editingClauseId === cl.id ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] font-bold text-blue-600">{cl.number}</span>
                      <h3 className="font-display text-sm font-bold text-slate-950">{cl.principle.en}</h3>
                    </div>
                    {canEdit && activeBook && activeChapter && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadClauseForEdit(cl)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 cursor-pointer"
                          aria-label={`Edit ${cl.number}`}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteClause(activeBook.id, activeChapter.id, cl.id, actor)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                          aria-label={`Delete ${cl.number}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-800">{cl.text.en}</p>
                  {cl.text.te && (
                    <p className="mt-1.5 text-xs leading-relaxed text-indigo-800">TE: {cl.text.te}</p>
                  )}
                  <div className="mt-2.5 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">Plain Meaning: </span>
                    {cl.explanation.en}
                  </div>

                  {activeBook && activeChapter && (
                    <ExistingClauseAudioPanel
                      book={activeBook}
                      chapter={activeChapter}
                      clause={cl}
                      canEdit={canEdit}
                      activeRole={activeRole}
                      actor={actor}
                      isFirebaseSignedIn={isFirebaseSignedIn}
                      contentAudioMetadata={contentAudioMetadata}
                      onUpsertContentAudio={onUpsertContentAudio}
                      onDeleteContentAudio={onDeleteContentAudio}
                      onFeedback={(msg) => setFeedbackMsg(msg)}
                    />
                  )}
                </article>
              ))
            )}
          </div>

          {/* Add / Edit Article or Section Editor with Dedicated Audio File Uploads */}
          {canEdit && activeBook && activeChapter && (
            <form
              onSubmit={(e) => void handleSaveClause(e)}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-950">
                  {editingClauseId ? `Edit ${clauseNumber || 'Article / Section'}` : 'Add Article / Section & Audio'}
                </h2>
                {editingClauseId && (
                  <button
                    type="button"
                    onClick={resetClauseForm}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    Cancel Edit
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Article / Section # *</label>
                  <input
                    required
                    value={clauseNumber}
                    onChange={(e) => setClauseNumber(e.target.value)}
                    placeholder="Article 21A"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Principle (EN) *</label>
                  <input
                    required
                    value={clausePrincipleEn}
                    onChange={(e) => setClausePrincipleEn(e.target.value)}
                    placeholder="Right to Education"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Primary Text (English) *</label>
                <textarea
                  required
                  rows={3}
                  value={clauseTextEn}
                  onChange={(e) => setClauseTextEn(e.target.value)}
                  placeholder="Exact statutory or constitutional clause text…"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Plain-Language Meaning (English) *</label>
                <textarea
                  required
                  rows={3}
                  value={clauseMeaningEn}
                  onChange={(e) => setClauseMeaningEn(e.target.value)}
                  placeholder="Clear citizen-friendly explanation…"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Telugu Principle &amp; Text (Optional)</label>
                <input
                  value={clausePrincipleTe}
                  onChange={(e) => setClausePrincipleTe(e.target.value)}
                  placeholder="తెలుగు శీర్షిక"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
                />
                <textarea
                  rows={2}
                  value={clauseTextTe}
                  onChange={(e) => setClauseTextTe(e.target.value)}
                  placeholder="తెలుగు ప్రాథమిక పాఠ్యం…"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-600"
                />
                <textarea
                  rows={2}
                  value={clauseMeaningTe}
                  onChange={(e) => setClauseMeaningTe(e.target.value)}
                  placeholder="తెలుగు సులభ వివరణ…"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Real-World Example (EN)</label>
                <input
                  value={clauseExampleEn}
                  onChange={(e) => setClauseExampleEn(e.target.value)}
                  placeholder="Everyday civic example…"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <DraftClauseAudioUploads
                clauseNumberLabel={clauseNumber}
                draftLanguage={draftAudioLang}
                draftNarrator={draftAudioNarrator}
                draftAudioMap={draftClauseAudio}
                uploadingRole={draftUploadingRole}
                errorText={draftAudioError}
                onChangeLanguage={setDraftAudioLang}
                onChangeNarrator={setDraftAudioNarrator}
                onUploadDraftAudio={handleUploadDraftClauseAudio}
                onRemoveDraftAudio={(role) =>
                  setDraftClauseAudio((prev) => {
                    const next = { ...prev };
                    delete next[role];
                    return next;
                  })
                }
              />

              <button
                type="submit"
                disabled={draftUploadingRole !== null}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {editingClauseId ? 'Update Article / Section & Audio' : 'Save Article / Section & Audio'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: AUDIO LIBRARY
  // =========================================================================
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-950">Audio Library</h1>
        <p className="text-xs text-slate-500">
          Upload chapter audio narrations (MP3/WAV/URL), preview playback directly, and approve tracks for the mobile player.
        </p>
      </div>

      {feedbackMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          {feedbackMsg}
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={handleUploadAudioTrack}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4"
        >
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Target Book</label>
            <select
              value={audioBookId}
              onChange={(e) => setAudioBookId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-600"
            >
              {cmsBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortTitle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Language</label>
            <select
              value={audioLanguage}
              onChange={(e) => setAudioLanguage(e.target.value as LanguageCode)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-600"
            >
              <option value="en">English (EN)</option>
              <option value="te">Telugu (తెలుగు)</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="es">Spanish (ES)</option>
              <option value="fr">French (FR)</option>
              <option value="ar">Arabic (AR)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Narrator / Studio Voice *</label>
            <input
              required
              value={audioNarrator}
              onChange={(e) => setAudioNarrator(e.target.value)}
              placeholder="e.g. Adv. Meera Studio"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Duration (MM:SS)</label>
            <input
              value={audioDuration}
              onChange={(e) => setAudioDuration(e.target.value)}
              placeholder="06:30"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs outline-none focus:border-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700">Audio Stream URL (Optional)</label>
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://cdn.example.com/audio/chapter1.mp3 (leave blank for TTS studio playback)"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Or Pick Audio File</label>
            <label className="mt-1 flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-blue-500">
              <Upload className="h-3.5 w-3.5" />
              {audioUploading ? 'Uploading…' : 'Select MP3 / WAV'}
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/webm"
                disabled={audioUploading}
                onChange={(e) => void handleLocalAudioFile(e)}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={audioUploading}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60 cursor-pointer"
            >
              <FileAudio className="h-4 w-4" />
              Add Audio Track
            </button>
          </div>
        </form>
      )}

      {/* Linked Per-Section & Per-Article Supabase Audio Metadata */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600" />
            <div>
              <h2 className="font-display text-sm font-bold text-slate-950">
                Linked Section &amp; Article Audio Metadata (Supabase DB + S3)
              </h2>
              <p className="text-[11px] text-slate-500">
                Table <span className="font-mono">content_audio_metadata</span> — every uploaded file stored in Supabase S3 and linked to its exact section or article node.
              </p>
            </div>
          </div>
          <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700">
            {contentAudioMetadata.length} linked file{contentAudioMetadata.length === 1 ? '' : 's'}
          </span>
        </div>

        {contentAudioMetadata.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No per-section or per-article audio files uploaded yet. Open <strong>Books &amp; Structures</strong> or <strong>Verses &amp; Meaning</strong> to upload audio directly to Supabase S3 on any Article or Section.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th className="px-5 py-2.5">Play</th>
                <th className="px-3 py-2.5">Content Node</th>
                <th className="px-3 py-2.5">Block &amp; Lang</th>
                <th className="px-3 py-2.5">Audio File &amp; Supabase ID</th>
                <th className="px-3 py-2.5">Sync &amp; Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contentAudioMetadata.map((item) => {
                const playKey = `node-audio-${item.id}`;
                const isPlaying = playingTrackId === playKey;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => togglePlayDirectUrl(playKey, item.audioUrl)}
                        aria-label={
                          isPlaying
                            ? `Stop ${item.contentNodeNumber} ${item.blockRole}`
                            : `Play ${item.contentNodeNumber} ${item.blockRole}`
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-lg transition cursor-pointer ${
                          isPlaying
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-500 hover:text-blue-700'
                        }`}
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-950">
                        {item.contentNodeNumber} — {item.contentNodeTitle}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.bookTitle} · {item.chapterTitle} ·{' '}
                        <span className="font-mono text-[10px]">node:{item.contentNodeId}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-800">{BLOCK_ROLE_LABELS[item.blockRole]}</p>
                      <p className="font-mono text-[10px] uppercase text-slate-500">
                        {item.language} · {item.contentNodeType}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-[11px] font-semibold text-slate-800">
                        {item.fileName} ({item.durationLabel} · {formatAudioFileSize(item.byteSize)})
                      </p>
                      <p className="font-mono text-[10px] text-blue-700">
                        content_audio_metadata/{item.id}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            item.status === 'published'
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                            item.firestoreSynced ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {item.firestoreSynced ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Supabase Synced
                            </>
                          ) : (
                            <>
                              <Cloud className="h-3 w-3" />
                              {isFirebaseSignedIn ? 'Linked' : 'Local Cache'}
                            </>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canApprove && item.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => void onUpdateContentAudioStatus(item.id, 'published', actor)}
                            className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                          >
                            Approve
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void onDeleteContentAudio(item.id, actor)}
                            aria-label={`Delete linked audio ${item.fileName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Chapter Audio Tracks Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <h2 className="font-display text-sm font-bold text-slate-950">Chapter Audio Tracks</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <th className="px-5 py-3">Play</th>
              <th className="px-3 py-3">Book &amp; Chapter</th>
              <th className="px-3 py-3">Lang</th>
              <th className="px-3 py-3">Narrator</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Review Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {audioTracks.map((track) => {
              const isPlaying = playingTrackId === track.id;
              return (
                <tr key={track.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => togglePlayTrack(track)}
                      aria-label={isPlaying ? `Stop ${track.chapterTitle}` : `Play ${track.chapterTitle}`}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition cursor-pointer ${
                        isPlaying
                          ? 'bg-[#2563EB] text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-500 hover:text-blue-700'
                      }`}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>
                  </td>
                  <td className="px-3 py-3.5">
                    <p className="font-semibold text-slate-950">{track.bookTitle}</p>
                    <p className="text-[11px] text-slate-500">{track.chapterTitle}</p>
                  </td>
                  <td className="px-3 py-3.5 font-mono uppercase text-slate-700">{track.language}</td>
                  <td className="px-3 py-3.5 text-slate-700">{track.narrator}</td>
                  <td className="px-3 py-3.5 font-mono tabular-nums text-slate-600">{track.durationLabel}</td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        track.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {track.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canApprove && track.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => onUpdateAudioStatus(track.id, 'published', actor)}
                        className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        Approve Audio
                      </button>
                    )}
                    {canApprove && track.status === 'published' && (
                      <span className="text-[11px] font-medium text-emerald-700">Live</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
