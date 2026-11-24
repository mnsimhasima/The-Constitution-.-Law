import type { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import type {
  AccountRole,
  AccountStatus,
  AudioTrackRecord,
  AudioTrackStatus,
  AuditLogEntry,
  CmsBook,
  CmsBookStatus,
  CommunityModerationResponse,
  ContentAudioMetadataRecord,
  ModerationCommunityPost,
  SourceRightRecord,
  StaffRole,
  StaffRoleRecord,
  SupportTicket,
  SystemSettingsRecord,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserDirectoryRecord,
} from '../types/backend';
import type { Chapter, Clause, LawBook } from '../types/library';
import {
  buildClauseAudioAttachment,
  sanitizeContentAudioMetadataRecord,
} from '../utils/contentAudioMetadata';
import { BOOTSTRAPPED_ADMIN_EMAIL, resolveUserRole } from '../utils/rbacLogic';

const BACKEND_STORAGE_KEY = 'constitution_law_backend_cms_v1';

interface PersistedBackendState {
  cmsBooks: CmsBook[];
  audioTracks: AudioTrackRecord[];
  contentAudioMetadata: ContentAudioMetadataRecord[];
  staffRoles: StaffRoleRecord[];
  userDirectory: UserDirectoryRecord[];
  communityPosts: ModerationCommunityPost[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  sourcesRights: SourceRightRecord[];
  systemSettings: SystemSettingsRecord;
}

export interface StaffActor {
  uid: string;
  email: string;
  role: StaffRole;
}

function buildSeedState(): PersistedBackendState {
  const now = new Date().toISOString();
  const baseBooks: CmsBook[] = INITIAL_LAW_BOOKS.map((book) => ({
    id: book.id,
    shortTitle: book.shortTitle,
    title: book.title,
    subtitle: book.subtitle,
    jurisdiction: book.jurisdiction,
    year: book.year,
    category: book.category === 'custom' ? 'statutory' : book.category,
    coverTone: book.coverTone,
    coverImage: book.coverImage,
    status: 'published',
    sourceAttribution:
      book.category === 'history'
        ? 'Dr. Babasaheb Ambedkar Writings & Speeches (Govt. of Maharashtra)'
        : `${book.jurisdiction} Official Constitutional & Statutory Gazette`,
    rightsLicense: 'Public Domain / Open Civic Education',
    chapters: book.chapters,
    createdByUid: 'seed-admin',
    createdByEmail: BOOTSTRAPPED_ADMIN_EMAIL,
    reviewedByEmail: BOOTSTRAPPED_ADMIN_EMAIL,
    reviewNotes: 'Verified primary text and multilingual plain-language explanations.',
    createdAt: '2025-01-15T09:00:00.000Z',
    updatedAt: now,
  }));

  // Add one realistic pending_review book so Reviewers & Admins can inspect, listen, and Approve & Publish
  const pendingBook: CmsBook = {
    id: 'rte-act-2009',
    shortTitle: 'RTE Act 2009',
    title: {
      en: 'Right of Children to Free and Compulsory Education Act, 2009',
      te: 'బాలల ఉచిత మరియు నిర్బంధ విద్యా హక్కు చట్టం, 2009',
    },
    subtitle: {
      en: 'Statutory guarantee under Article 21A ensuring free elementary education for ages 6 to 14.',
      te: '6 నుండి 14 సంవత్సరాల పిల్లలకు ఉచిత ప్రాథమిక విద్యను హామీ ఇచ్చే ఆర్టికల్ 21A చట్టం.',
    },
    jurisdiction: 'Republic of India',
    year: '2009',
    category: 'statutory',
    coverTone: 'emerald',
    status: 'pending_review',
    sourceAttribution: 'Gazette of India — Department of School Education & Literacy',
    rightsLicense: 'Government Work — Public Domain',
    chapters: [
      {
        id: 'rte-ch-2',
        number: 'Chapter II',
        title: {
          en: 'Right to Free and Compulsory Education',
          te: 'ఉచిత మరియు నిర్బంధ విద్యా హక్కు',
        },
        summary: {
          en: 'Guarantees neighborhood school admission and removes financial barriers for children aged 6–14.',
        },
        estimatedMinutes: 4,
        clauses: [
          {
            id: 'rte-sec-3',
            number: 'Section 3',
            principle: {
              en: 'Neighborhood Elementary School Guarantee',
              te: 'సమీప ప్రాథమిక పాఠశాల హక్కు',
            },
            text: {
              en: 'Every child of the age of six to fourteen years shall have the right to free and compulsory education in a neighbourhood school till the completion of elementary education.',
              te: 'ఆరు నుండి పద్నాలుగు సంవత్సరాల వయస్సు గల ప్రతి బిడ్డకు సమీప పాఠశాలలో ప్రాథమిక విద్య పూర్తయ్యే వరకు ఉచిత మరియు నిర్బంధ విద్య పొందే హక్కు ఉంటుంది.',
            },
            explanation: {
              en: 'No child can be denied elementary education due to tuition fees, uniforms, or lack of documents. The State is legally obligated to ensure enrollment and completion.',
              te: 'ఫీజులు లేదా ఆర్థిక కారణాల వల్ల ఏ బిడ్డకూ ప్రాథమిక విద్యను నిరాకరించకూడదు. ప్రభుత్వం విద్యా ప్రవేశాన్ని నిర్ధారించాలి.',
            },
            realWorldExample: {
              en: 'Parents enrolling a child in a local government or aided school under Section 3 without paying capitation or screening fees.',
              te: 'ఎటువంటి డొనేషన్ లేదా ప్రవేశ పరీక్ష లేకుండా సమీప ప్రభుత్వ పాఠశాలలో పిల్లలను చేర్పించడం.',
            },
          },
        ],
      },
    ],
    createdByUid: 'staff-editor-1',
    createdByEmail: 'kavya.editor@constitutionlaw.org',
    reviewedByEmail: '',
    reviewNotes: 'Ready for legal accuracy check and Telugu audio review.',
    createdAt: '2025-02-18T11:30:00.000Z',
    updatedAt: now,
  };

  const cmsBooks = [pendingBook, ...baseBooks];

  const audioTracks: AudioTrackRecord[] = [
    {
      id: 'aud-ind-preamble-en',
      bookId: 'constitution-india',
      bookTitle: 'Constitution of India',
      chapterId: 'ind-preamble-rights',
      chapterTitle: 'Preamble & Fundamental Rights',
      language: 'en',
      narrator: 'Adv. Meera Deshmukh (Studio Voice)',
      durationLabel: '08:40',
      audioUrl: '',
      status: 'published',
      uploadedByUid: 'staff-editor-1',
      uploadedByEmail: 'kavya.editor@constitutionlaw.org',
      createdAt: '2025-02-01T10:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'aud-ind-preamble-te',
      bookId: 'constitution-india',
      bookTitle: 'Constitution of India',
      chapterId: 'ind-preamble-rights',
      chapterTitle: 'పీఠిక & ప్రాథమిక హక్కులు (Telugu)',
      language: 'te',
      narrator: 'Dr. Ravi Shankar Rao (Telugu Studio)',
      durationLabel: '09:15',
      audioUrl: '',
      status: 'published',
      uploadedByUid: 'staff-editor-1',
      uploadedByEmail: 'kavya.editor@constitutionlaw.org',
      createdAt: '2025-02-04T14:20:00.000Z',
      updatedAt: now,
    },
    {
      id: 'aud-rte-sec3-en',
      bookId: 'rte-act-2009',
      bookTitle: 'RTE Act 2009',
      chapterId: 'rte-ch-2',
      chapterTitle: 'Right to Free and Compulsory Education',
      language: 'en',
      narrator: 'Civic Studio Narrator',
      durationLabel: '04:10',
      audioUrl: '',
      status: 'pending_review',
      uploadedByUid: 'staff-editor-1',
      uploadedByEmail: 'kavya.editor@constitutionlaw.org',
      createdAt: '2025-02-18T12:00:00.000Z',
      updatedAt: now,
    },
  ];

  const staffRoles: StaffRoleRecord[] = [
    {
      uid: 'admin-bootstrap',
      email: BOOTSTRAPPED_ADMIN_EMAIL,
      displayName: 'Primary System Admin',
      role: 'admin',
      assignedBy: 'system',
      active: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-editor-1',
      email: 'kavya.editor@constitutionlaw.org',
      displayName: 'Kavya N. (Legal Editor)',
      role: 'editor',
      assignedBy: BOOTSTRAPPED_ADMIN_EMAIL,
      active: true,
      createdAt: '2025-01-12T09:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-reviewer-1',
      email: 'arjun.reviewer@constitutionlaw.org',
      displayName: 'Adv. Arjun Rao (Reviewer)',
      role: 'reviewer',
      assignedBy: BOOTSTRAPPED_ADMIN_EMAIL,
      active: true,
      createdAt: '2025-01-14T09:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-security-1',
      email: 'priya.security@constitutionlaw.org',
      displayName: 'Priya Menon (Security & Support)',
      role: 'security',
      assignedBy: BOOTSTRAPPED_ADMIN_EMAIL,
      active: true,
      createdAt: '2025-01-16T09:00:00.000Z',
      updatedAt: now,
    },
  ];

  const userDirectory: UserDirectoryRecord[] = [
    {
      uid: 'admin-bootstrap',
      displayName: 'Primary System Admin',
      email: BOOTSTRAPPED_ADMIN_EMAIL,
      photoURL: '',
      provider: 'google.com',
      role: 'admin',
      status: 'active',
      lastLoginAt: now,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-editor-1',
      displayName: 'Kavya N.',
      email: 'kavya.editor@constitutionlaw.org',
      photoURL: '',
      provider: 'google.com',
      role: 'editor',
      status: 'active',
      lastLoginAt: '2025-02-18T11:20:00.000Z',
      createdAt: '2025-01-12T09:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-reviewer-1',
      displayName: 'Adv. Arjun Rao',
      email: 'arjun.reviewer@constitutionlaw.org',
      photoURL: '',
      provider: 'google.com',
      role: 'reviewer',
      status: 'active',
      lastLoginAt: '2025-02-18T10:15:00.000Z',
      createdAt: '2025-01-14T09:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'staff-security-1',
      displayName: 'Priya Menon',
      email: 'priya.security@constitutionlaw.org',
      photoURL: '',
      provider: 'google.com',
      role: 'security',
      status: 'active',
      lastLoginAt: '2025-02-18T09:45:00.000Z',
      createdAt: '2025-01-16T09:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'reader-telugu-1',
      displayName: 'Srinivas Reddy',
      email: 'srinivas.reader@gmail.com',
      photoURL: '',
      provider: 'google.com',
      role: 'user',
      status: 'active',
      lastLoginAt: '2025-02-18T08:30:00.000Z',
      createdAt: '2025-02-02T07:00:00.000Z',
      updatedAt: now,
    },
    {
      uid: 'reader-student-2',
      displayName: 'Ananya Deshmukh',
      email: 'ananya.lawstudent@gmail.com',
      photoURL: '',
      provider: 'google.com',
      role: 'user',
      status: 'active',
      lastLoginAt: '2025-02-17T19:12:00.000Z',
      createdAt: '2025-02-08T13:00:00.000Z',
      updatedAt: now,
    },
  ];

  const communityPosts: ModerationCommunityPost[] = [
    {
      id: 'cpost-article-32',
      authorId: 'reader-student-2',
      authorName: 'Ananya Deshmukh',
      authorHandle: '@ananya.law',
      authorInitials: 'AD',
      authorTone: 'bg-blue-600',
      tag: 'Constitutional Remedies',
      content:
        'Dr. B. R. Ambedkar called Article 32 the heart and soul of the Constitution because rights without a direct Supreme Court writ remedy remain only words on paper.',
      bookId: 'constitution-india',
      chapterId: 'ind-preamble-rights',
      likesCount: 42,
      moderationStatus: 'approved',
      createdAt: '2025-02-18T08:15:00.000Z',
      updatedAt: '2025-02-18T08:15:00.000Z',
    },
    {
      id: 'cpost-telugu-study',
      authorId: 'reader-telugu-1',
      authorName: 'Srinivas Reddy',
      authorHandle: '@srinivas.civic',
      authorInitials: 'SR',
      authorTone: 'bg-emerald-600',
      tag: 'Telugu Constitutional Study',
      content:
        'Listening to Article 21 (జీవించే హక్కు మరియు వ్యక్తిగత స్వేచ్ఛ) in Telugu alongside the plain-language explanation made digital privacy rulings so much clearer for our study group.',
      bookId: 'constitution-india',
      chapterId: 'ind-preamble-rights',
      likesCount: 29,
      moderationStatus: 'approved',
      createdAt: '2025-02-17T16:40:00.000Z',
      updatedAt: '2025-02-17T16:40:00.000Z',
    },
  ];

  const supportTickets: SupportTicket[] = [
    {
      id: 'tkt-audio-te-01',
      userId: 'reader-telugu-1',
      userEmail: 'srinivas.reader@gmail.com',
      userName: 'Srinivas Reddy',
      category: 'audio',
      subject: 'Telugu voice narration pauses after locking Android screen',
      description:
        'When listening to Constitution of India Chapter 1 in Telugu at 1.25x speed, browser speech pauses when my phone screen locks after 2 minutes.',
      status: 'open',
      priority: 'high',
      assignedTo: 'priya.security@constitutionlaw.org',
      resolutionNote: '',
      createdAt: '2025-02-18T09:10:00.000Z',
      updatedAt: '2025-02-18T09:10:00.000Z',
    },
    {
      id: 'tkt-sync-02',
      userId: 'reader-student-2',
      userEmail: 'ananya.lawstudent@gmail.com',
      userName: 'Ananya Deshmukh',
      category: 'sync',
      subject: 'Bookmarks synced smoothly after Google login',
      description:
        'Wanted to check whether my saved notes on Ambedkar speeches stay backed up if I clear browser storage and sign in again with Google.',
      status: 'resolved',
      priority: 'low',
      assignedTo: 'priya.security@constitutionlaw.org',
      resolutionNote:
        'Confirmed: all notes, highlights, and bookmarks are stored in your private Supabase PostgreSQL user profile and restore automatically on Google sign-in.',
      createdAt: '2025-02-16T14:00:00.000Z',
      updatedAt: '2025-02-16T16:30:00.000Z',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'log-001',
      actorUid: 'staff-editor-1',
      actorEmail: 'kavya.editor@constitutionlaw.org',
      actorRole: 'editor',
      action: 'BOOK_SUBMITTED_REVIEW',
      targetType: 'cmsBooks',
      targetId: 'rte-act-2009',
      summary: 'Submitted "RTE Act 2009" with English & Telugu clauses for Reviewer approval.',
      createdAt: '2025-02-18T11:30:00.000Z',
    },
    {
      id: 'log-002',
      actorUid: 'staff-security-1',
      actorEmail: 'priya.security@constitutionlaw.org',
      actorRole: 'security',
      action: 'TICKET_RESOLVED',
      targetType: 'supportTickets',
      targetId: 'tkt-sync-02',
      summary: 'Resolved cloud sync inquiry ticket for ananya.lawstudent@gmail.com.',
      createdAt: '2025-02-16T16:30:00.000Z',
    },
    {
      id: 'log-003',
      actorUid: 'admin-bootstrap',
      actorEmail: BOOTSTRAPPED_ADMIN_EMAIL,
      actorRole: 'admin',
      action: 'BOOK_PUBLISHED',
      targetType: 'cmsBooks',
      targetId: 'constitution-india',
      summary: 'Verified & published "Constitution of India" multilingual edition to Mobile Library.',
      createdAt: '2025-01-15T09:05:00.000Z',
    },
  ];

  const sourcesRights: SourceRightRecord[] = baseBooks.map((b) => ({
    id: `src-${b.id}`,
    bookId: b.id,
    bookTitle: b.shortTitle,
    sourceName: b.sourceAttribution,
    licenseType: b.rightsLicense,
    jurisdiction: b.jurisdiction,
    citationUrl: 'https://legislative.gov.in',
    verified: true,
    updatedBy: BOOTSTRAPPED_ADMIN_EMAIL,
    createdAt: '2025-01-15T09:00:00.000Z',
    updatedAt: now,
  }));

  const systemSettings: SystemSettingsRecord = {
    requireReviewBeforePublish: true,
    strictCommunityModeration: true,
    allowCsvImport: true,
    allowJsonImport: true,
    allowExcelImport: true,
    defaultLanguage: 'en',
    updatedBy: BOOTSTRAPPED_ADMIN_EMAIL,
    updatedAt: now,
  };

  return {
    cmsBooks,
    audioTracks,
    contentAudioMetadata: [],
    staffRoles,
    userDirectory,
    communityPosts,
    supportTickets,
    auditLogs,
    sourcesRights,
    systemSettings,
  };
}

function loadInitialBackendState(): PersistedBackendState {
  const seed = buildSeedState();
  try {
    const raw = localStorage.getItem(BACKEND_STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as Partial<PersistedBackendState>;
    return {
      cmsBooks: Array.isArray(parsed.cmsBooks) && parsed.cmsBooks.length > 0 ? parsed.cmsBooks : seed.cmsBooks,
      audioTracks: Array.isArray(parsed.audioTracks) ? parsed.audioTracks : seed.audioTracks,
      contentAudioMetadata: Array.isArray(parsed.contentAudioMetadata)
        ? parsed.contentAudioMetadata
        : seed.contentAudioMetadata,
      staffRoles: Array.isArray(parsed.staffRoles) && parsed.staffRoles.length > 0 ? parsed.staffRoles : seed.staffRoles,
      userDirectory: Array.isArray(parsed.userDirectory) && parsed.userDirectory.length > 0 ? parsed.userDirectory : seed.userDirectory,
      communityPosts: Array.isArray(parsed.communityPosts) ? parsed.communityPosts : seed.communityPosts,
      supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets : seed.supportTickets,
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : seed.auditLogs,
      sourcesRights: Array.isArray(parsed.sourcesRights) ? parsed.sourcesRights : seed.sourcesRights,
      systemSettings: parsed.systemSettings ? { ...seed.systemSettings, ...parsed.systemSettings } : seed.systemSettings,
    };
  } catch {
    return seed;
  }
}

// Helper for fire-and-forget Supabase CMS writes
async function supabaseCmsRequest(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

export function useBackendStore(user: User | null) {
  const [state, setState] = useState<PersistedBackendState>(() => loadInitialBackendState());

  // Persist locally so edits, imports, and approvals persist immediately across refreshes and tabs
  useEffect(() => {
    try {
      localStorage.setItem(BACKEND_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota limits
    }
  }, [state]);

  // Hydrate all CMS collections from Supabase PostgreSQL via /api/supabase/cms/bootstrap
  useEffect(() => {
    let cancelled = false;
    async function hydrateFromSupabase() {
      try {
        const res = await fetch('/api/supabase/cms/bootstrap', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const remote = (await res.json()) as Partial<PersistedBackendState>;
        if (cancelled) return;
        setState((prev) => ({
          cmsBooks:
            Array.isArray(remote.cmsBooks) && remote.cmsBooks.length > 0
              ? remote.cmsBooks
              : prev.cmsBooks,
          audioTracks:
            Array.isArray(remote.audioTracks) && remote.audioTracks.length > 0
              ? remote.audioTracks
              : prev.audioTracks,
          contentAudioMetadata:
            Array.isArray(remote.contentAudioMetadata) && remote.contentAudioMetadata.length > 0
              ? remote.contentAudioMetadata.map((item) =>
                  sanitizeContentAudioMetadataRecord({ ...item, firestoreSynced: true })
                )
              : prev.contentAudioMetadata,
          staffRoles:
            Array.isArray(remote.staffRoles) && remote.staffRoles.length > 0
              ? remote.staffRoles
              : prev.staffRoles,
          userDirectory:
            Array.isArray(remote.userDirectory) && remote.userDirectory.length > 0
              ? remote.userDirectory
              : prev.userDirectory,
          communityPosts:
            Array.isArray(remote.communityPosts) && remote.communityPosts.length > 0
              ? remote.communityPosts
              : prev.communityPosts,
          supportTickets:
            Array.isArray(remote.supportTickets) && remote.supportTickets.length > 0
              ? remote.supportTickets
              : prev.supportTickets,
          auditLogs:
            Array.isArray(remote.auditLogs) && remote.auditLogs.length > 0
              ? remote.auditLogs
              : prev.auditLogs,
          sourcesRights:
            Array.isArray(remote.sourcesRights) && remote.sourcesRights.length > 0
              ? remote.sourcesRights
              : prev.sourcesRights,
          systemSettings: remote.systemSettings
            ? { ...prev.systemSettings, ...remote.systemSettings }
            : prev.systemSettings,
        }));
      } catch {
        // Retain local cache if offline
      }
    }
    void hydrateFromSupabase();
    return () => {
      cancelled = true;
    };
  }, []);

  // Record authenticated Google user in Supabase user_directory
  useEffect(() => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const resolvedRole = resolveUserRole(user.email, user.uid, state.staffRoles);

    const entry: UserDirectoryRecord = {
      uid: user.uid,
      displayName: user.displayName ?? 'Civic Reader',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      provider: user.providerData?.[0]?.providerId ?? 'google.com',
      role: resolvedRole,
      status: 'active',
      lastLoginAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setState((prev) => {
      const existing = prev.userDirectory.find((u) => u.uid === user.uid || u.email === user.email);
      const merged: UserDirectoryRecord = {
        ...entry,
        displayName: user.displayName ?? existing?.displayName ?? 'Civic Reader',
        email: user.email ?? existing?.email ?? '',
        status: existing?.status ?? 'active',
        createdAt: existing?.createdAt ?? nowIso,
      };
      const filtered = prev.userDirectory.filter((u) => u.uid !== user.uid && u.email !== merged.email);
      return { ...prev, userDirectory: [merged, ...filtered] };
    });

    void supabaseCmsRequest(`/api/supabase/cms/users/${encodeURIComponent(user.uid)}`, 'PUT', {
      entry,
    }).catch(() => {});
  }, [user?.uid, user?.email]);

  const currentAccountRole: AccountRole = useMemo(
    () => resolveUserRole(user?.email, user?.uid, state.staffRoles),
    [user?.email, user?.uid, state.staffRoles]
  );

  // Convert published CmsBooks -> LawBook[] for the Mobile Reader & Library!
  const publishedLawBooks: LawBook[] = useMemo(() => {
    const coverById = new Map(INITIAL_LAW_BOOKS.map((b) => [b.id, b.coverImage]));
    return state.cmsBooks
      .filter((b) => b.status === 'published')
      .map((b) => ({
        id: b.id,
        shortTitle: b.shortTitle,
        title: b.title,
        subtitle: b.subtitle,
        jurisdiction: b.jurisdiction,
        year: b.year,
        category: b.category,
        coverTone: b.coverTone,
        coverImage: b.coverImage ?? coverById.get(b.id),
        chapters: b.chapters,
      }));
  }, [state.cmsBooks]);

  const appendAuditLog = useCallback(
    (actor: StaffActor, action: string, targetType: string, targetId: string, summary: string) => {
      const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const entry: AuditLogEntry = {
        id: logId,
        actorUid: user?.uid ?? actor.uid,
        actorEmail: user?.email ?? actor.email,
        actorRole: actor.role,
        action,
        targetType,
        targetId,
        summary,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        auditLogs: [entry, ...prev.auditLogs].slice(0, 150),
      }));

      void supabaseCmsRequest('/api/supabase/cms/audit-logs', 'POST', { entry }).catch(() => {});
    },
    [user]
  );

  const upsertCmsBook = useCallback(
    (book: CmsBook, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const updatedBook: CmsBook = {
        ...book,
        createdByUid: user?.uid ?? book.createdByUid ?? actor.uid,
        createdByEmail: user?.email ?? book.createdByEmail ?? actor.email,
        updatedAt: nowIso,
      };
      setState((prev) => {
        const exists = prev.cmsBooks.some((b) => b.id === book.id);
        const cmsBooks = exists
          ? prev.cmsBooks.map((b) => (b.id === book.id ? updatedBook : b))
          : [updatedBook, ...prev.cmsBooks];
        return { ...prev, cmsBooks };
      });
      appendAuditLog(
        actor,
        'BOOK_SAVED',
        'cms_books',
        book.id,
        `Saved "${book.shortTitle}" (status: ${book.status}, ${book.chapters.length} chapters).`
      );
      void supabaseCmsRequest(`/api/supabase/cms/books/${encodeURIComponent(book.id)}`, 'PUT', {
        book: updatedBook,
      }).catch(() => {});
    },
    [appendAuditLog, user]
  );

  const bulkImportBooks = useCallback(
    (books: CmsBook[], actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => {
        const map = new Map(prev.cmsBooks.map((b) => [b.id, b]));
        books.forEach((b) => {
          map.set(b.id, { ...b, updatedAt: nowIso });
        });
        return { ...prev, cmsBooks: Array.from(map.values()) };
      });
      appendAuditLog(
        actor,
        'BULK_IMPORT',
        'cms_books',
        books.map((b) => b.id).join(',').slice(0, 100) || 'bulk',
        `Bulk imported ${books.length} book(s): ${books.map((b) => b.shortTitle).join(', ').slice(0, 220)}.`
      );
      books.forEach((book) => {
        void supabaseCmsRequest(`/api/supabase/cms/books/${encodeURIComponent(book.id)}`, 'PUT', {
          book: { ...book, updatedAt: nowIso },
        }).catch(() => {});
      });
    },
    [appendAuditLog]
  );

  const reviewCmsBook = useCallback(
    (bookId: string, nextStatus: CmsBookStatus, reviewNotes: string, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      let targetName = bookId;
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.map((b) => {
          if (b.id !== bookId) return b;
          targetName = b.shortTitle;
          return {
            ...b,
            status: nextStatus,
            reviewedByEmail: actor.email,
            reviewNotes,
            updatedAt: nowIso,
          };
        }),
      }));
      const actionMap: Record<CmsBookStatus, string> = {
        published: 'BOOK_APPROVED_PUBLISHED',
        changes_requested: 'BOOK_CHANGES_REQUESTED',
        pending_review: 'BOOK_SUBMITTED_REVIEW',
        draft: 'BOOK_UNPUBLISHED_DRAFT',
      };
      appendAuditLog(
        actor,
        actionMap[nextStatus],
        'cms_books',
        bookId,
        `Updated "${targetName}" to ${nextStatus}.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/books/${encodeURIComponent(bookId)}/review`,
        'PATCH',
        {
          status: nextStatus,
          reviewedByEmail: user?.email ?? actor.email,
          reviewNotes,
        }
      ).catch(() => {});
    },
    [appendAuditLog, user]
  );

  const deleteCmsBook = useCallback(
    (bookId: string, actor: StaffActor) => {
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.filter((b) => b.id !== bookId),
      }));
      appendAuditLog(actor, 'BOOK_DELETED', 'cms_books', bookId, `Deleted book ${bookId} from CMS.`);
      void supabaseCmsRequest(`/api/supabase/cms/books/${encodeURIComponent(bookId)}`, 'DELETE').catch(
        () => {}
      );
    },
    [appendAuditLog]
  );

  const syncBookChaptersToSupabase = useCallback(async (bookSnapshot: CmsBook) => {
    try {
      await supabaseCmsRequest(`/api/supabase/cms/books/${encodeURIComponent(bookSnapshot.id)}`, 'PUT', {
        book: bookSnapshot,
      });
    } catch {
      // Keep local state resilient if offline
    }
  }, []);

  const addChapterToBook = useCallback(
    (bookId: string, chapter: Chapter, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      let updatedSnapshot: CmsBook | null = null;
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.map((b) => {
          if (b.id !== bookId) return b;
          updatedSnapshot = { ...b, chapters: [...b.chapters, chapter], updatedAt: nowIso };
          return updatedSnapshot;
        }),
      }));
      appendAuditLog(
        actor,
        'CHAPTER_ADDED',
        'cms_books',
        bookId,
        `Added chapter "${chapter.title.en}" to book ${bookId}.`
      );
      if (updatedSnapshot) {
        void syncBookChaptersToSupabase(updatedSnapshot);
      }
    },
    [appendAuditLog, syncBookChaptersToSupabase]
  );

  const upsertClauseInBook = useCallback(
    (bookId: string, chapterId: string, clause: Clause, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      let updatedSnapshot: CmsBook | null = null;
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.map((book) => {
          if (book.id !== bookId) return book;
          updatedSnapshot = {
            ...book,
            updatedAt: nowIso,
            chapters: book.chapters.map((ch) => {
              if (ch.id !== chapterId) return ch;
              const exists = ch.clauses.some((cl) => cl.id === clause.id);
              const nextClauses = exists
                ? ch.clauses.map((cl) => (cl.id === clause.id ? clause : cl))
                : [...ch.clauses, clause];
              return { ...ch, clauses: nextClauses };
            }),
          };
          return updatedSnapshot;
        }),
      }));
      appendAuditLog(
        actor,
        'CLAUSE_SAVED',
        'cms_books',
        `${bookId}/${clause.id}`,
        `Saved ${clause.number} ("${clause.principle.en}") in ${bookId}.`
      );
      if (updatedSnapshot) {
        void syncBookChaptersToSupabase(updatedSnapshot);
      }
    },
    [appendAuditLog, syncBookChaptersToSupabase]
  );

  const deleteClauseInBook = useCallback(
    (bookId: string, chapterId: string, clauseId: string, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      let updatedSnapshot: CmsBook | null = null;
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.map((book) => {
          if (book.id !== bookId) return book;
          updatedSnapshot = {
            ...book,
            updatedAt: nowIso,
            chapters: book.chapters.map((ch) =>
              ch.id === chapterId
                ? { ...ch, clauses: ch.clauses.filter((cl) => cl.id !== clauseId) }
                : ch
            ),
          };
          return updatedSnapshot;
        }),
      }));
      appendAuditLog(actor, 'CLAUSE_DELETED', 'cms_books', `${bookId}/${clauseId}`, `Removed clause ${clauseId}.`);
      if (updatedSnapshot) {
        void syncBookChaptersToSupabase(updatedSnapshot);
      }
    },
    [appendAuditLog, syncBookChaptersToSupabase]
  );

  const upsertContentAudioMetadata = useCallback(
    async (
      input: Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'> & {
        createdAt?: string;
        updatedAt?: string;
      },
      actor: StaffActor
    ): Promise<{ record: ContentAudioMetadataRecord; firestoreSynced: boolean; error?: string }> => {
      const nowIso = new Date().toISOString();
      const sanitized = sanitizeContentAudioMetadataRecord({
        ...input,
        uploadedByUid: user?.uid ?? input.uploadedByUid ?? actor.uid,
        uploadedByEmail: user?.email ?? input.uploadedByEmail ?? actor.email,
        createdAt: input.createdAt ?? nowIso,
        updatedAt: nowIso,
        firestoreSynced: false,
      });

      const clauseAttachment = buildClauseAudioAttachment(sanitized);
      let updatedCmsBook: CmsBook | null = null;

      setState((prev) => {
        const exists = prev.contentAudioMetadata.some((item) => item.id === sanitized.id);
        const nextContentAudio = exists
          ? prev.contentAudioMetadata.map((item) => (item.id === sanitized.id ? sanitized : item))
          : [sanitized, ...prev.contentAudioMetadata];

        const nextCmsBooks =
          sanitized.contentSource === 'cms_books'
            ? prev.cmsBooks.map((book) => {
                if (book.id !== sanitized.bookId) return book;
                const nextBook: CmsBook = {
                  ...book,
                  updatedAt: nowIso,
                  chapters: book.chapters.map((ch) => {
                    if (ch.id !== sanitized.chapterId) return ch;
                    return {
                      ...ch,
                      clauses: ch.clauses.map((cl) => {
                        if (cl.id !== sanitized.contentNodeId) return cl;
                        return {
                          ...cl,
                          audioAttachments: {
                            ...(cl.audioAttachments ?? {}),
                            [sanitized.blockRole]: clauseAttachment,
                          },
                        };
                      }),
                    };
                  }),
                };
                updatedCmsBook = nextBook;
                return nextBook;
              })
            : prev.cmsBooks;

        return {
          ...prev,
          contentAudioMetadata: nextContentAudio,
          cmsBooks: nextCmsBooks,
        };
      });

      appendAuditLog(
        actor,
        'AUDIO_NODE_LINKED',
        'content_audio_metadata',
        sanitized.id,
        `Linked ${sanitized.fileName} (${sanitized.blockRole}, ${sanitized.language.toUpperCase()}) to ${sanitized.contentNodeNumber} (${sanitized.contentNodeId}) in Supabase.`
      );

      try {
        await supabaseCmsRequest(
          `/api/supabase/cms/content-audio/${encodeURIComponent(sanitized.id)}`,
          'PUT',
          { record: sanitized }
        );

        if (updatedCmsBook) {
          await syncBookChaptersToSupabase(updatedCmsBook);
        }

        const syncedRecord: ContentAudioMetadataRecord = { ...sanitized, firestoreSynced: true };
        setState((prev) => ({
          ...prev,
          contentAudioMetadata: prev.contentAudioMetadata.map((item) =>
            item.id === syncedRecord.id ? syncedRecord : item
          ),
        }));
        return { record: syncedRecord, firestoreSynced: true };
      } catch (error) {
        return {
          record: sanitized,
          firestoreSynced: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [appendAuditLog, syncBookChaptersToSupabase, user]
  );

  const deleteContentAudioMetadata = useCallback(
    async (audioId: string, actor: StaffActor): Promise<void> => {
      const nowIso = new Date().toISOString();
      let removedRecord: ContentAudioMetadataRecord | null = null;
      let updatedCmsBook: CmsBook | null = null;

      setState((prev) => {
        removedRecord = prev.contentAudioMetadata.find((item) => item.id === audioId) ?? null;
        const nextContentAudio = prev.contentAudioMetadata.filter((item) => item.id !== audioId);
        const nextCmsBooks =
          removedRecord && removedRecord.contentSource === 'cms_books'
            ? prev.cmsBooks.map((book) => {
                if (book.id !== removedRecord!.bookId) return book;
                const nextBook: CmsBook = {
                  ...book,
                  updatedAt: nowIso,
                  chapters: book.chapters.map((ch) => {
                    if (ch.id !== removedRecord!.chapterId) return ch;
                    return {
                      ...ch,
                      clauses: ch.clauses.map((cl) => {
                        if (cl.id !== removedRecord!.contentNodeId || !cl.audioAttachments) return cl;
                        const nextAttachments = { ...cl.audioAttachments };
                        if (nextAttachments[removedRecord!.blockRole]?.audioMetadataId === audioId) {
                          delete nextAttachments[removedRecord!.blockRole];
                        }
                        return { ...cl, audioAttachments: nextAttachments };
                      }),
                    };
                  }),
                };
                updatedCmsBook = nextBook;
                return nextBook;
              })
            : prev.cmsBooks;

        return {
          ...prev,
          contentAudioMetadata: nextContentAudio,
          cmsBooks: nextCmsBooks,
        };
      });

      appendAuditLog(
        actor,
        'AUDIO_NODE_UNLINKED',
        'content_audio_metadata',
        audioId,
        `Removed linked audio metadata ${audioId}.`
      );

      try {
        await supabaseCmsRequest(
          `/api/supabase/cms/content-audio/${encodeURIComponent(audioId)}`,
          'DELETE'
        );
        if (updatedCmsBook) {
          await syncBookChaptersToSupabase(updatedCmsBook);
        }
      } catch {
        // Keep local deletion resilient
      }
    },
    [appendAuditLog, syncBookChaptersToSupabase]
  );

  const updateContentAudioStatus = useCallback(
    async (audioId: string, status: AudioTrackStatus, actor: StaffActor): Promise<void> => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        contentAudioMetadata: prev.contentAudioMetadata.map((item) =>
          item.id === audioId ? { ...item, status, updatedAt: nowIso } : item
        ),
      }));
      appendAuditLog(
        actor,
        'AUDIO_NODE_STATUS_UPDATED',
        'content_audio_metadata',
        audioId,
        `Set linked node audio ${audioId} status to ${status}.`
      );
      try {
        await supabaseCmsRequest(
          `/api/supabase/cms/content-audio/${encodeURIComponent(audioId)}/status`,
          'PATCH',
          { status }
        );
      } catch {
        // Keep local state resilient
      }
    },
    [appendAuditLog]
  );

  const upsertAudioTrack = useCallback(
    (track: AudioTrackRecord, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const nextTrack: AudioTrackRecord = {
        ...track,
        uploadedByUid: user?.uid ?? track.uploadedByUid ?? actor.uid,
        uploadedByEmail: user?.email ?? track.uploadedByEmail ?? actor.email,
        updatedAt: nowIso,
      };
      setState((prev) => {
        const exists = prev.audioTracks.some((t) => t.id === track.id);
        return {
          ...prev,
          audioTracks: exists
            ? prev.audioTracks.map((t) => (t.id === track.id ? nextTrack : t))
            : [nextTrack, ...prev.audioTracks],
        };
      });
      appendAuditLog(
        actor,
        'AUDIO_SAVED',
        'audio_tracks',
        track.id,
        `Uploaded/updated audio track "${track.chapterTitle}" (${track.language.toUpperCase()}).`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/audio-tracks/${encodeURIComponent(track.id)}`,
        'PUT',
        { track: nextTrack }
      ).catch(() => {});
    },
    [appendAuditLog, user]
  );

  const updateAudioTrackStatus = useCallback(
    (trackId: string, status: AudioTrackStatus, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        audioTracks: prev.audioTracks.map((t) =>
          t.id === trackId ? { ...t, status, updatedAt: nowIso } : t
        ),
      }));
      appendAuditLog(
        actor,
        'AUDIO_STATUS_UPDATED',
        'audio_tracks',
        trackId,
        `Set audio track ${trackId} status to ${status}.`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/audio-tracks/${encodeURIComponent(trackId)}/status`,
        'PATCH',
        { status }
      ).catch(() => {});
    },
    [appendAuditLog]
  );

  const assignUserRole = useCallback(
    (uid: string, email: string, displayName: string, role: AccountRole, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => {
        const nextDir = prev.userDirectory.map((u) =>
          u.uid === uid || u.email.toLowerCase() === email.toLowerCase()
            ? { ...u, role, updatedAt: nowIso }
            : u
        );

        let nextStaff = prev.staffRoles.filter(
          (s) => s.uid !== uid && s.email.toLowerCase() !== email.toLowerCase()
        );
        if (role !== 'user') {
          nextStaff = [
            {
              uid,
              email,
              displayName,
              role,
              assignedBy: actor.email,
              active: true,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ...nextStaff,
          ];
        }
        return { ...prev, userDirectory: nextDir, staffRoles: nextStaff };
      });
      appendAuditLog(
        actor,
        'ROLE_ASSIGNED',
        'staff_roles',
        uid,
        `Assigned role "${role}" to ${email}.`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/staff-roles/${encodeURIComponent(uid)}`,
        'PUT',
        {
          email,
          displayName,
          role,
          assignedBy: user?.email ?? actor.email,
        }
      ).catch(() => {});
    },
    [appendAuditLog, user]
  );

  const updateUserAccountStatus = useCallback(
    (uid: string, status: AccountStatus, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        userDirectory: prev.userDirectory.map((u) =>
          u.uid === uid ? { ...u, status, updatedAt: nowIso } : u
        ),
      }));
      appendAuditLog(
        actor,
        'USER_STATUS_CHANGED',
        'user_directory',
        uid,
        `Marked account ${uid} as ${status}.`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/users/${encodeURIComponent(uid)}/status`,
        'PATCH',
        { status }
      ).catch(() => {});
    },
    [appendAuditLog]
  );

  // Mobile Studio -> Community Text-Only AI Moderated Post Creation
  const createModeratedCommunityPost = useCallback(
    async (
      content: string,
      tag: string,
      bookId: string,
      chapterId: string,
      author: { uid: string; displayName: string; email: string }
    ): Promise<CommunityModerationResponse & { post?: ModerationCommunityPost }> => {
      const response = await fetch('/api/community/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const verdict = (await response.json()) as CommunityModerationResponse;
      if (!verdict.allowed) {
        return verdict;
      }

      const postId = `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();
      const initials =
        author.displayName
          .split(/\s+/)
          .map((w) => w[0] ?? '')
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'CR';
      const handle = `@${author.email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').slice(0, 20)}`;

      const post: ModerationCommunityPost = {
        id: postId,
        authorId: user?.uid ?? author.uid,
        authorName: author.displayName,
        authorHandle: handle,
        authorInitials: initials,
        authorTone: 'bg-blue-600',
        tag: tag.trim() || 'Constitutional Discussion',
        content: content.trim(),
        bookId: bookId || 'constitution-india',
        chapterId: chapterId || 'ind-preamble-rights',
        likesCount: 0,
        moderationStatus: 'approved',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setState((prev) => ({
        ...prev,
        communityPosts: [post, ...prev.communityPosts],
      }));

      void supabaseCmsRequest(
        `/api/supabase/cms/community-posts/${encodeURIComponent(postId)}`,
        'PUT',
        { post }
      ).catch(() => {});

      return { ...verdict, post };
    },
    [user]
  );

  const moderateCommunityPost = useCallback(
    (postId: string, moderationStatus: 'approved' | 'removed', actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        communityPosts: prev.communityPosts.map((p) =>
          p.id === postId ? { ...p, moderationStatus, updatedAt: nowIso } : p
        ),
      }));
      appendAuditLog(
        actor,
        moderationStatus === 'removed' ? 'COMMUNITY_POST_REMOVED' : 'COMMUNITY_POST_RESTORED',
        'community_posts',
        postId,
        `Set community post ${postId} moderation status to ${moderationStatus}.`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/community-posts/${encodeURIComponent(postId)}/moderate`,
        'PATCH',
        { moderationStatus }
      ).catch(() => {});
    },
    [appendAuditLog]
  );

  const createSupportTicket = useCallback(
    (
      input: { category: TicketCategory; subject: string; description: string; priority?: TicketPriority },
      author: { uid: string; email: string; displayName: string }
    ): SupportTicket => {
      const ticketId = `tkt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const nowIso = new Date().toISOString();
      const ticket: SupportTicket = {
        id: ticketId,
        userId: user?.uid ?? author.uid,
        userEmail: user?.email ?? author.email,
        userName: user?.displayName ?? author.displayName,
        category: input.category,
        subject: input.subject.trim(),
        description: input.description.trim(),
        status: 'open',
        priority: input.priority ?? 'medium',
        assignedTo: '',
        resolutionNote: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setState((prev) => ({
        ...prev,
        supportTickets: [ticket, ...prev.supportTickets],
      }));

      void supabaseCmsRequest(
        `/api/supabase/cms/support-tickets/${encodeURIComponent(ticketId)}`,
        'PUT',
        { ticket }
      ).catch(() => {});
      return ticket;
    },
    [user]
  );

  const updateSupportTicket = useCallback(
    (
      ticketId: string,
      updates: { status?: TicketStatus; priority?: TicketPriority; resolutionNote?: string; assignedTo?: string },
      actor: StaffActor
    ) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        supportTickets: prev.supportTickets.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                ...updates,
                assignedTo: updates.assignedTo ?? (t.assignedTo || actor.email),
                updatedAt: nowIso,
              }
            : t
        ),
      }));
      appendAuditLog(
        actor,
        'TICKET_UPDATED',
        'support_tickets',
        ticketId,
        `Updated support ticket ${ticketId} (status: ${updates.status ?? 'unchanged'}).`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/support-tickets/${encodeURIComponent(ticketId)}`,
        'PATCH',
        updates
      ).catch(() => {});
    },
    [appendAuditLog]
  );

  const upsertSourceRight = useCallback(
    (record: SourceRightRecord, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const next: SourceRightRecord = { ...record, updatedBy: actor.email, updatedAt: nowIso };
      setState((prev) => {
        const exists = prev.sourcesRights.some((r) => r.id === record.id);
        return {
          ...prev,
          sourcesRights: exists
            ? prev.sourcesRights.map((r) => (r.id === record.id ? next : r))
            : [next, ...prev.sourcesRights],
        };
      });
      appendAuditLog(
        actor,
        'SOURCE_RIGHT_SAVED',
        'sources_rights',
        record.id,
        `Updated citation & rights for "${record.bookTitle}" (${record.licenseType}).`
      );
      void supabaseCmsRequest(
        `/api/supabase/cms/sources-rights/${encodeURIComponent(record.id)}`,
        'PUT',
        { record: next }
      ).catch(() => {});
    },
    [appendAuditLog]
  );

  const updateSystemSettings = useCallback(
    (updates: Partial<SystemSettingsRecord>, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const merged: SystemSettingsRecord = {
        ...state.systemSettings,
        ...updates,
        updatedBy: user?.email ?? actor.email,
        updatedAt: nowIso,
      };
      setState((prev) => ({
        ...prev,
        systemSettings: merged,
      }));
      appendAuditLog(
        actor,
        'SETTINGS_UPDATED',
        'system_settings',
        'global',
        `Updated dashboard system settings (${Object.keys(updates).join(', ')}).`
      );
      void supabaseCmsRequest('/api/supabase/cms/system-settings', 'PUT', {
        settings: merged,
      }).catch(() => {});
    },
    [appendAuditLog, state.systemSettings, user]
  );

  return {
    ...state,
    currentAccountRole,
    publishedLawBooks,
    upsertCmsBook,
    bulkImportBooks,
    reviewCmsBook,
    deleteCmsBook,
    addChapterToBook,
    upsertClauseInBook,
    deleteClauseInBook,
    upsertContentAudioMetadata,
    deleteContentAudioMetadata,
    updateContentAudioStatus,
    upsertAudioTrack,
    updateAudioTrackStatus,
    assignUserRole,
    updateUserAccountStatus,
    createModeratedCommunityPost,
    moderateCommunityPost,
    createSupportTicket,
    updateSupportTicket,
    upsertSourceRight,
    updateSystemSettings,
  };
}
