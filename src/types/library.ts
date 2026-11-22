export type LanguageCode = 'en' | 'te' | 'hi' | 'es' | 'fr' | 'ar';

export interface LanguageOption {
  code: LanguageCode;
  shortCode: string;
  label: string;
  nativeName: string;
  speechLang: string;
  rtl?: boolean;
}

export type LocalizedText = Partial<Record<LanguageCode, string>> & {
  en: string;
};

export type BookCategory = 'constitutions' | 'history' | 'statutory' | 'international' | 'custom';

export type ClauseAudioBlockRole =
  | 'full'
  | 'text'
  | 'definition'
  | 'purpose'
  | 'explanation'
  | 'example';

export interface ClauseAudioAttachment {
  audioMetadataId: string;
  assetId: string;
  audioUrl: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSec: number;
  durationLabel: string;
  language: string;
  narrator: string;
  blockRole: ClauseAudioBlockRole;
  updatedAt: string;
}

export interface Clause {
  id: string;
  number: string;
  heading?: LocalizedText;
  principle: LocalizedText;
  text: LocalizedText;
  explanation: LocalizedText;
  realWorldExample: LocalizedText;
  audioAttachments?: Partial<Record<ClauseAudioBlockRole, ClauseAudioAttachment>>;
}

export interface Chapter {
  id: string;
  number: string;
  title: LocalizedText;
  summary: LocalizedText;
  overviewAudioUrl?: string;
  estimatedMinutes: number;
  versionNumber?: number;
  updatedAt?: string;
  isDeleted?: boolean;
  clauses: Clause[];
}

export interface LawBook {
  id: string;
  shortTitle: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  jurisdiction: string;
  year: string;
  category: BookCategory;
  bookType?: 'constitutional' | 'general_law' | 'biography';
  masterBookId?: string;
  editionId?: string;
  descriptionAudioUrl?: string;
  versionNumber?: number;
  updatedAt?: string;
  isDeleted?: boolean;
  coverImage?: string;
  coverTone: 'cobalt' | 'sapphire' | 'slate' | 'emerald' | 'amber' | 'obsidian';
  isUserAdded?: boolean;
  chapters: Chapter[];
}

export interface PlanDay {
  id: string;
  dayNumber: number;
  title: LocalizedText;
  reflection: LocalizedText;
  bookId: string;
  chapterId: string;
  clauseId: string;
  durationMinutes: number;
}

export interface ReadingPlan {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  category: string;
  totalDays: number;
  coverTone: LawBook['coverTone'];
  days: PlanDay[];
}

export type HighlightColor = 'amber' | 'sage' | 'sky' | 'rose' | 'lilac';

export interface ClauseHighlight {
  clauseKey: string;
  bookId: string;
  chapterId: string;
  clauseId: string;
  color: HighlightColor;
  updatedAt: string;
}

export interface ClauseBookmark {
  clauseKey: string;
  bookId: string;
  chapterId: string;
  clauseId: string;
  createdAt: string;
}

export interface ClauseNote {
  id: string;
  clauseKey: string;
  bookId: string;
  chapterId: string;
  clauseId: string;
  content: string;
  updatedAt: string;
}

export type AudioMode = 'text' | 'explanation' | 'both';
export type ReaderTheme = 'light' | 'warm' | 'dark';
export type ReaderFontFace = 'sans' | 'display';
export type ReaderFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type AppTab = 'home' | 'read' | 'library' | 'plans' | 'profile';
export type StudioSubTab = 'today' | 'community';
export type SettingsSection = 'account' | 'general' | 'language' | 'read' | 'colors';

export interface DailyConstitutionTask {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  durationLabel: string;
  bookId: string;
  chapterId: string;
  clauseId?: string;
}

export interface LegalReel {
  id: string;
  tag: string;
  title: LocalizedText;
  caption: LocalizedText;
  duration: string;
  bookId: string;
  chapterId: string;
  clauseId: string;
  tone: string;
}

export interface CivicEvent {
  id: string;
  dateLabel: string;
  timeLabel: string;
  title: LocalizedText;
  host: string;
  attendees: number;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorInitials: string;
  authorTone: string;
  timeAgo: string;
  tag: string;
  content: LocalizedText;
  bookId: string;
  chapterId: string;
  clauseId?: string;
  baseLikes: number;
}

export interface GeneralSettings {
  dailyReminders: boolean;
  audioAutoAdvance: boolean;
  friendActivityAlerts: boolean;
  offlineAudioCache: boolean;
}

export interface ActivityItem {
  id: string;
  kind: 'read' | 'audio' | 'highlight' | 'note' | 'save' | 'social' | 'plan' | 'donate';
  title: string;
  detail: string;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  unread: boolean;
  targetTab?: AppTab;
}

export interface CommunityPerson {
  id: string;
  name: string;
  handle: string;
  role: string;
  focus: string;
  initials: string;
  tone: string;
  isFriendSuggested?: boolean;
}

export interface ReaderPreferences {
  language: LanguageCode;
  compareLanguage: LanguageCode;
  showInlineExplanations: boolean;
  showParallelLanguage: boolean;
  readerTheme: ReaderTheme;
  appDarkMode: boolean;
  fontSize: ReaderFontSize;
  fontFace: ReaderFontFace;
  audioSpeed: number;
  audioMode: AudioMode;
}

export interface ReadingPosition {
  bookId: string;
  chapterId: string;
  clauseId?: string;
}

export type AudioSegmentKind = 'header' | 'headline' | 'text' | 'explanation';
export type AudioVoiceName = 'manual' | 'Kore' | 'Charon' | 'Puck' | 'Fenrir' | 'Zephyr';

export interface AudioSegment {
  id: string;
  clauseId: string;
  clauseNumber: string;
  headline: string;
  kind: AudioSegmentKind;
  spokenText: string;
  /** Strictly linked 1-to-1 manually uploaded audio file URL from Books & Structures */
  audioUrl?: string;
  estimatedSeconds: number;
  orderIndex?: number;
  domTargetId?: string;
}

export interface NewBookFormInput {
  title: string;
  shortTitle: string;
  jurisdiction: string;
  year: string;
  category: BookCategory;
  chapterTitle: string;
  clauseNumber: string;
  principle: string;
  clauseTextEn: string;
  explanationEn: string;
  realWorldExampleEn: string;
  clauseTextTe?: string;
  explanationTe?: string;
  clauseTextHi?: string;
  explanationHi?: string;
  clauseTextEs?: string;
  explanationEs?: string;
  clauseTextFr?: string;
  explanationFr?: string;
  clauseTextAr?: string;
  explanationAr?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof NewBookFormInput, string>>;
}

export interface CachedAudioBlobRecord {
  cacheKey: string;
  chapterCacheKey: string;
  bookId: string;
  chapterId: string;
  segmentId: string;
  language: LanguageCode;
  voiceName: AudioVoiceName;
  mimeType: string;
  byteSize: number;
  blob: Blob;
  cachedAt: string;
}

export interface CachedChapterSummary {
  chapterCacheKey: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterNumber: string;
  chapterTitle: string;
  language: LanguageCode;
  voiceName: AudioVoiceName;
  mode: AudioMode;
  segmentKeys: string[];
  segmentCount: number;
  totalBytes: number;
  cachedAt: string;
}

export type ChapterCacheStatus = 'idle' | 'caching' | 'cached' | 'error';

export interface ChapterCacheProgress {
  chapterCacheKey: string;
  status: ChapterCacheStatus;
  completedSegments: number;
  totalSegments: number;
  errorMessage?: string | null;
}

