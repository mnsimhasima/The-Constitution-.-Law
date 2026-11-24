import {
  CheckCircle2,
  Cloud,
  Database,
  FileAudio,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  CmsBook,
  ContentAudioBlockRole,
  ContentAudioLanguageCode,
  ContentAudioMetadataRecord,
  StaffRole,
} from '../../types/backend';
import type { Chapter, Clause } from '../../types/library';
import type { OttAudioBlockRole } from '../../types/ott';
import {
  buildContentAudioDocId,
  CLAUSE_AUDIO_BLOCKS,
  CONTENT_AUDIO_LANGUAGES,
  findAudioMetadataForNode,
  formatAudioFileSize,
  inferContentNodeType,
} from '../../utils/contentAudioMetadata';
import {
  type UploadedContentAudioResult,
  uploadAudioFileForContentNode,
} from '../../utils/contentAudioUploadClient';

export type DraftClauseAudioMap = Partial<Record<ContentAudioBlockRole, UploadedContentAudioResult>>;

function toOttBlockRole(role: ContentAudioBlockRole): OttAudioBlockRole {
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

interface ExistingClauseAudioPanelProps {
  book: CmsBook;
  chapter: Chapter;
  clause: Clause;
  canEdit: boolean;
  activeRole: StaffRole;
  actor: StaffActor;
  isFirebaseSignedIn: boolean;
  contentAudioMetadata: ContentAudioMetadataRecord[];
  onUpsertContentAudio: (
    input: Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'>,
    actor: StaffActor
  ) => Promise<{ record: ContentAudioMetadataRecord; firestoreSynced: boolean; error?: string }>;
  onDeleteContentAudio: (audioId: string, actor: StaffActor) => Promise<void>;
  onFeedback: (message: string) => void;
}

export function ExistingClauseAudioPanel({
  book,
  chapter,
  clause,
  canEdit,
  activeRole,
  actor,
  isFirebaseSignedIn,
  contentAudioMetadata,
  onUpsertContentAudio,
  onDeleteContentAudio,
  onFeedback,
}: ExistingClauseAudioPanelProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<ContentAudioLanguageCode>('en');
  const [uploadingRole, setUploadingRole] = useState<ContentAudioBlockRole | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const nodeType = inferContentNodeType(clause.number);
  const nodeRecordsAllLangs = findAudioMetadataForNode(contentAudioMetadata, clause.id, {
    contentSource: 'cms_books',
  });

  const handleFileUpload = async (role: ContentAudioBlockRole, file: File) => {
    if (!canEdit) return;
    setUploadingRole(role);
    setLocalError(null);
    try {
      const uploaded = await uploadAudioFileForContentNode({
        file,
        entityType: 'cms_clause',
        entityId: clause.id,
        blockRole: toOttBlockRole(role),
        uploadedByUid: actor.uid,
      });

      const docId = buildContentAudioDocId('cms_books', clause.id, role, selectedLanguage);
      const result = await onUpsertContentAudio(
        {
          id: docId,
          contentSource: 'cms_books',
          bookId: book.id,
          bookTitle: book.shortTitle,
          editionId: '',
          chapterId: chapter.id,
          chapterTitle: chapter.title.en,
          contentNodeId: clause.id,
          contentNodeType: nodeType,
          contentNodeNumber: clause.number,
          contentNodeTitle: clause.principle.en || clause.number,
          blockRole: role,
          language: selectedLanguage,
          narrator: actor.email || 'Studio Narrator',
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
        },
        actor
      );

      if (result.error) {
        setLocalError(`Audio saved locally, but Supabase sync returned: ${result.error}`);
      } else {
        const syncNote = result.firestoreSynced
          ? `Stored in Supabase DB + S3 at content_audio_metadata/${result.record.id}`
          : `Linked to node ${clause.id} (content_audio_metadata/${result.record.id})`;
        onFeedback(`Uploaded "${uploaded.fileName}" for ${clause.number} (${role}). ${syncNote}.`);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to upload audio file.');
    } finally {
      setUploadingRole(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-2">
          <FileAudio className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-800">
            Audio Files for {clause.number}
          </span>
          <span className="font-mono text-[10px] font-semibold text-slate-500">
            ({nodeRecordsAllLangs.length} linked · node: {clause.id})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor={`audio-lang-${clause.id}`}
            className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500"
          >
            Audio Lang:
          </label>
          <select
            id={`audio-lang-${clause.id}`}
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as ContentAudioLanguageCode)}
            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-800 outline-none focus:border-blue-600"
          >
            {CONTENT_AUDIO_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label} ({lang.code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {localError && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {localError}
        </p>
      )}

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {CLAUSE_AUDIO_BLOCKS.map((block) => {
          const matchingRecord = findAudioMetadataForNode(contentAudioMetadata, clause.id, {
            blockRole: block.role,
            language: selectedLanguage,
            contentSource: 'cms_books',
          })[0];
          const fallbackAttachment =
            !matchingRecord &&
            clause.audioAttachments?.[block.role]?.language === selectedLanguage
              ? clause.audioAttachments[block.role]
              : undefined;

          const activeAudioUrl = matchingRecord?.audioUrl ?? fallbackAttachment?.audioUrl;
          const activeFileName = matchingRecord?.fileName ?? fallbackAttachment?.fileName;
          const activeDuration = matchingRecord?.durationLabel ?? fallbackAttachment?.durationLabel;
          const activeSize = matchingRecord?.byteSize ?? fallbackAttachment?.byteSize ?? 0;
          const activeDocId = matchingRecord?.id ?? fallbackAttachment?.audioMetadataId;
          const isSynced = matchingRecord?.firestoreSynced ?? false;
          const isUploading = uploadingRole === block.role;

          return (
            <div
              key={block.role}
              className="rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-900">{block.shortLabel}</p>

                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <label
                      aria-label={`${activeAudioUrl ? 'Replace' : 'Upload'} ${block.shortLabel} audio for ${clause.number}`}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 text-[10px] font-semibold text-slate-700 transition ${
                        isUploading
                          ? 'cursor-wait opacity-60'
                          : 'cursor-pointer hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      {isUploading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      <span>{isUploading ? 'Uploading' : activeAudioUrl ? 'Replace' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/webm"
                        disabled={isUploading}
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleFileUpload(block.role, file);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>

                    {activeDocId && (
                      <button
                        type="button"
                        onClick={() => void onDeleteContentAudio(activeDocId, actor)}
                        aria-label={`Remove ${block.shortLabel} audio for ${clause.number}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {activeFileName ? (
                <p className="mt-1 truncate font-mono text-[10px] text-slate-600" title={`${activeFileName} · ${activeDuration} · ${formatAudioFileSize(activeSize)}`}>
                  {activeFileName} · {activeDuration} · {formatAudioFileSize(activeSize)}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-slate-400">No audio uploaded yet</p>
              )}

              {activeAudioUrl && (
                <div className="mt-2 space-y-1.5">
                  <audio
                    controls
                    preload="metadata"
                    src={activeAudioUrl}
                    className="h-7 w-full"
                  />
                  {activeDocId && (
                    <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1 truncate">
                        <Database className="h-2.5 w-2.5 shrink-0 text-blue-600" />
                        <span className="truncate">content_audio_metadata/{activeDocId}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-sans text-[10px] font-semibold ${
                          isSynced ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {isSynced ? (
                          <>
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Supabase Synced
                          </>
                        ) : (
                          <>
                            <Cloud className="h-2.5 w-2.5" />
                            {isFirebaseSignedIn ? 'Linked' : 'Local Cache'}
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DraftClauseAudioUploadsProps {
  clauseNumberLabel: string;
  draftLanguage: ContentAudioLanguageCode;
  draftNarrator: string;
  draftAudioMap: DraftClauseAudioMap;
  uploadingRole: ContentAudioBlockRole | null;
  errorText: string | null;
  onChangeLanguage: (lang: ContentAudioLanguageCode) => void;
  onChangeNarrator: (narrator: string) => void;
  onUploadDraftAudio: (role: ContentAudioBlockRole, file: File) => Promise<void>;
  onRemoveDraftAudio: (role: ContentAudioBlockRole) => void;
}

export function DraftClauseAudioUploads({
  clauseNumberLabel,
  draftLanguage,
  draftNarrator,
  draftAudioMap,
  uploadingRole,
  errorText,
  onChangeLanguage,
  onChangeNarrator,
  onUploadDraftAudio,
  onRemoveDraftAudio,
}: DraftClauseAudioUploadsProps) {
  const displayNode = clauseNumberLabel.trim() || 'New Article / Section';

  return (
    <div className="rounded-lg border border-blue-200/80 bg-blue-50/40 p-3.5">
      <div className="flex items-center gap-2">
        <FileAudio className="h-4 w-4 text-blue-600" />
        <div>
          <p className="text-xs font-bold text-slate-900">
            Dedicated Audio Files for {displayNode}
          </p>
          <p className="text-[11px] text-slate-600">
            Audio files upload to Supabase S3 and metadata is stored in Supabase PostgreSQL (<span className="font-mono">content_audio_metadata</span>).
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="draft-clause-audio-lang"
            className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600"
          >
            Audio Language
          </label>
          <select
            id="draft-clause-audio-lang"
            value={draftLanguage}
            onChange={(e) => onChangeLanguage(e.target.value as ContentAudioLanguageCode)}
            className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-600"
          >
            {CONTENT_AUDIO_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="draft-clause-audio-narrator"
            className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600"
          >
            Narrator / Studio Voice
          </label>
          <input
            id="draft-clause-audio-narrator"
            value={draftNarrator}
            onChange={(e) => onChangeNarrator(e.target.value)}
            placeholder="e.g. Legal Audio Studio"
            className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {errorText && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {errorText}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {CLAUSE_AUDIO_BLOCKS.map((block) => {
          const uploaded = draftAudioMap[block.role];
          const isUploading = uploadingRole === block.role;
          return (
            <div
              key={block.role}
              className="rounded-md border border-slate-200 bg-white p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-900">{block.label}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {uploaded
                      ? `${uploaded.fileName} · ${uploaded.durationLabel} · ${formatAudioFileSize(uploaded.byteSize)}`
                      : block.helper}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <label
                    aria-label={`Upload ${block.shortLabel} audio for new article or section`}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 transition ${
                      isUploading
                        ? 'cursor-wait opacity-60'
                        : 'cursor-pointer hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    <span>{isUploading ? 'Uploading' : uploaded ? 'Replace' : 'Upload File'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/webm"
                      disabled={isUploading}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void onUploadDraftAudio(block.role, file);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {uploaded && (
                    <button
                      type="button"
                      onClick={() => onRemoveDraftAudio(block.role)}
                      aria-label={`Clear staged ${block.shortLabel} audio`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              {uploaded && (
                <audio
                  controls
                  preload="metadata"
                  src={uploaded.audioUrl}
                  className="mt-2 h-7 w-full"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
