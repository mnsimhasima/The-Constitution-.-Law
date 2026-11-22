import type {
  AudioTrackStatus,
  ContentAudioBlockRole,
  ContentAudioLanguageCode,
  ContentAudioMetadataRecord,
  ContentAudioNodeType,
  ContentAudioSource,
} from '../types/backend';
import type { ClauseAudioAttachment } from '../types/library';
import type { OttAudioBlockRole } from '../types/ott';

/**
 * Verbatim schema limits synchronized with firebase-blueprint.json (ContentAudioMetadata)
 * and firestore.rules (isValidContentAudioMetadata).
 */
export const CONTENT_AUDIO_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_CONTENT_AUDIO_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes
export const MAX_CONTENT_AUDIO_DURATION_SEC = 86400;

export const ALLOWED_CONTENT_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
] as const;

export const CONTENT_AUDIO_LANGUAGES: ReadonlyArray<{
  code: ContentAudioLanguageCode;
  label: string;
  nativeName: string;
}> = [
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'te', label: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'ml', label: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'es', label: 'Spanish', nativeName: 'Español' },
  { code: 'fr', label: 'French', nativeName: 'Français' },
  { code: 'ar', label: 'Arabic', nativeName: 'العربية' },
];

export const CLAUSE_AUDIO_BLOCKS: ReadonlyArray<{
  role: ContentAudioBlockRole;
  label: string;
  shortLabel: string;
  helper: string;
}> = [
  {
    role: 'full',
    label: 'Full Article / Section Narration',
    shortLabel: 'Full Narration',
    helper: 'Complete end-to-end audio recording for this article or section.',
  },
  {
    role: 'text',
    label: 'Primary Text / Statutory Definition Audio',
    shortLabel: 'Primary Text',
    helper: 'Exact constitutional article or statutory section wording.',
  },
  {
    role: 'explanation',
    label: 'Plain-Language Meaning / Deep Explanation Audio',
    shortLabel: 'Plain Meaning',
    helper: 'Citizen-friendly legal commentary and constitutional context.',
  },
  {
    role: 'example',
    label: 'Real-World / Case Example Audio',
    shortLabel: 'Real-World Example',
    helper: 'Practical scenario or Supreme Court / High Court illustration.',
  },
];

export const BLOCK_ROLE_LABELS: Record<ContentAudioBlockRole, string> = {
  full: 'Full Narration',
  text: 'Primary Text',
  definition: 'Definition',
  purpose: 'Purpose / Background',
  explanation: 'Plain Meaning / Explanation',
  example: 'Real-World / Case Example',
};

const VALID_SOURCES = new Set<ContentAudioSource>(['books_structures', 'cms_books', 'ott_catalog']);
const VALID_NODE_TYPES = new Set<ContentAudioNodeType>([
  'article',
  'section',
  'topic',
  'clause',
  'chapter',
  'edition',
]);
const VALID_BLOCK_ROLES = new Set<ContentAudioBlockRole>([
  'full',
  'text',
  'definition',
  'purpose',
  'explanation',
  'example',
]);
const VALID_LANGUAGES = new Set<ContentAudioLanguageCode>([
  'en',
  'te',
  'kn',
  'ta',
  'ml',
  'hi',
  'es',
  'fr',
  'ar',
]);
const VALID_STATUSES = new Set<AudioTrackStatus>(['draft', 'pending_review', 'published']);
const VALID_MIMES = new Set<string>(ALLOWED_CONTENT_AUDIO_MIMES);

export function inferContentNodeType(numberLabel: string): ContentAudioNodeType {
  const lower = numberLabel.trim().toLowerCase();
  if (lower.startsWith('art') || lower.includes('article') || lower.includes('अनुच्छेद') || lower.includes('ఆర్టికల్')) {
    return 'article';
  }
  if (lower.startsWith('sec') || lower.includes('section') || lower.includes('धारा') || lower.includes('సెక్షన్')) {
    return 'section';
  }
  if (lower.startsWith('topic') || lower.startsWith('sub') || lower.includes('topic')) {
    return 'topic';
  }
  if (lower.startsWith('ch') || lower.startsWith('part')) {
    return 'chapter';
  }
  return 'clause';
}

