export type OttBookType = 'constitutional' | 'general_law' | 'biography';
export type BookStructureType = OttBookType;

export type OttUnitType = 'article' | 'section' | 'topic';
export type ContentUnitType = OttUnitType;
export type ContentNodeType = 'chapter' | 'article' | 'section' | 'topic';

export type OttPublicationStatus = 'draft' | 'in_review' | 'published' | 'archived';

export type OttAudioEntityType = 'edition' | 'chapter' | 'legal_unit' | 'content_node' | 'cms_clause';

export interface ContentNode {
  id: string;
  editionId: string;
  parentNodeId: string | null;
  nodeType: ContentNodeType;
  nodeOrder: number;
  nodeNumber: string;
  title: string;
  definition: string;
  purposeBackground: string;
  deepExplanation: string;
  practicalExamples: string;
  estimatedMinutes: number;
  overviewAudioUrl?: string;
  definitionAudioUrl?: string;
  purposeAudioUrl?: string;
  explanationAudioUrl?: string;
  examplesAudioUrl?: string;
  fullAudioUrl?: string;
  audioDurationSec: number;
  versionNumber: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OttAudioBlockRole =
  | 'book_description'
  | 'chapter_overview'
  | 'unit_definition'
  | 'unit_purpose'
  | 'unit_explanation'
  | 'unit_examples'
  | 'unit_full';

export interface OttLanguageOption {
  code: string;
  name: string;
  nativeName: string;
  speechLang: string;
  rtl?: boolean;
}

export const OTT_EDITION_LANGUAGES: readonly OttLanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', speechLang: 'en-US' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', speechLang: 'te-IN' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', speechLang: 'kn-IN' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', speechLang: 'ta-IN' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', speechLang: 'ml-IN' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', speechLang: 'hi-IN' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', speechLang: 'es-ES' },
  { code: 'fr', name: 'French', nativeName: 'Français', speechLang: 'fr-FR' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', speechLang: 'ar-SA', rtl: true },
];

export type OttGlossaryCategory =
  | 'Constitutional'
  | 'Judicial Remedy'
  | 'Civil & Tort'
  | 'Statutory & Civic'
  | 'Criminal & Procedure'
  | 'Human Rights';

export interface OttGlossaryTerm {
  id: string;
  term: string;
  aliases?: string[];
  category: OttGlossaryCategory;
  simpleDefinition: string;
  legalContext?: string;
  citation?: string;
  masterBookId: string;
  masterBookTitle: string;
}

export interface OttMasterBook {
  id: string;
  slug: string;
  bookType: OttBookType;
  canonicalTitle: string;
  jurisdiction: string;
  enactmentYear: string;
  coverImageUrl?: string;
  coverTone: 'cobalt' | 'sapphire' | 'slate' | 'emerald' | 'amber' | 'obsidian';
  glossaryTerms?: OttGlossaryTerm[];
  versionNumber: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OttMasterBookGlossaryResponse {
  matchedMasterBook: {
    id: string;
    slug: string;
    canonicalTitle: string;
    jurisdiction: string;
    enactmentYear: string;
    bookType: OttBookType;
  } | null;
  masterBooksCount: number;
  terms: OttGlossaryTerm[];
  serverTime: string;
}

export interface OttBookEdition {
  id: string;
  masterBookId: string;
  languageCode: string;
  languageName: string;
  nativeLanguageName: string;
  title: string;
  subtitle: string;
  description: string;
  descriptionAudioUrl?: string;
  coverImageUrl?: string;
  narratorName: string;
  status: OttPublicationStatus;
  versionNumber: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OttChapter {
  id: string;
  editionId: string;
  chapterOrder: number;
  chapterNumber: string;
  title: string;
  overviewDefinition: string;
  overviewAudioUrl?: string;
  estimatedMinutes: number;
  versionNumber: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OttLegalUnit {
  id: string;
  chapterId: string;
  editionId: string;
  unitType: OttUnitType;
  unitOrder: number;
  unitNumber: string;
  title: string;
  definition: string;
  purposeBackground: string;
  deepExplanation: string;
  practicalExamples: string;
  definitionAudioUrl?: string;
  purposeAudioUrl?: string;
  explanationAudioUrl?: string;
  examplesAudioUrl?: string;
  fullUnitAudioUrl?: string;
  audioDurationSec: number;
  versionNumber: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OttAudioAsset {
  id: string;
  entityType: OttAudioEntityType;
  entityId: string;
  blockRole: OttAudioBlockRole;
  originalFilename: string;
  s3Bucket?: string;
  s3Key?: string;
  storageUrl: string;
  publicUrl?: string;
  mimeType: string;
  byteSize: number;
  durationSec: number;
  sha256Checksum: string;
  uploadedByUid: string;
  createdAt: string;
}

export interface OttEditionSummary extends OttBookEdition {
  chapterCount: number;
  unitCount: number;
}

export interface OttMasterBookWithEditions extends OttMasterBook {
  editions: OttEditionSummary[];
}

export interface OttEditionDetailTree {
  masterBook: OttMasterBook;
  edition: OttBookEdition;
  siblingEditions: OttEditionSummary[];
  chapters: Array<OttChapter & { units: OttLegalUnit[] }>;
}

export interface OttDownloadedEditionManifest {
  editionId: string;
  masterBookId: string;
  editionVersion: number;
  chapterVersions: Record<string, number>;
  unitVersions: Record<string, number>;
  downloadedChapterIds?: string[]; // If omitted or empty, tracks entire edition
  lastSyncedAt: string;
  totalAudioBytes: number;
}

export interface OttDeltaSyncRequest {
  downloadedEditions: Array<{
    editionId: string;
    editionVersion: number;
    chapterVersions: Record<string, number>;
    unitVersions: Record<string, number>;
  }>;
}

export interface OttDeltaSyncEditionResult {
  editionId: string;
  masterBookId: string;
  editionTitle: string;
  languageName: string;
  upToDate: boolean;
  editionDeleted: boolean;
  latestEditionVersion: number;
  editionUpdated: boolean;
  edition?: OttBookEdition;
  addedChapters: OttChapter[];
  updatedChapters: OttChapter[];
  deletedChapterIds: string[];
  addedUnits: OttLegalUnit[];
  updatedUnits: OttLegalUnit[];
  deletedUnitIds: string[];
  audioUrlsToPrefetch: string[];
  syncedAt: string;
}

export interface OttDeltaSyncResponse {
  serverTime: string;
  results: OttDeltaSyncEditionResult[];
  totalAddedChapters: number;
  totalUpdatedChapters: number;
  totalAddedUnits: number;
  totalUpdatedUnits: number;
}

export interface OttRemoteChapterVersionEntry {
  id: string;
  versionNumber: number;
  isDeleted: boolean;
  updatedAt: string;
}

export interface OttRemoteUnitVersionEntry {
  id: string;
  chapterId: string;
  versionNumber: number;
  isDeleted: boolean;
  updatedAt: string;
}

export interface OttRemoteEditionVersionManifest {
  editionId: string;
  masterBookId: string;
  editionTitle: string;
  languageName: string;
  versionNumber: number;
  isDeleted: boolean;
  updatedAt: string;
  chapters: OttRemoteChapterVersionEntry[];
  units: OttRemoteUnitVersionEntry[];
}

export interface OttVersionManifestResponse {
  serverTime: string;
  editions: OttRemoteEditionVersionManifest[];
}

export interface OttEditionVersionDiff {
  editionId: string;
  editionTitle: string;
  languageName: string;
  localEditionVersion: number;
  remoteEditionVersion: number;
  editionDeleted: boolean;
  editionMetadataUpdated: boolean;
  newChapterIds: string[];
  updatedChapterIds: string[];
  deletedChapterIds: string[];
  newUnitIds: string[];
  updatedUnitIds: string[];
  deletedUnitIds: string[];
  needsSync: boolean;
}

export interface OttSyncEditionChangeSummary {
  editionId: string;
  masterBookId: string;
  editionTitle: string;
  languageName: string;
  previousEditionVersion: number;
  latestEditionVersion: number;
  editionDeleted: boolean;
  addedChapters: Array<{ id: string; chapterNumber: string; title: string; versionNumber: number }>;
  updatedChapters: Array<{ id: string; chapterNumber: string; title: string; versionNumber: number }>;
  deletedChapterIds: string[];
  addedUnits: Array<{ id: string; chapterId: string; unitNumber: string; title: string; versionNumber: number }>;
  updatedUnits: Array<{ id: string; chapterId: string; unitNumber: string; title: string; versionNumber: number }>;
  deletedUnitIds: string[];
  prefetchedAudioCount: number;
}

