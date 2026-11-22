import type { BookCategory, Chapter, LanguageCode, LawBook, LocalizedText } from './library';

export type StaffRole = 'admin' | 'editor' | 'reviewer' | 'security';
export type AccountRole = StaffRole | 'user';

export type CmsBookStatus = 'draft' | 'pending_review' | 'published' | 'changes_requested';
export type AudioTrackStatus = 'draft' | 'pending_review' | 'published';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketCategory = 'auth' | 'audio' | 'sync' | 'content' | 'bug' | 'other';
export type AccountStatus = 'active' | 'flagged' | 'suspended';

export type AdminSectionId =
  | 'overview'
  | 'books'
  | 'verses'
  | 'audio'
  | 'bulk-import'
  | 'review-queue'
  | 'users-roles'
  | 'security-support'
  | 'community-mod'
  | 'edit-log'
  | 'sources-rights'
  | 'settings';

export interface CmsBook {
  id: string;
  shortTitle: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  jurisdiction: string;
  year: string;
  category: Exclude<BookCategory, 'custom'>;
  coverTone: LawBook['coverTone'];
  coverImage?: string;
  status: CmsBookStatus;
  sourceAttribution: string;
  rightsLicense: string;
  chapters: Chapter[];
  versionNumber?: number;
  isDeleted?: boolean;
  createdByUid: string;
  createdByEmail: string;
  reviewedByEmail: string;
  reviewNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTrackRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  language: LanguageCode;
  narrator: string;
  durationLabel: string;
  audioUrl: string;
  status: AudioTrackStatus;
  uploadedByUid: string;
  uploadedByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export type ContentAudioSource = 'books_structures' | 'cms_books' | 'ott_catalog';
export type ContentAudioNodeType = 'article' | 'section' | 'topic' | 'clause' | 'chapter' | 'edition';
export type ContentAudioBlockRole =
  | 'full'
  | 'text'
  | 'definition'
  | 'purpose'
  | 'explanation'
  | 'example';
export type ContentAudioLanguageCode =
  | 'en'
  | 'te'
  | 'kn'
  | 'ta'
  | 'ml'
  | 'hi'
  | 'es'
  | 'fr'
  | 'ar';

export interface ContentAudioMetadataRecord {
  id: string;
  contentSource: ContentAudioSource;
  bookId: string;
  bookTitle: string;
  editionId: string;
  chapterId: string;
  chapterTitle: string;
  contentNodeId: string;
  contentNodeType: ContentAudioNodeType;
  contentNodeNumber: string;
  contentNodeTitle: string;
  blockRole: ContentAudioBlockRole;
  language: ContentAudioLanguageCode;
  narrator: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSec: number;
  durationLabel: string;
  audioUrl: string;
  assetId: string;
  sha256Checksum: string;
  status: AudioTrackStatus;
  uploadedByUid: string;
  uploadedByEmail: string;
  createdAt: string;
  updatedAt: string;
  firestoreSynced?: boolean;
}

export interface StaffRoleRecord {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  assignedBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDirectoryRecord {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  provider: string;
  role: AccountRole;
  status: AccountStatus;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationCommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorInitials: string;
  authorTone: string;
  tag: string;
  content: string;
  bookId: string;
  chapterId: string;
  likesCount: number;
  moderationStatus: 'approved' | 'removed';
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string;
  resolutionNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: StaffRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface SourceRightRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  sourceName: string;
  licenseType: string;
  jurisdiction: string;
  citationUrl: string;
  verified: boolean;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingsRecord {
  requireReviewBeforePublish: boolean;
  strictCommunityModeration: boolean;
  allowCsvImport: boolean;
  allowJsonImport: boolean;
  allowExcelImport: boolean;
  defaultLanguage: LanguageCode;
  updatedBy: string;
  updatedAt: string;
}

export interface BulkImportParseResult {
  books: CmsBook[];
  errors: string[];
  warnings: string[];
  rowCount: number;
}

export interface CommunityModerationResponse {
  allowed: boolean;
  containsProfanity: boolean;
  isRelatedToCommunity: boolean;
  errorMessage?: string;
  reason?: string;
}
