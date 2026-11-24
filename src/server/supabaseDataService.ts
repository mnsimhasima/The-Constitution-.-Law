import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AccountRole,
  AccountStatus,
  AudioTrackRecord,
  AudioTrackStatus,
  AuditLogEntry,
  CmsBook,
  CmsBookStatus,
  ContentAudioMetadataRecord,
  ModerationCommunityPost,
  SourceRightRecord,
  StaffRoleRecord,
  SupportTicket,
  SystemSettingsRecord,
  TicketPriority,
  TicketStatus,
  UserDirectoryRecord,
} from '../types/backend.ts';
import type {
  BookCategory,
  ClauseBookmark,
  ClauseHighlight,
  ClauseNote,
  HighlightColor,
  LanguageCode,
  LawBook,
} from '../types/library.ts';
import { getSupabaseAdmin } from './supabaseClient.ts';

export interface CmsBootstrapPayload {
  cmsBooks: CmsBook[];
  audioTracks: AudioTrackRecord[];
  contentAudioMetadata: ContentAudioMetadataRecord[];
  staffRoles: StaffRoleRecord[];
  userDirectory: UserDirectoryRecord[];
  communityPosts: ModerationCommunityPost[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  sourcesRights: SourceRightRecord[];
  systemSettings: SystemSettingsRecord | null;
}

export interface UserCloudProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  preferredLanguage: LanguageCode;
  streakDays: number;
  audioMinutes: number;
  startedPlanIds: string[];
  completedPlanDayIds: string[];
  readChapterIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserAnnotationPayload {
  id: string;
  ownerId: string;
  clauseKey: string;
  bookId: string;
  chapterId: string;
  clauseId: string;
  kind: 'highlight' | 'bookmark';
  color: HighlightColor | 'none';
  createdAt: string;
  updatedAt: string;
}

export interface UserCustomBookRow {
  id: string;
  ownerId: string;
  shortTitle: string;
  titleEn: string;
  jurisdiction: string;
  year: string;
  category: BookCategory;
  chapterTitleEn: string;
  clauseNumber: string;
  principleEn: string;
  clauseTextEn: string;
  explanationEn: string;
  clauseTextTe: string;
  explanationTe: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCloudStatePayload {
  profile: UserCloudProfileRecord | null;
  notes: ClauseNote[];
  highlights: Record<string, ClauseHighlight>;
  bookmarks: Record<string, ClauseBookmark>;
  customBooks: UserCustomBookRow[];
}

interface LocalFallbackDb {
  cmsBooks: CmsBook[];
  audioTracks: AudioTrackRecord[];
  contentAudioMetadata: ContentAudioMetadataRecord[];
  staffRoles: StaffRoleRecord[];
  userDirectory: UserDirectoryRecord[];
  communityPosts: ModerationCommunityPost[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  sourcesRights: SourceRightRecord[];
  systemSettings: SystemSettingsRecord | null;
  userProfiles: Record<string, UserCloudProfileRecord>;
  userNotes: Record<string, ClauseNote[]>;
  userAnnotations: Record<string, UserAnnotationPayload[]>;
  userCustomBooks: Record<string, UserCustomBookRow[]>;
}

const EMPTY_FALLBACK: LocalFallbackDb = {
  cmsBooks: [],
  audioTracks: [],
  contentAudioMetadata: [],
  staffRoles: [],
  userDirectory: [],
  communityPosts: [],
  supportTickets: [],
  auditLogs: [],
  sourcesRights: [],
  systemSettings: null,
  userProfiles: {},
  userNotes: {},
  userAnnotations: {},
  userCustomBooks: {},
};

export function isValidRecordId(id: string): boolean {
  return /^[a-zA-Z0-9._:@-]{1,160}$/.test(id);
}

function isoOrNow(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : new Date().toISOString();
}

export class SupabaseDataService {
  private readonly fallbackFilePath: string;
  private readonly forceLocalFallback: boolean;
  private localCache: LocalFallbackDb | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options?: { fallbackFilePath?: string; forceLocalFallback?: boolean }) {
    this.fallbackFilePath =
      options?.fallbackFilePath ?? path.resolve(process.cwd(), 'data', 'supabase-cms-fallback.json');
    this.forceLocalFallback = Boolean(options?.forceLocalFallback);
  }

  private getClient() {
    if (this.forceLocalFallback) return null;
    return getSupabaseAdmin();
  }