export function mapOttBlockRoleToContentRole(blockRole: OttAudioBlockRole): ContentAudioBlockRole {
  switch (blockRole) {
    case 'unit_definition':
      return 'definition';
    case 'unit_purpose':
      return 'purpose';
    case 'unit_explanation':
      return 'explanation';
    case 'unit_examples':
      return 'example';
    case 'unit_full':
    default:
      return 'full';
  }
}

export function sanitizeFirestoreDocId(raw: string, fallback = 'cam'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
  if (cleaned.length >= 1 && CONTENT_AUDIO_ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return fallback;
}

export function buildContentAudioDocId(
  contentSource: ContentAudioSource,
  contentNodeId: string,
  blockRole: ContentAudioBlockRole,
  language: ContentAudioLanguageCode
): string {
  const prefix =
    contentSource === 'books_structures'
      ? 'bs'
      : contentSource === 'ott_catalog'
        ? 'ott'
        : 'cms';
  const raw = `cam-${prefix}-${contentNodeId}-${blockRole}-${language}`;
  return sanitizeFirestoreDocId(raw, `cam-${Date.now().toString(36)}`);
}

export function formatAudioDurationLabel(seconds: number): string {
  const safeSec = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatAudioFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function normalizeAudioMimeType(mimeType: string, fileName?: string): string {
  const base = mimeType.trim().toLowerCase().split(';')[0] ?? '';
  if (VALID_MIMES.has(base)) return base;
  const lowerName = (fileName ?? '').trim().toLowerCase();
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.ogg')) return 'audio/ogg';
  if (lowerName.endsWith('.m4a') || lowerName.endsWith('.mp4')) return 'audio/mp4';
  if (lowerName.endsWith('.aac')) return 'audio/aac';
  if (lowerName.endsWith('.webm')) return 'audio/webm';
  return base;
}

export function validateContentAudioFile(file: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; normalizedMime: string; error?: string } {
  const normalizedMime = normalizeAudioMimeType(file.type, file.name);
  if (!VALID_MIMES.has(normalizedMime)) {
    return {
      valid: false,
      normalizedMime,
      error: 'Unsupported audio file format. Upload MP3, WAV, OGG, M4A, AAC, or WEBM.',
    };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      normalizedMime,
      error: 'Selected audio file is empty.',
    };
  }
  if (file.size > MAX_CONTENT_AUDIO_BYTES) {
    return {
      valid: false,
      normalizedMime,
      error: 'Audio file exceeds the 10 MB maximum size limit.',
    };
  }
  return { valid: true, normalizedMime };
}

function clampString(value: string, maxLength: number, fallback = ''): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback.slice(0, maxLength);
  return trimmed.slice(0, maxLength);
}

/**
 * Guarantees every field matches firebase-blueprint.json & firestore.rules verbatim
 * before persisting to Firestore or local state.
 */
