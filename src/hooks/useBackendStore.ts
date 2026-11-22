import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
        'Confirmed: all notes, highlights, and bookmarks are stored in your private Firestore user profile and restore automatically on Google sign-in.',
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

function tsToIso(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
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

  // Listen to live published CMS books & approved Community posts from Firestore (public read allowed!)
  useEffect(() => {
    const qBooks = query(collection(db, 'cmsBooks'), where('status', '==', 'published'));
    const unsubBooks = onSnapshot(
      qBooks,
      (snap) => {
        if (snap.empty) return;
        const remoteBooks: CmsBook[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...(data as unknown as CmsBook),
            id: d.id,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        setState((prev) => {
          const map = new Map(prev.cmsBooks.map((b) => [b.id, b]));
          remoteBooks.forEach((rb) => map.set(rb.id, rb));
          return { ...prev, cmsBooks: Array.from(map.values()) };
        });
      },
      () => {
        // Silently rely on seeded/cached catalog if offline
      }
    );

    const qPosts = query(collection(db, 'communityPosts'), where('moderationStatus', '==', 'approved'));
    const unsubPosts = onSnapshot(
      qPosts,
      (snap) => {
        if (snap.empty) return;
        const remotePosts: ModerationCommunityPost[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...(data as unknown as ModerationCommunityPost),
            id: d.id,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        setState((prev) => {
          const map = new Map(prev.communityPosts.map((p) => [p.id, p]));
          remotePosts.forEach((rp) => map.set(rp.id, rp));
          return {
            ...prev,
            communityPosts: Array.from(map.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt)
            ),
          };
        });
      },
      () => {
        // Silently rely on cached community posts if offline
      }
    );

    const qContentAudio = query(
      collection(db, 'contentAudioMetadata'),
      where('status', '==', 'published')
    );
    const unsubContentAudio = onSnapshot(
      qContentAudio,
      (snap) => {
        if (snap.empty) return;
        const remoteAudio: ContentAudioMetadataRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return sanitizeContentAudioMetadataRecord({
            ...(data as unknown as ContentAudioMetadataRecord),
            id: d.id,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
            firestoreSynced: true,
          });
        });
        setState((prev) => {
          const map = new Map(prev.contentAudioMetadata.map((item) => [item.id, item]));
          remoteAudio.forEach((item) => map.set(item.id, item));
          return {
            ...prev,
            contentAudioMetadata: Array.from(map.values()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt)
            ),
          };
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'contentAudioMetadata');
        } catch {
          // Gracefully retain cached metadata when offline
        }
      }
    );

    return () => {
      unsubBooks();
      unsubPosts();
      unsubContentAudio();
    };
  }, []);

  // Record authenticated Google user in userDirectory & subscribe to user's own tickets + admin streams
  useEffect(() => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const resolvedRole = resolveUserRole(user.email, user.uid, state.staffRoles);

    // Update local directory immediately
    setState((prev) => {
      const existing = prev.userDirectory.find((u) => u.uid === user.uid || u.email === user.email);
      const entry: UserDirectoryRecord = {
        uid: user.uid,
        displayName: user.displayName ?? existing?.displayName ?? 'Civic Reader',
        email: user.email ?? existing?.email ?? '',
        photoURL: user.photoURL ?? '',
        provider: user.providerData?.[0]?.providerId ?? 'google.com',
        role: resolvedRole,
        status: existing?.status ?? 'active',
        lastLoginAt: nowIso,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      const filtered = prev.userDirectory.filter((u) => u.uid !== user.uid && u.email !== entry.email);
      return { ...prev, userDirectory: [entry, ...filtered] };
    });

    // Upsert to Firestore userDirectory/{uid} (allowed by firestore.rules!)
    const dirRef = doc(db, 'userDirectory', user.uid);
    void setDoc(
      dirRef,
      {
        uid: user.uid,
        displayName: user.displayName ?? 'Civic Reader',
        email: user.email ?? '',
        photoURL: user.photoURL ?? '',
        provider: user.providerData?.[0]?.providerId ?? 'google.com',
        role: resolvedRole === 'admin' ? 'admin' : 'user',
        status: 'active',
        lastLoginAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {
      // Ignore if rules reject merge on existing timestamps; fallback update
      void updateDoc(dirRef, {
        displayName: user.displayName ?? 'Civic Reader',
        photoURL: user.photoURL ?? '',
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    });

    // Listen to user's own support tickets (or all tickets if bootstrapped admin)
    const isBootstrapAdmin = (user.email ?? '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
    const ticketQuery = isBootstrapAdmin
      ? query(collection(db, 'supportTickets'))
      : query(collection(db, 'supportTickets'), where('userId', '==', user.uid));

    const unsubTickets = onSnapshot(
      ticketQuery,
      (snap) => {
        if (snap.empty) return;
        const remoteTickets: SupportTicket[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...(data as unknown as SupportTicket),
            id: d.id,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        setState((prev) => {
          const map = new Map(prev.supportTickets.map((t) => [t.id, t]));
          remoteTickets.forEach((rt) => map.set(rt.id, rt));
          return {
            ...prev,
            supportTickets: Array.from(map.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt)
            ),
          };
        });
      },
      () => {}
    );

    const staffAudioQuery = isBootstrapAdmin
      ? query(collection(db, 'contentAudioMetadata'))
      : query(collection(db, 'contentAudioMetadata'), where('uploadedByUid', '==', user.uid));

    const unsubStaffAudio = onSnapshot(
      staffAudioQuery,
      (snap) => {
        if (snap.empty) return;
        const remoteAudio: ContentAudioMetadataRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return sanitizeContentAudioMetadataRecord({
            ...(data as unknown as ContentAudioMetadataRecord),
            id: d.id,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
            firestoreSynced: true,
          });
        });
        setState((prev) => {
          const map = new Map(prev.contentAudioMetadata.map((item) => [item.id, item]));
          remoteAudio.forEach((item) => map.set(item.id, item));
          return {
            ...prev,
            contentAudioMetadata: Array.from(map.values()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt)
            ),
          };
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'contentAudioMetadata');
        } catch {
          // Gracefully retain cached metadata if not yet authorized
        }
      }
    );

    return () => {
      unsubTickets();
      unsubStaffAudio();
    };
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
        actorUid: actor.uid,
        actorEmail: actor.email,
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

      if (user) {
        void setDoc(doc(db, 'auditLogs', logId), {
          actorUid: user.uid,
          actorEmail: user.email ?? actor.email,
          actorRole: actor.role,
          action,
          targetType,
          targetId,
          summary,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [user]
  );

  const upsertCmsBook = useCallback(
    (book: CmsBook, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const updatedBook: CmsBook = { ...book, updatedAt: nowIso };
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
        'cmsBooks',
        book.id,
        `Saved "${book.shortTitle}" (status: ${book.status}, ${book.chapters.length} chapters).`
      );
      if (user) {
        const { coverImage: _omitCover, ...firestorePayload } = updatedBook;
        void setDoc(doc(db, 'cmsBooks', book.id), {
          ...firestorePayload,
          createdByUid: user.uid,
          createdByEmail: user.email ?? actor.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
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
        'cmsBooks',
        books.map((b) => b.id).join(',').slice(0, 100) || 'bulk',
        `Bulk imported ${books.length} book(s): ${books.map((b) => b.shortTitle).join(', ').slice(0, 220)}.`
      );
      if (user) {
        books.forEach((book) => {
          const { coverImage: _omitCover, ...firestorePayload } = book;
          void setDoc(doc(db, 'cmsBooks', book.id), {
            ...firestorePayload,
            createdByUid: user.uid,
            createdByEmail: user.email ?? actor.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        });
      }
    },
    [appendAuditLog, user]
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
        'cmsBooks',
        bookId,
        `Updated "${targetName}" to ${nextStatus}.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`
      );
      if (user) {
        void updateDoc(doc(db, 'cmsBooks', bookId), {
          status: nextStatus,
          reviewedByEmail: user.email ?? actor.email,
          reviewNotes,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [appendAuditLog, user]
  );

  const deleteCmsBook = useCallback(
    (bookId: string, actor: StaffActor) => {
      setState((prev) => ({
        ...prev,
        cmsBooks: prev.cmsBooks.filter((b) => b.id !== bookId),
      }));
      appendAuditLog(actor, 'BOOK_DELETED', 'cmsBooks', bookId, `Deleted book ${bookId} from CMS.`);
      if (user) {
        void deleteDoc(doc(db, 'cmsBooks', bookId)).catch(() => {});
      }
    },
    [appendAuditLog, user]
  );

  const syncBookChaptersToFirestore = useCallback(
    async (bookSnapshot: CmsBook, actor: StaffActor) => {
      if (!user) return;
      const bookRef = doc(db, 'cmsBooks', bookSnapshot.id);
      try {
        const existingSnap = await getDoc(bookRef);
        if (existingSnap.exists()) {
          await updateDoc(bookRef, {
            chapters: bookSnapshot.chapters,
            updatedAt: serverTimestamp(),
          });
        } else {
          const { coverImage: _omitCover, ...firestorePayload } = bookSnapshot;
          await setDoc(bookRef, {
            ...firestorePayload,
            createdByUid: user.uid,
            createdByEmail: user.email ?? actor.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, `cmsBooks/${bookSnapshot.id}`);
        } catch {
          // Keep local state resilient if offline or role-restricted
        }
      }
    },
    [user]
  );

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
        'cmsBooks',
        bookId,
        `Added chapter "${chapter.title.en}" to book ${bookId}.`
      );
      if (updatedSnapshot) {
        void syncBookChaptersToFirestore(updatedSnapshot, actor);
      }
    },
    [appendAuditLog, syncBookChaptersToFirestore]
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
        'cmsBooks',
        `${bookId}/${clause.id}`,
        `Saved ${clause.number} ("${clause.principle.en}") in ${bookId}.`
      );
      if (updatedSnapshot) {
        void syncBookChaptersToFirestore(updatedSnapshot, actor);
      }
    },
    [appendAuditLog, syncBookChaptersToFirestore]
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
      appendAuditLog(actor, 'CLAUSE_DELETED', 'cmsBooks', `${bookId}/${clauseId}`, `Removed clause ${clauseId}.`);
      if (updatedSnapshot) {
        void syncBookChaptersToFirestore(updatedSnapshot, actor);
      }
    },
    [appendAuditLog, syncBookChaptersToFirestore]
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
        'contentAudioMetadata',
        sanitized.id,
        `Linked ${sanitized.fileName} (${sanitized.blockRole}, ${sanitized.language.toUpperCase()}) to ${sanitized.contentNodeNumber} (${sanitized.contentNodeId}).`
      );

      if (!user) {
        return { record: sanitized, firestoreSynced: false };
      }

      const audioDocRef = doc(db, 'contentAudioMetadata', sanitized.id);
      const { firestoreSynced: _omitSync, createdAt: _omitCreated, updatedAt: _omitUpdated, ...baseFields } = sanitized;

      try {
        const existingDoc = await getDoc(audioDocRef);
        if (existingDoc.exists()) {
          const { id: _omitId, uploadedByUid: _omitUid, uploadedByEmail: _omitEmail, ...mutableFields } = baseFields;
          await updateDoc(audioDocRef, {
            ...mutableFields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(audioDocRef, {
            ...baseFields,
            uploadedByUid: user.uid,
            uploadedByEmail: user.email ?? actor.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (updatedCmsBook) {
          await syncBookChaptersToFirestore(updatedCmsBook, actor);
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
        try {
          handleFirestoreError(error, OperationType.WRITE, `contentAudioMetadata/${sanitized.id}`);
        } catch (wrapped) {
          return {
            record: sanitized,
            firestoreSynced: false,
            error: wrapped instanceof Error ? wrapped.message : String(error),
          };
        }
        return { record: sanitized, firestoreSynced: false };
      }
    },
    [appendAuditLog, syncBookChaptersToFirestore, user]
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
        'contentAudioMetadata',
        audioId,
        `Removed linked audio metadata ${audioId}.`
      );

      if (user) {
        try {
          await deleteDoc(doc(db, 'contentAudioMetadata', audioId));
          if (updatedCmsBook) {
            await syncBookChaptersToFirestore(updatedCmsBook, actor);
          }
        } catch (error) {
          try {
            handleFirestoreError(error, OperationType.DELETE, `contentAudioMetadata/${audioId}`);
          } catch {
            // Keep local deletion resilient
          }
        }
      }
    },
    [appendAuditLog, syncBookChaptersToFirestore, user]
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
        'contentAudioMetadata',
        audioId,
        `Set linked node audio ${audioId} status to ${status}.`
      );
      if (user) {
        try {
          await updateDoc(doc(db, 'contentAudioMetadata', audioId), {
            status,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `contentAudioMetadata/${audioId}`);
          } catch {
            // Keep local state resilient
          }
        }
      }
    },
    [appendAuditLog, user]
  );

  const upsertAudioTrack = useCallback(
    (track: AudioTrackRecord, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      const nextTrack: AudioTrackRecord = { ...track, updatedAt: nowIso };
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
        'audioTracks',
        track.id,
        `Uploaded/updated audio track "${track.chapterTitle}" (${track.language.toUpperCase()}).`
      );
      if (user) {
        void setDoc(doc(db, 'audioTracks', track.id), {
          ...nextTrack,
          uploadedByUid: user.uid,
          uploadedByEmail: user.email ?? actor.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
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
        'audioTracks',
        trackId,
        `Set audio track ${trackId} status to ${status}.`
      );
      if (user) {
        void updateDoc(doc(db, 'audioTracks', trackId), {
          status,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [appendAuditLog, user]
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
        'staffRoles',
        uid,
        `Assigned role "${role}" to ${email}.`
      );
      if (user) {
        if (role === 'user') {
          void deleteDoc(doc(db, 'staffRoles', uid)).catch(() => {});
        } else {
          void setDoc(doc(db, 'staffRoles', uid), {
            uid,
            email,
            displayName,
            role,
            assignedBy: user.email ?? actor.email,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        void updateDoc(doc(db, 'userDirectory', uid), {
          role,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
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
        'userDirectory',
        uid,
        `Marked account ${uid} as ${status}.`
      );
      if (user) {
        void updateDoc(doc(db, 'userDirectory', uid), {
          status,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [appendAuditLog, user]
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
      const initials = author.displayName
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'CR';
      const handle = `@${author.email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').slice(0, 20)}`;

      const post: ModerationCommunityPost = {
        id: postId,
        authorId: author.uid,
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

      if (user) {
        void setDoc(doc(db, 'communityPosts', postId), {
          authorId: user.uid,
          authorName: post.authorName,
          authorHandle: post.authorHandle,
          authorInitials: post.authorInitials,
          authorTone: post.authorTone,
          tag: post.tag,
          content: post.content,
          bookId: post.bookId,
          chapterId: post.chapterId,
          likesCount: 0,
          moderationStatus: 'approved',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

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
        'communityPosts',
        postId,
        `Set community post ${postId} moderation status to ${moderationStatus}.`
      );
      if (user) {
        void updateDoc(doc(db, 'communityPosts', postId), {
          moderationStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [appendAuditLog, user]
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
        userId: author.uid,
        userEmail: author.email,
        userName: author.displayName,
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

      if (user) {
        void setDoc(doc(db, 'supportTickets', ticketId), {
          userId: user.uid,
          userEmail: user.email ?? author.email,
          userName: user.displayName ?? author.displayName,
          category: ticket.category,
          subject: ticket.subject,
          description: ticket.description,
          status: 'open',
          priority: ticket.priority,
          assignedTo: '',
          resolutionNote: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
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
        'supportTickets',
        ticketId,
        `Updated support ticket ${ticketId} (status: ${updates.status ?? 'unchanged'}).`
      );
      if (user) {
        void updateDoc(doc(db, 'supportTickets', ticketId), {
          ...updates,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [appendAuditLog, user]
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
        'sourcesRights',
        record.id,
        `Updated citation & rights for "${record.bookTitle}" (${record.licenseType}).`
      );
    },
    [appendAuditLog]
  );

  const updateSystemSettings = useCallback(
    (updates: Partial<SystemSettingsRecord>, actor: StaffActor) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        systemSettings: {
          ...prev.systemSettings,
          ...updates,
          updatedBy: actor.email,
          updatedAt: nowIso,
        },
      }));
      appendAuditLog(
        actor,
        'SETTINGS_UPDATED',
        'systemSettings',
        'global',
        `Updated dashboard system settings (${Object.keys(updates).join(', ')}).`
      );
      if (user) {
        void setDoc(
          doc(db, 'systemSettings', 'global'),
          {
            ...state.systemSettings,
            ...updates,
            updatedBy: user.email ?? actor.email,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      }
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