  private async loadLocal(): Promise<LocalFallbackDb> {
    if (this.localCache) return this.localCache;
    try {
      const raw = await fs.readFile(this.fallbackFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LocalFallbackDb>;
      this.localCache = {
        ...EMPTY_FALLBACK,
        ...parsed,
        userProfiles: parsed.userProfiles ?? {},
        userNotes: parsed.userNotes ?? {},
        userAnnotations: parsed.userAnnotations ?? {},
        userCustomBooks: parsed.userCustomBooks ?? {},
      };
    } catch {
      this.localCache = structuredClone(EMPTY_FALLBACK);
    }
    return this.localCache;
  }

  private async saveLocal(): Promise<void> {
    if (!this.localCache) return;
    const payload = JSON.stringify(this.localCache, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.fallbackFilePath), { recursive: true });
      const tmp = `${this.fallbackFilePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.writeFile(tmp, payload, 'utf-8');
      await fs.rename(tmp, this.fallbackFilePath);
    });
    await this.writeChain;
  }

  // =========================================================================
  // CMS BOOTSTRAP & OPERATIONS (Supabase PostgreSQL tables)
  // =========================================================================

  async getCmsBootstrap(): Promise<CmsBootstrapPayload> {
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      return {
        cmsBooks: local.cmsBooks,
        audioTracks: local.audioTracks,
        contentAudioMetadata: local.contentAudioMetadata,
        staffRoles: local.staffRoles,
        userDirectory: local.userDirectory,
        communityPosts: local.communityPosts,
        supportTickets: local.supportTickets,
        auditLogs: local.auditLogs,
        sourcesRights: local.sourcesRights,
        systemSettings: local.systemSettings,
      };
    }

    const [
      booksRes,
      tracksRes,
      audioMetaRes,
      rolesRes,
      usersRes,
      postsRes,
      ticketsRes,
      logsRes,
      rightsRes,
      settingsRes,
    ] = await Promise.all([
      supabase.from('cms_books').select('*').order('updated_at', { ascending: false }),
      supabase.from('audio_tracks').select('*').order('updated_at', { ascending: false }),
      supabase.from('content_audio_metadata').select('*').order('updated_at', { ascending: false }),
      supabase.from('staff_roles').select('*').order('updated_at', { ascending: false }),
      supabase.from('user_directory').select('*').order('last_login_at', { ascending: false }),
      supabase.from('community_posts').select('*').order('created_at', { ascending: false }),
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('sources_rights').select('*').order('updated_at', { ascending: false }),
      supabase.from('system_settings').select('*').eq('id', 'global').maybeSingle(),
    ]);

    const cmsBooks: CmsBook[] = (booksRes.data ?? []).map((r) => ({
      id: r.id,
      shortTitle: r.short_title,
      title: r.title ?? { en: r.short_title },
      subtitle: r.subtitle ?? { en: '' },
      jurisdiction: r.jurisdiction,
      year: r.year,
      category: r.category,
      coverTone: r.cover_tone,
      ...(r.cover_image ? { coverImage: r.cover_image } : {}),
      status: r.status,
      sourceAttribution: r.source_attribution,
      rightsLicense: r.rights_license,
      chapters: Array.isArray(r.chapters) ? r.chapters : [],
      createdByUid: r.created_by_uid,
      createdByEmail: r.created_by_email,
      reviewedByEmail: r.reviewed_by_email ?? '',
      reviewNotes: r.review_notes ?? '',
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const audioTracks: AudioTrackRecord[] = (tracksRes.data ?? []).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      bookTitle: r.book_title,
      chapterId: r.chapter_id,
      chapterTitle: r.chapter_title,
      language: r.language,
      narrator: r.narrator,
      durationLabel: r.duration_label,
      audioUrl: r.audio_url ?? '',
      status: r.status,
      uploadedByUid: r.uploaded_by_uid,
      uploadedByEmail: r.uploaded_by_email,
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const contentAudioMetadata: ContentAudioMetadataRecord[] = (audioMetaRes.data ?? []).map((r) => ({
      id: r.id,
      contentSource: r.content_source,
      bookId: r.book_id,
      bookTitle: r.book_title,
      editionId: r.edition_id ?? '',
      chapterId: r.chapter_id,
      chapterTitle: r.chapter_title,
      contentNodeId: r.content_node_id,
      contentNodeType: r.content_node_type,
      contentNodeNumber: r.content_node_number,
      contentNodeTitle: r.content_node_title,
      blockRole: r.block_role,
      language: r.language,
      narrator: r.narrator,
      fileName: r.file_name,
      mimeType: r.mime_type,
      byteSize: Number(r.byte_size ?? 0),
      durationSec: Number(r.duration_sec ?? 0),
      durationLabel: r.duration_label,
      audioUrl: r.audio_url,
      assetId: r.asset_id ?? '',
      sha256Checksum: r.sha256_checksum ?? '',
      status: r.status,
      uploadedByUid: r.uploaded_by_uid,
      uploadedByEmail: r.uploaded_by_email,
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
      firestoreSynced: true,
    }));

    const staffRoles: StaffRoleRecord[] = (rolesRes.data ?? []).map((r) => ({
      uid: r.uid,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      assignedBy: r.assigned_by,
      active: Boolean(r.active),
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const userDirectory: UserDirectoryRecord[] = (usersRes.data ?? []).map((r) => ({
      uid: r.uid,
      displayName: r.display_name,
      email: r.email,
      photoURL: r.photo_url ?? '',
      provider: r.provider,
      role: r.role,
      status: r.status,
      lastLoginAt: isoOrNow(r.last_login_at),
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const communityPosts: ModerationCommunityPost[] = (postsRes.data ?? []).map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorHandle: r.author_handle,
      authorInitials: r.author_initials,
      authorTone: r.author_tone,
      tag: r.tag,
      content: r.content,
      bookId: r.book_id,
      chapterId: r.chapter_id,
      likesCount: Number(r.likes_count ?? 0),
      moderationStatus: r.moderation_status,
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const supportTickets: SupportTicket[] = (ticketsRes.data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      userName: r.user_name,
      category: r.category,
      subject: r.subject,
      description: r.description,
      status: r.status,
      priority: r.priority,
      assignedTo: r.assigned_to ?? '',
      resolutionNote: r.resolution_note ?? '',
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const auditLogs: AuditLogEntry[] = (logsRes.data ?? []).map((r) => ({
      id: r.id,
      actorUid: r.actor_uid,
      actorEmail: r.actor_email,
      actorRole: r.actor_role,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      summary: r.summary,
      createdAt: isoOrNow(r.created_at),
    }));

    const sourcesRights: SourceRightRecord[] = (rightsRes.data ?? []).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      bookTitle: r.book_title,
      sourceName: r.source_name,
      licenseType: r.license_type,
      jurisdiction: r.jurisdiction,
      citationUrl: r.citation_url ?? '',
      verified: Boolean(r.verified),
      updatedBy: r.updated_by,
      createdAt: isoOrNow(r.created_at),
      updatedAt: isoOrNow(r.updated_at),
    }));

    const s = settingsRes.data;
    const systemSettings: SystemSettingsRecord | null = s
      ? {
          requireReviewBeforePublish: Boolean(s.require_review_before_publish),
          strictCommunityModeration: Boolean(s.strict_community_moderation),
          allowCsvImport: Boolean(s.allow_csv_import),
          allowJsonImport: Boolean(s.allow_json_import),
          allowExcelImport: Boolean(s.allow_excel_import),
          defaultLanguage: s.default_language,
          updatedBy: s.updated_by,
          updatedAt: isoOrNow(s.updated_at),
        }
      : null;

    return {
      cmsBooks,
      audioTracks,
      contentAudioMetadata,
      staffRoles,
      userDirectory,
      communityPosts,
      supportTickets,
      auditLogs,
      sourcesRights,
      systemSettings,
    };
  }

  async upsertCmsBook(book: CmsBook): Promise<CmsBook> {
    const now = new Date().toISOString();
    const record: CmsBook = { ...book, createdAt: book.createdAt || now, updatedAt: now };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.cmsBooks = [record, ...local.cmsBooks.filter((b) => b.id !== record.id)];
      await this.saveLocal();
      return record;
    }

    const { error } = await supabase.from('cms_books').upsert({
      id: record.id,
      short_title: record.shortTitle.slice(0, 120),
      title: record.title,
      subtitle: record.subtitle,
      jurisdiction: record.jurisdiction.slice(0, 140),
      year: record.year.slice(0, 32),
      category: record.category,
      cover_tone: record.coverTone,
      cover_image: record.coverImage ?? null,
      status: record.status,
      source_attribution: record.sourceAttribution,
      rights_license: record.rightsLicense.slice(0, 160),
      chapters: record.chapters,
      created_by_uid: record.createdByUid,
      created_by_email: record.createdByEmail,
      reviewed_by_email: record.reviewedByEmail ?? '',
      review_notes: record.reviewNotes ?? '',
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });
    if (error) throw new Error(error.message);
    return record;
  }

  async reviewCmsBook(
    bookId: string,
    status: CmsBookStatus,
    reviewedByEmail: string,
    reviewNotes: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.cmsBooks = local.cmsBooks.map((b) =>
        b.id === bookId ? { ...b, status, reviewedByEmail, reviewNotes, updatedAt: now } : b
      );
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('cms_books')
      .update({
        status,
        reviewed_by_email: reviewedByEmail,
        review_notes: reviewNotes,
        updated_at: now,
      })
      .eq('id', bookId);
    if (error) throw new Error(error.message);
  }

  async deleteCmsBook(bookId: string): Promise<void> {
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.cmsBooks = local.cmsBooks.filter((b) => b.id !== bookId);
      await this.saveLocal();
      return;
    }
    const { error } = await supabase.from('cms_books').delete().eq('id', bookId);
    if (error) throw new Error(error.message);
  }

  async upsertContentAudioMetadata(
    record: ContentAudioMetadataRecord
  ): Promise<ContentAudioMetadataRecord> {
    const now = new Date().toISOString();
    const saved: ContentAudioMetadataRecord = {
      ...record,
      createdAt: record.createdAt || now,
      updatedAt: now,
      firestoreSynced: true,
    };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.contentAudioMetadata = [
        saved,
        ...local.contentAudioMetadata.filter((i) => i.id !== saved.id),
      ];
      await this.saveLocal();
      return saved;
    }

    const { error } = await supabase.from('content_audio_metadata').upsert({
      id: saved.id,
      content_source: saved.contentSource,
      book_id: saved.bookId,
      book_title: saved.bookTitle.slice(0, 160),
      edition_id: saved.editionId ?? '',
      chapter_id: saved.chapterId,
      chapter_title: saved.chapterTitle.slice(0, 160),
      content_node_id: saved.contentNodeId,
      content_node_type: saved.contentNodeType,
      content_node_number: saved.contentNodeNumber.slice(0, 60),
      content_node_title: saved.contentNodeTitle.slice(0, 160),
      block_role: saved.blockRole,
      language: saved.language,
      narrator: saved.narrator.slice(0, 120),
      file_name: saved.fileName.slice(0, 200),
      mime_type: saved.mimeType.slice(0, 64),
      byte_size: saved.byteSize,
      duration_sec: saved.durationSec,
      duration_label: saved.durationLabel.slice(0, 32),
      audio_url: saved.audioUrl,
      asset_id: saved.assetId,
      sha256_checksum: saved.sha256Checksum,
      status: saved.status,
      uploaded_by_uid: saved.uploadedByUid,
      uploaded_by_email: saved.uploadedByEmail,
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async updateContentAudioStatus(audioId: string, status: AudioTrackStatus): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.contentAudioMetadata = local.contentAudioMetadata.map((item) =>
        item.id === audioId ? { ...item, status, updatedAt: now } : item
      );
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('content_audio_metadata')
      .update({ status, updated_at: now })
      .eq('id', audioId);
    if (error) throw new Error(error.message);
  }

  async deleteContentAudioMetadata(audioId: string): Promise<void> {
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.contentAudioMetadata = local.contentAudioMetadata.filter((i) => i.id !== audioId);
      await this.saveLocal();
      return;
    }
    const { error } = await supabase.from('content_audio_metadata').delete().eq('id', audioId);
    if (error) throw new Error(error.message);
  }

  async upsertAudioTrack(track: AudioTrackRecord): Promise<AudioTrackRecord> {
    const now = new Date().toISOString();
    const saved: AudioTrackRecord = { ...track, createdAt: track.createdAt || now, updatedAt: now };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.audioTracks = [saved, ...local.audioTracks.filter((t) => t.id !== saved.id)];
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('audio_tracks').upsert({
      id: saved.id,
      book_id: saved.bookId,
      book_title: saved.bookTitle.slice(0, 160),
      chapter_id: saved.chapterId,
      chapter_title: saved.chapterTitle.slice(0, 160),
      language: saved.language,
      narrator: saved.narrator.slice(0, 120),
      duration_label: saved.durationLabel.slice(0, 32),
      audio_url: saved.audioUrl,
      status: saved.status,
      uploaded_by_uid: saved.uploadedByUid,
      uploaded_by_email: saved.uploadedByEmail,
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async updateAudioTrackStatus(trackId: string, status: AudioTrackStatus): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.audioTracks = local.audioTracks.map((t) =>
        t.id === trackId ? { ...t, status, updatedAt: now } : t
      );
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('audio_tracks')
      .update({ status, updated_at: now })
      .eq('id', trackId);
    if (error) throw new Error(error.message);
  }

  async upsertUserDirectoryEntry(entry: UserDirectoryRecord): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.userDirectory = [
        { ...entry, updatedAt: now },
        ...local.userDirectory.filter((u) => u.uid !== entry.uid),
      ];
      await this.saveLocal();
      return;
    }
    const { error } = await supabase.from('user_directory').upsert({
      uid: entry.uid,
      display_name: entry.displayName.slice(0, 120),
      email: entry.email.slice(0, 180),
      photo_url: entry.photoURL ?? '',
      provider: entry.provider.slice(0, 60),
      role: entry.role,
      status: entry.status,
      last_login_at: entry.lastLoginAt || now,
      created_at: entry.createdAt || now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async assignStaffRole(input: {
    uid: string;
    email: string;
    displayName: string;
    role: AccountRole;
    assignedBy: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.userDirectory = local.userDirectory.map((u) =>
        u.uid === input.uid ? { ...u, role: input.role, updatedAt: now } : u
      );
      local.staffRoles = local.staffRoles.filter((s) => s.uid !== input.uid);
      if (input.role !== 'user') {
        local.staffRoles.unshift({
          uid: input.uid,
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          assignedBy: input.assignedBy,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      await this.saveLocal();
      return;
    }

    if (input.role === 'user') {
      await supabase.from('staff_roles').delete().eq('uid', input.uid);
    } else {
      const { error } = await supabase.from('staff_roles').upsert({
        uid: input.uid,
        email: input.email.slice(0, 180),
        display_name: input.displayName.slice(0, 120),
        role: input.role,
        assigned_by: input.assignedBy.slice(0, 180),
        active: true,
        updated_at: now,
      });
      if (error) throw new Error(error.message);
    }

    await supabase
      .from('user_directory')
      .update({ role: input.role, updated_at: now })
      .eq('uid', input.uid);
  }

  async updateUserAccountStatus(uid: string, status: AccountStatus): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.userDirectory = local.userDirectory.map((u) =>
        u.uid === uid ? { ...u, status, updatedAt: now } : u
      );
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('user_directory')
      .update({ status, updated_at: now })
      .eq('uid', uid);
    if (error) throw new Error(error.message);
  }

  async upsertCommunityPost(post: ModerationCommunityPost): Promise<ModerationCommunityPost> {
    const now = new Date().toISOString();
    const saved: ModerationCommunityPost = {
      ...post,
      createdAt: post.createdAt || now,
      updatedAt: now,
    };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.communityPosts = [saved, ...local.communityPosts.filter((p) => p.id !== saved.id)];
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('community_posts').upsert({
      id: saved.id,
      author_id: saved.authorId,
      author_name: saved.authorName.slice(0, 120),
      author_handle: saved.authorHandle.slice(0, 80),
      author_initials: saved.authorInitials.slice(0, 8),
      author_tone: saved.authorTone.slice(0, 40),
      tag: saved.tag.slice(0, 60),
      content: saved.content,
      book_id: saved.bookId,
      chapter_id: saved.chapterId,
      likes_count: saved.likesCount,
      moderation_status: saved.moderationStatus,
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async moderateCommunityPost(postId: string, moderationStatus: 'approved' | 'removed'): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.communityPosts = local.communityPosts.map((p) =>
        p.id === postId ? { ...p, moderationStatus, updatedAt: now } : p
      );
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('community_posts')
      .update({ moderation_status: moderationStatus, updated_at: now })
      .eq('id', postId);
    if (error) throw new Error(error.message);
  }

  async upsertSupportTicket(ticket: SupportTicket): Promise<SupportTicket> {
    const now = new Date().toISOString();
    const saved: SupportTicket = { ...ticket, createdAt: ticket.createdAt || now, updatedAt: now };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.supportTickets = [saved, ...local.supportTickets.filter((t) => t.id !== saved.id)];
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('support_tickets').upsert({
      id: saved.id,
      user_id: saved.userId,
      user_email: saved.userEmail.slice(0, 180),
      user_name: saved.userName.slice(0, 120),
      category: saved.category,
      subject: saved.subject.slice(0, 160),
      description: saved.description,
      status: saved.status,
      priority: saved.priority,
      assigned_to: saved.assignedTo ?? '',
      resolution_note: saved.resolutionNote ?? '',
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async updateSupportTicket(
    ticketId: string,
    updates: {
      status?: TicketStatus;
      priority?: TicketPriority;
      resolutionNote?: string;
      assignedTo?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.supportTickets = local.supportTickets.map((t) =>
        t.id === ticketId ? { ...t, ...updates, updatedAt: now } : t
      );
      await this.saveLocal();
      return;
    }
    const patch: Record<string, unknown> = { updated_at: now };
    if (updates.status) patch.status = updates.status;
    if (updates.priority) patch.priority = updates.priority;
    if (typeof updates.resolutionNote === 'string') patch.resolution_note = updates.resolutionNote;
    if (typeof updates.assignedTo === 'string') patch.assigned_to = updates.assignedTo;
    const { error } = await supabase.from('support_tickets').update(patch).eq('id', ticketId);
    if (error) throw new Error(error.message);
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    const now = entry.createdAt || new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.auditLogs = [{ ...entry, createdAt: now }, ...local.auditLogs].slice(0, 200);
      await this.saveLocal();
      return;
    }
    const { error } = await supabase.from('audit_logs').upsert({
      id: entry.id,
      actor_uid: entry.actorUid,
      actor_email: entry.actorEmail.slice(0, 180),
      actor_role: entry.actorRole,
      action: entry.action.slice(0, 80),
      target_type: entry.targetType.slice(0, 60),
      target_id: entry.targetId,
      summary: entry.summary,
      created_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async upsertSourceRight(record: SourceRightRecord): Promise<SourceRightRecord> {
    const now = new Date().toISOString();
    const saved: SourceRightRecord = { ...record, createdAt: record.createdAt || now, updatedAt: now };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.sourcesRights = [saved, ...local.sourcesRights.filter((r) => r.id !== saved.id)];
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('sources_rights').upsert({
      id: saved.id,
      book_id: saved.bookId,
      book_title: saved.bookTitle.slice(0, 160),
      source_name: saved.sourceName.slice(0, 200),
      license_type: saved.licenseType.slice(0, 120),
      jurisdiction: saved.jurisdiction.slice(0, 120),
      citation_url: saved.citationUrl ?? '',
      verified: saved.verified,
      updated_by: saved.updatedBy.slice(0, 180),
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async upsertSystemSettings(settings: SystemSettingsRecord): Promise<SystemSettingsRecord> {
    const now = new Date().toISOString();
    const saved: SystemSettingsRecord = { ...settings, updatedAt: now };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.systemSettings = saved;
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('system_settings').upsert({
      id: 'global',
      require_review_before_publish: saved.requireReviewBeforePublish,
      strict_community_moderation: saved.strictCommunityModeration,
      allow_csv_import: saved.allowCsvImport,
      allow_json_import: saved.allowJsonImport,
      allow_excel_import: saved.allowExcelImport,
      default_language: saved.defaultLanguage,
      updated_by: saved.updatedBy.slice(0, 180),
      updated_at: saved.updatedAt,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  // =========================================================================
  // READER PRIVATE SYNC (Supabase PostgreSQL user_* tables)
  // =========================================================================

  async getUserCloudState(uid: string): Promise<UserCloudStatePayload> {
    if (!isValidRecordId(uid)) throw new Error('Invalid user ID.');
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      const anns = local.userAnnotations[uid] ?? [];
      const highlights: Record<string, ClauseHighlight> = {};
      const bookmarks: Record<string, ClauseBookmark> = {};
      for (const a of anns) {
        if (a.kind === 'highlight' && a.color !== 'none') {
          highlights[a.clauseKey] = {
            clauseKey: a.clauseKey,
            bookId: a.bookId,
            chapterId: a.chapterId,
            clauseId: a.clauseId,
            color: a.color,
            updatedAt: a.updatedAt,
          };
        } else if (a.kind === 'bookmark') {
          bookmarks[a.clauseKey] = {
            clauseKey: a.clauseKey,
            bookId: a.bookId,
            chapterId: a.chapterId,
            clauseId: a.clauseId,
            createdAt: a.createdAt,
          };
        }
      }
      return {
        profile: local.userProfiles[uid] ?? null,
        notes: local.userNotes[uid] ?? [],
        highlights,
        bookmarks,
        customBooks: local.userCustomBooks[uid] ?? [],
      };
    }

    const [profileRes, notesRes, annsRes, booksRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('uid', uid).maybeSingle(),
      supabase.from('user_notes').select('*').eq('owner_id', uid).order('updated_at', { ascending: false }),
      supabase.from('user_annotations').select('*').eq('owner_id', uid),
      supabase.from('user_custom_books').select('*').eq('owner_id', uid).order('created_at', { ascending: false }),
    ]);

    const p = profileRes.data;
    const profile: UserCloudProfileRecord | null = p
      ? {
          uid: p.uid,
          displayName: p.display_name,
          email: p.email,
          photoURL: p.photo_url ?? '',
          preferredLanguage: p.preferred_language as LanguageCode,
          streakDays: Number(p.streak_days ?? 1),
          audioMinutes: Number(p.audio_minutes ?? 0),
          startedPlanIds: Array.isArray(p.started_plan_ids) ? p.started_plan_ids : [],
          completedPlanDayIds: Array.isArray(p.completed_plan_day_ids) ? p.completed_plan_day_ids : [],
          readChapterIds: Array.isArray(p.read_chapter_ids) ? p.read_chapter_ids : [],
          createdAt: isoOrNow(p.created_at),
          updatedAt: isoOrNow(p.updated_at),
        }
      : null;

    const notes: ClauseNote[] = (notesRes.data ?? []).map((n) => ({
      id: n.id,
      clauseKey: n.clause_key,
      bookId: n.book_id,
      chapterId: n.chapter_id,
      clauseId: n.clause_id,
      content: n.content,
      updatedAt: isoOrNow(n.updated_at),
    }));

    const highlights: Record<string, ClauseHighlight> = {};
    const bookmarks: Record<string, ClauseBookmark> = {};
    for (const a of annsRes.data ?? []) {
      const clauseKey = String(a.clause_key ?? '');
      if (!clauseKey) continue;
      if (a.kind === 'highlight' && a.color && a.color !== 'none') {
        highlights[clauseKey] = {
          clauseKey,
          bookId: a.book_id,
          chapterId: a.chapter_id,
          clauseId: a.clause_id,
          color: a.color as HighlightColor,
          updatedAt: isoOrNow(a.updated_at),
        };
      } else if (a.kind === 'bookmark') {
        bookmarks[clauseKey] = {
          clauseKey,
          bookId: a.book_id,
          chapterId: a.chapter_id,
          clauseId: a.clause_id,
          createdAt: isoOrNow(a.created_at),
        };
      }
    }

    const customBooks: UserCustomBookRow[] = (booksRes.data ?? []).map((b) => ({
      id: b.id,
      ownerId: b.owner_id,
      shortTitle: b.short_title,
      titleEn: b.title_en,
      jurisdiction: b.jurisdiction,
      year: b.year,
      category: b.category as BookCategory,
      chapterTitleEn: b.chapter_title_en,
      clauseNumber: b.clause_number,
      principleEn: b.principle_en,
      clauseTextEn: b.clause_text_en,
      explanationEn: b.explanation_en,
      clauseTextTe: b.clause_text_te ?? '',
      explanationTe: b.explanation_te ?? '',
      createdAt: isoOrNow(b.created_at),
      updatedAt: isoOrNow(b.updated_at),
    }));

    return { profile, notes, highlights, bookmarks, customBooks };
  }

  async upsertUserProfile(
    uid: string,
    patch: Partial<Omit<UserCloudProfileRecord, 'uid' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserCloudProfileRecord> {
    if (!isValidRecordId(uid)) throw new Error('Invalid user ID.');
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      const prev = local.userProfiles[uid];
      const next: UserCloudProfileRecord = {
        uid,
        displayName: patch.displayName ?? prev?.displayName ?? 'Legal Scholar',
        email: patch.email ?? prev?.email ?? '',
        photoURL: patch.photoURL ?? prev?.photoURL ?? '',
        preferredLanguage: patch.preferredLanguage ?? prev?.preferredLanguage ?? 'en',
        streakDays: patch.streakDays ?? prev?.streakDays ?? 1,
        audioMinutes: patch.audioMinutes ?? prev?.audioMinutes ?? 0,
        startedPlanIds: patch.startedPlanIds ?? prev?.startedPlanIds ?? [],
        completedPlanDayIds: patch.completedPlanDayIds ?? prev?.completedPlanDayIds ?? [],
        readChapterIds: patch.readChapterIds ?? prev?.readChapterIds ?? [],
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      local.userProfiles[uid] = next;
      await this.saveLocal();
      return next;
    }

    const { data: existing } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle();

    const row = {
      uid,
      display_name: (patch.displayName ?? existing?.display_name ?? 'Legal Scholar').slice(0, 120),
      email: (patch.email ?? existing?.email ?? '').slice(0, 180),
      photo_url: (patch.photoURL ?? existing?.photo_url ?? '').slice(0, 500),
      preferred_language: patch.preferredLanguage ?? existing?.preferred_language ?? 'en',
      streak_days: Math.min(10000, Math.max(0, Number(patch.streakDays ?? existing?.streak_days ?? 1))),
      audio_minutes: Math.min(
        1000000,
        Math.max(0, Number(patch.audioMinutes ?? existing?.audio_minutes ?? 0))
      ),
      started_plan_ids: (patch.startedPlanIds ?? existing?.started_plan_ids ?? []).slice(0, 30),
      completed_plan_day_ids: (
        patch.completedPlanDayIds ??
        existing?.completed_plan_day_ids ??
        []
      ).slice(0, 100),
      read_chapter_ids: (patch.readChapterIds ?? existing?.read_chapter_ids ?? []).slice(0, 100),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    const { error } = await supabase.from('user_profiles').upsert(row);
    if (error) throw new Error(error.message);

    return {
      uid: row.uid,
      displayName: row.display_name,
      email: row.email,
      photoURL: row.photo_url,
      preferredLanguage: row.preferred_language as LanguageCode,
      streakDays: row.streak_days,
      audioMinutes: row.audio_minutes,
      startedPlanIds: row.started_plan_ids,
      completedPlanDayIds: row.completed_plan_day_ids,
      readChapterIds: row.read_chapter_ids,
      createdAt: isoOrNow(row.created_at),
      updatedAt: row.updated_at,
    };
  }

  async upsertUserNote(
    uid: string,
    note: {
      id: string;
      clauseKey: string;
      bookId: string;
      chapterId: string;
      clauseId: string;
      content: string;
    }
  ): Promise<ClauseNote> {
    if (!isValidRecordId(uid) || !isValidRecordId(note.id)) throw new Error('Invalid ID.');
    const now = new Date().toISOString();
    const saved: ClauseNote = {
      id: note.id,
      clauseKey: note.clauseKey.slice(0, 160),
      bookId: note.bookId.slice(0, 128),
      chapterId: note.chapterId.slice(0, 128),
      clauseId: note.clauseId.slice(0, 128),
      content: note.content.trim().slice(0, 2000),
      updatedAt: now,
    };
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      const list = local.userNotes[uid] ?? [];
      local.userNotes[uid] = [saved, ...list.filter((n) => n.id !== saved.id)];
      await this.saveLocal();
      return saved;
    }
    const { error } = await supabase.from('user_notes').upsert({
      id: saved.id,
      owner_id: uid,
      clause_key: saved.clauseKey,
      book_id: saved.bookId,
      chapter_id: saved.chapterId,
      clause_id: saved.clauseId,
      content: saved.content,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
    return saved;
  }

  async deleteUserNote(uid: string, noteId: string): Promise<void> {
    if (!isValidRecordId(uid) || !isValidRecordId(noteId)) throw new Error('Invalid ID.');
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.userNotes[uid] = (local.userNotes[uid] ?? []).filter((n) => n.id !== noteId);
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('user_notes')
      .delete()
      .eq('id', noteId)
      .eq('owner_id', uid);
    if (error) throw new Error(error.message);
  }

  async upsertUserAnnotation(uid: string, ann: Omit<UserAnnotationPayload, 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<void> {
    if (!isValidRecordId(uid) || !isValidRecordId(ann.id)) throw new Error('Invalid ID.');
    const now = new Date().toISOString();
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      const list = local.userAnnotations[uid] ?? [];
      local.userAnnotations[uid] = [
        { ...ann, ownerId: uid, createdAt: now, updatedAt: now },
        ...list.filter((a) => a.id !== ann.id),
      ];
      await this.saveLocal();
      return;
    }
    const { error } = await supabase.from('user_annotations').upsert({
      id: ann.id,
      owner_id: uid,
      clause_key: ann.clauseKey.slice(0, 160),
      book_id: ann.bookId.slice(0, 128),
      chapter_id: ann.chapterId.slice(0, 128),
      clause_id: ann.clauseId.slice(0, 128),
      kind: ann.kind,
      color: ann.color,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async deleteUserAnnotation(uid: string, annId: string): Promise<void> {
    if (!isValidRecordId(uid) || !isValidRecordId(annId)) throw new Error('Invalid ID.');
    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      local.userAnnotations[uid] = (local.userAnnotations[uid] ?? []).filter((a) => a.id !== annId);
      await this.saveLocal();
      return;
    }
    const { error } = await supabase
      .from('user_annotations')
      .delete()
      .eq('id', annId)
      .eq('owner_id', uid);
    if (error) throw new Error(error.message);
  }

  async upsertUserCustomBook(uid: string, book: LawBook): Promise<UserCustomBookRow | null> {
    if (!isValidRecordId(uid) || !isValidRecordId(book.id)) throw new Error('Invalid ID.');
    const firstChapter = book.chapters[0];
    const firstClause = firstChapter?.clauses[0];
    if (!firstChapter || !firstClause) return null;

    const now = new Date().toISOString();
    const row: UserCustomBookRow = {
      id: book.id,
      ownerId: uid,
      shortTitle: book.shortTitle.slice(0, 120),
      titleEn: book.title.en.slice(0, 200),
      jurisdiction: book.jurisdiction.slice(0, 140),
      year: book.year.slice(0, 32),
      category: book.category,
      chapterTitleEn: firstChapter.title.en.slice(0, 200),
      clauseNumber: firstClause.number.slice(0, 80),
      principleEn: firstClause.principle.en.slice(0, 160),
      clauseTextEn: firstClause.text.en.slice(0, 4000),
      explanationEn: firstClause.explanation.en.slice(0, 4000),
      clauseTextTe: (firstClause.text.te ?? '').slice(0, 4000),
      explanationTe: (firstClause.explanation.te ?? '').slice(0, 4000),
      createdAt: now,
      updatedAt: now,
    };

    const supabase = this.getClient();
    if (!supabase) {
      const local = await this.loadLocal();
      const list = local.userCustomBooks[uid] ?? [];
      local.userCustomBooks[uid] = [row, ...list.filter((b) => b.id !== row.id)];
      await this.saveLocal();
      return row;
    }

    const { error } = await supabase.from('user_custom_books').upsert({
      id: row.id,
      owner_id: row.ownerId,
      short_title: row.shortTitle,
      title_en: row.titleEn,
      jurisdiction: row.jurisdiction,
      year: row.year,
      category: row.category,
      chapter_title_en: row.chapterTitleEn,
      clause_number: row.clauseNumber,
      principle_en: row.principleEn,
      clause_text_en: row.clauseTextEn,
      explanation_en: row.explanationEn,
      clause_text_te: row.clauseTextTe,
      explanation_te: row.explanationTe,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    });
    if (error) throw new Error(error.message);
    return row;
  }
}

export const supabaseDataService = new SupabaseDataService();