export function sanitizeContentAudioMetadataRecord(
  input: Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'> & {
    createdAt?: string;
    updatedAt?: string;
    firestoreSynced?: boolean;
  }
): ContentAudioMetadataRecord {
  const nowIso = new Date().toISOString();
  const contentSource: ContentAudioSource = VALID_SOURCES.has(input.contentSource)
    ? input.contentSource
    : 'cms_books';
  const contentNodeType: ContentAudioNodeType = VALID_NODE_TYPES.has(input.contentNodeType)
    ? input.contentNodeType
    : inferContentNodeType(input.contentNodeNumber);
  const blockRole: ContentAudioBlockRole = VALID_BLOCK_ROLES.has(input.blockRole)
    ? input.blockRole
    : 'full';
  const language: ContentAudioLanguageCode = VALID_LANGUAGES.has(input.language)
    ? input.language
    : 'en';
  const status: AudioTrackStatus = VALID_STATUSES.has(input.status) ? input.status : 'draft';
  const normalizedMime = normalizeAudioMimeType(input.mimeType, input.fileName);
  const mimeType = VALID_MIMES.has(normalizedMime) ? normalizedMime : 'audio/wav';

  const contentNodeId = clampString(input.contentNodeId, 128, 'node');
  const id = sanitizeFirestoreDocId(
    input.id || buildContentAudioDocId(contentSource, contentNodeId, blockRole, language),
    buildContentAudioDocId(contentSource, contentNodeId, blockRole, language)
  );
  const uploadedByUid = sanitizeFirestoreDocId(input.uploadedByUid || 'cms-admin', 'cms-admin');

  const byteSize = Math.min(
    MAX_CONTENT_AUDIO_BYTES,
    Math.max(1, Math.round(Number.isFinite(input.byteSize) ? input.byteSize : 1))
  );
  const durationSec = Math.min(
    MAX_CONTENT_AUDIO_DURATION_SEC,
    Math.max(0, Math.round(Number.isFinite(input.durationSec) ? input.durationSec : 0))
  );
  const durationLabel = clampString(
    input.durationLabel || formatAudioDurationLabel(durationSec),
    32,
    '00:00'
  );

  return {
    id,
    contentSource,
    bookId: clampString(input.bookId, 128, 'unknown-book'),
    bookTitle: clampString(input.bookTitle, 160, 'Untitled Book'),
    editionId: clampString(input.editionId ?? '', 128, ''),
    chapterId: clampString(input.chapterId, 128, 'chapter-1'),
    chapterTitle: clampString(input.chapterTitle, 160, 'Chapter'),
    contentNodeId,
    contentNodeType,
    contentNodeNumber: clampString(input.contentNodeNumber, 60, 'Clause'),
    contentNodeTitle: clampString(input.contentNodeTitle, 160, input.contentNodeNumber || 'Untitled Node'),
    blockRole,
    language,
    narrator: clampString(input.narrator, 120, 'Studio Narrator'),
    fileName: clampString(input.fileName, 200, 'audio.wav'),
    mimeType,
    byteSize,
    durationSec,
    durationLabel,
    audioUrl: clampString(input.audioUrl, 500, '/api/books-structures/audio/missing'),
    assetId: clampString(input.assetId ?? '', 128, ''),
    sha256Checksum: clampString(input.sha256Checksum ?? '', 128, ''),
    status,
    uploadedByUid,
    uploadedByEmail: clampString(input.uploadedByEmail ?? '', 180, ''),
    createdAt: input.createdAt ?? nowIso,
    updatedAt: input.updatedAt ?? nowIso,
    firestoreSynced: input.firestoreSynced,
  };
}

export function buildClauseAudioAttachment(
  record: ContentAudioMetadataRecord
): ClauseAudioAttachment {
  return {
    audioMetadataId: record.id,
    assetId: record.assetId,
    audioUrl: record.audioUrl,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    durationSec: record.durationSec,
    durationLabel: record.durationLabel,
    language: record.language,
    narrator: record.narrator,
    blockRole: record.blockRole,
    updatedAt: record.updatedAt,
  };
}

export function findAudioMetadataForNode(
  records: ReadonlyArray<ContentAudioMetadataRecord>,
  contentNodeId: string,
  options?: {
    blockRole?: ContentAudioBlockRole;
    language?: ContentAudioLanguageCode;
    contentSource?: ContentAudioSource;
  }
): ContentAudioMetadataRecord[] {
  return records.filter((rec) => {
    if (rec.contentNodeId !== contentNodeId) return false;
    if (options?.blockRole && rec.blockRole !== options.blockRole) return false;
    if (options?.language && rec.language !== options.language) return false;
    if (options?.contentSource && rec.contentSource !== options.contentSource) return false;
    return true;
  });
}
