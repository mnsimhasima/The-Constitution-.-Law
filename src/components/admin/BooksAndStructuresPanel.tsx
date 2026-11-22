import {
  BookMarked,
  BookOpen,
  BookPlus,
  Check,
  Code2,
  Copy,
  FileAudio,
  Globe,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  ContentAudioLanguageCode,
  ContentAudioMetadataRecord,
  ContentAudioNodeType,
  StaffRole,
} from '../../types/backend';
import {
  OTT_EDITION_LANGUAGES,
  type OttAudioBlockRole,
  type OttAudioEntityType,
  type OttBookType,
  type OttChapter,
  type OttEditionDetailTree,
  type OttLegalUnit,
  type OttMasterBookWithEditions,
} from '../../types/ott';
import {
  buildContentAudioDocId,
  findAudioMetadataForNode,
  formatAudioFileSize,
  mapOttBlockRoleToContentRole,
} from '../../utils/contentAudioMetadata';
import { uploadAudioFileForContentNode } from '../../utils/contentAudioUploadClient';
import { canCreateOrEditBook, canUnpublishOrDeleteBook } from '../../utils/rbacLogic';

interface BooksAndStructuresPanelProps {
  activeRole: StaffRole;
  actor: StaffActor;
  isFirebaseSignedIn?: boolean;
  contentAudioMetadata?: ContentAudioMetadataRecord[];
  onUpsertContentAudio?: (
    input: Omit<ContentAudioMetadataRecord, 'createdAt' | 'updatedAt' | 'firestoreSynced'>,
    actor: StaffActor
  ) => Promise<{ record: ContentAudioMetadataRecord; firestoreSynced: boolean; error?: string }>;
}

interface StructureFieldCopy {
  bookTypeLabel: string;
  bookTypeShort: string;
  structureSummary: string;
  unitSingular: string;
  unitPlural: string;
  unitNumberPlaceholder: string;
  unitTitlePlaceholder: string;
  definitionLabel: string;
  definitionPlaceholder: string;
  purposeLabel: string;
  purposePlaceholder: string;
  explanationLabel: string;
  explanationPlaceholder: string;
  examplesLabel: string;
  examplesPlaceholder: string;
  audioLabels: {
    full: string;
    definition: string;
    purpose: string;
    explanation: string;
    examples: string;
  };
}

function getStructureCopy(bookType: OttBookType): StructureFieldCopy {
  if (bookType === 'constitutional') {
    return {
      bookTypeLabel: 'Constitutional Book',
      bookTypeShort: 'Constitutional',
      structureSummary: 'Chapters / Parts → Articles (Title, Definition, Explanation, Examples)',
      unitSingular: 'Article',
      unitPlural: 'Articles',
      unitNumberPlaceholder: 'Article 1',
      unitTitlePlaceholder: 'Name and territory of the Union',
      definitionLabel: 'Constitutional Text / Definition',
      definitionPlaceholder: 'Exact article text or concise legal definition…',
      purposeLabel: 'Constituent Assembly Purpose / Background',
      purposePlaceholder: 'Why this constitutional article was enacted…',
      explanationLabel: 'Deep Explanation',
      explanationPlaceholder: 'Detailed constitutional doctrine and judicial interpretation…',
      examplesLabel: 'Practical Examples & Landmark Cases',
      examplesPlaceholder: 'Real-world illustrations or Supreme Court judgments…',
      audioLabels: {
        full: 'Full Article Audio',
        definition: 'Article Text / Definition Audio',
        purpose: 'Purpose & Background Audio',
        explanation: 'Deep Explanation Audio',
        examples: 'Practical Examples Audio',
      },
    };
  }
  if (bookType === 'general_law') {
    return {
      bookTypeLabel: 'General Law Book',
      bookTypeShort: 'General Law',
      structureSummary: 'Chapters → Sections (Title, Purpose, Detailed Explanation, Case Examples)',
      unitSingular: 'Section',
      unitPlural: 'Sections',
      unitNumberPlaceholder: 'Section 1',
      unitTitlePlaceholder: 'Short title, extent and commencement',
      definitionLabel: 'Statutory Definition / Bare Text',
      definitionPlaceholder: 'Statutory wording or core definition of this section…',
      purposeLabel: 'Purpose / Why This Section Was Introduced',
      purposePlaceholder: 'Legislative intent and problem addressed by this section…',
      explanationLabel: 'Detailed Explanation',
      explanationPlaceholder: 'Clause-by-clause commentary and procedural steps…',
      examplesLabel: 'Case Examples & Illustrations',
      examplesPlaceholder: 'Practical legal scenarios and landmark case illustrations…',
      audioLabels: {
        full: 'Full Section Audio',
        definition: 'Statutory Definition Audio',
        purpose: 'Legislative Purpose Audio',
        explanation: 'Detailed Explanation Audio',
        examples: 'Case Examples Audio',
      },
    };
  }
  return {
    bookTypeLabel: 'General / Biography Book',
    bookTypeShort: 'Biography / General',
    structureSummary: 'Chapters → Sub-sections / Topics (Title, Content, Notes, Highlights)',
    unitSingular: 'Topic',
    unitPlural: 'Sub-sections / Topics',
    unitNumberPlaceholder: 'Topic 1.1',
    unitTitlePlaceholder: 'Early Education and Columbia University Years',
    definitionLabel: 'Main Content / Narrative',
    definitionPlaceholder: 'Primary biographical or general book text for this topic…',
    purposeLabel: 'Historical Context / Theme',
    purposePlaceholder: 'Background context or central theme of this sub-section…',
    explanationLabel: 'Study Notes & Commentary',
    explanationPlaceholder: 'Detailed editorial notes, key takeaways, and reflections…',
    examplesLabel: 'Key Highlights, Dates & Milestones',
    examplesPlaceholder: 'Notable quotes, dates, speeches, or historical milestones…',
    audioLabels: {
      full: 'Full Topic Audio',
      definition: 'Main Content Audio',
      purpose: 'Historical Context Audio',
      explanation: 'Study Notes Audio',
      examples: 'Highlights & Milestones Audio',
    },
  };
}

interface DraftEditionRow {
  languageCode: string;
  title: string;
  subtitle: string;
  description: string;
  narratorName: string;
}

interface DraftUnitRow {
  unitNumber: string;
  title: string;
  definition: string;
  purposeBackground: string;
  deepExplanation: string;
  practicalExamples: string;
}

function ManualAudioUploadSlot({
  label,
  currentUrl,
  firestoreRecord,
  isFirebaseSignedIn,
  disabled,
  uploading,
  onUpload,
}: {
  label: string;
  currentUrl?: string;
  firestoreRecord?: ContentAudioMetadataRecord;
  isFirebaseSignedIn?: boolean;
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileAudio className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <p className="text-xs font-semibold text-slate-900">{label}</p>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                currentUrl
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {currentUrl ? '1-to-1 Bound' : 'Awaiting Audio'}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
            {currentUrl ? currentUrl : 'No manual audio file uploaded yet'}
          </p>
        </div>
        <label
          aria-label={`Upload ${label}`}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition ${
            disabled || uploading
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:border-blue-500 hover:text-blue-700'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>{uploading ? 'Uploading…' : currentUrl ? 'Replace File' : 'Upload Audio'}</span>
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/webm"
            disabled={disabled || uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void onUpload(file);
                e.target.value = '';
              }
            }}
          />
        </label>
      </div>
      {currentUrl && (
        <audio controls preload="none" src={currentUrl} className="mt-2.5 h-8 w-full" />
      )}
      {firestoreRecord && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-slate-200/70 pt-1.5 font-mono text-[10px] text-slate-500">
          <span className="truncate">
            Firestore: contentAudioMetadata/{firestoreRecord.id} · {firestoreRecord.fileName} (
            {firestoreRecord.durationLabel} · {formatAudioFileSize(firestoreRecord.byteSize)})
          </span>
          <span
            className={`font-sans font-semibold ${
              firestoreRecord.firestoreSynced ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {firestoreRecord.firestoreSynced
              ? 'Firestore Synced'
              : isFirebaseSignedIn
                ? 'Linked'
                : 'Linked Locally'}
          </span>
        </div>
      )}
    </div>
  );
}

export function BooksAndStructuresPanel({
  activeRole,
  actor,
  isFirebaseSignedIn = false,
  contentAudioMetadata = [],
  onUpsertContentAudio,
}: BooksAndStructuresPanelProps) {
  const canEdit = canCreateOrEditBook(activeRole);
  const canDelete = canUnpublishOrDeleteBook(activeRole);

  const [masterBooks, setMasterBooks] = useState<OttMasterBookWithEditions[]>([]);
  const [selectedMasterBookId, setSelectedMasterBookId] = useState<string>('');
  const [selectedEditionId, setSelectedEditionId] = useState<string>('');
  const [editionTree, setEditionTree] = useState<OttEditionDetailTree | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  const [typeFilter, setTypeFilter] = useState<'all' | OttBookType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Drawers / Forms
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [showAddEditionForm, setShowAddEditionForm] = useState(false);
  const [showAddChapterForm, setShowAddChapterForm] = useState(false);
  const [showAddUnitForm, setShowAddUnitForm] = useState(false);
  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [sqlSchemaText, setSqlSchemaText] = useState('');
  const [copiedSchema, setCopiedSchema] = useState(false);

  // Redesigned "Add New Book" unified form state
  const [newMasterTitle, setNewMasterTitle] = useState('');
  const [newMasterType, setNewMasterType] = useState<OttBookType>('constitutional');
  const [newMasterJurisdiction, setNewMasterJurisdiction] = useState('Republic of India');
  const [newMasterYear, setNewMasterYear] = useState('2026');
  const [draftEditions, setDraftEditions] = useState<DraftEditionRow[]>([
    {
      languageCode: 'en',
      title: '',
      subtitle: '',
      description: '',
      narratorName: 'Studio Narrator',
    },
  ]);
  const [includeInitialStructure, setIncludeInitialStructure] = useState(true);
  const [draftChapterNumber, setDraftChapterNumber] = useState('Part I · Chapter 1');
  const [draftChapterTitle, setDraftChapterTitle] = useState('');
  const [draftChapterOverview, setDraftChapterOverview] = useState('');
  const [draftUnits, setDraftUnits] = useState<DraftUnitRow[]>([
    {
      unitNumber: '',
      title: '',
      definition: '',
      purposeBackground: '',
      deepExplanation: '',
      practicalExamples: '',
    },
  ]);

  // Add Language Edition to existing Master Book
  const [newEditionLangCode, setNewEditionLangCode] = useState('te');
  const [newEditionTitle, setNewEditionTitle] = useState('');
  const [newEditionSubtitle, setNewEditionSubtitle] = useState('');
  const [newEditionDescription, setNewEditionDescription] = useState('');
  const [newEditionNarrator, setNewEditionNarrator] = useState('Native Language Narrator');

  // Add Chapter state
  const [newChapterNumber, setNewChapterNumber] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterOverview, setNewChapterOverview] = useState('');

  // Add Unit state
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDefinition, setNewUnitDefinition] = useState('');
  const [newUnitPurpose, setNewUnitPurpose] = useState('');
  const [newUnitExplanation, setNewUnitExplanation] = useState('');
  const [newUnitExamples, setNewUnitExamples] = useState('');

  // Inline edit state for selected chapter & selected unit
  const [editChapter, setEditChapter] = useState<{
    chapterNumber: string;
    title: string;
    overview: string;
  }>({ chapterNumber: '', title: '', overview: '' });

  const [editUnit, setEditUnit] = useState<{
    unitNumber: string;
    title: string;
    definition: string;
    purposeBackground: string;
    deepExplanation: string;
    practicalExamples: string;
  }>({
    unitNumber: '',
    title: '',
    definition: '',
    purposeBackground: '',
    deepExplanation: '',
    practicalExamples: '',
  });

  const loadMasterBooks = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/books-structures/master-books');
      if (!res.ok) throw new Error('Failed to load Books & Structures catalog.');
      const data = (await res.json()) as { masterBooks: OttMasterBookWithEditions[] };
      setMasterBooks(data.masterBooks);
      if (data.masterBooks.length > 0) {
        setSelectedMasterBookId((prev) =>
          prev && data.masterBooks.some((b) => b.id === prev) ? prev : data.masterBooks[0].id
        );
      }
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to reach Books & Structures API.',
      });
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadEditionTree = useCallback(async (editionId: string) => {
    if (!editionId) {
      setEditionTree(null);
      return;
    }
    setLoadingTree(true);
    try {
      const res = await fetch(`/api/books-structures/editions/${encodeURIComponent(editionId)}`);
      if (!res.ok) throw new Error('Failed to load edition chapters and content units.');
      const tree = (await res.json()) as OttEditionDetailTree;
      setEditionTree(tree);
      setSelectedChapterId((prev) => {
        if (prev && tree.chapters.some((c) => c.id === prev)) return prev;
        return tree.chapters[0]?.id ?? '';
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to load edition details.',
      });
    } finally {
      setLoadingTree(false);
    }
  }, []);

  useEffect(() => {
    void loadMasterBooks();
  }, [loadMasterBooks]);

  const filteredMasterBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return masterBooks.filter((book) => {
      if (typeFilter !== 'all' && book.bookType !== typeFilter) return false;
      if (!q) return true;
      return (
        book.canonicalTitle.toLowerCase().includes(q) ||
        book.jurisdiction.toLowerCase().includes(q) ||
        book.editions.some(
          (ed) =>
            ed.title.toLowerCase().includes(q) ||
            ed.languageName.toLowerCase().includes(q) ||
            ed.languageNativeName.toLowerCase().includes(q)
        )
      );
    });
  }, [masterBooks, typeFilter, searchQuery]);

  const selectedMasterBook = useMemo(
    () => masterBooks.find((m) => m.id === selectedMasterBookId) ?? null,
    [masterBooks, selectedMasterBookId]
  );

  // Sync selected edition when Master Book changes
  useEffect(() => {
    if (!selectedMasterBook) {
      setSelectedEditionId('');
      setEditionTree(null);
      return;
    }
    if (!selectedMasterBook.editions.some((e) => e.id === selectedEditionId)) {
      const firstId = selectedMasterBook.editions[0]?.id ?? '';
      setSelectedEditionId(firstId);
    }
  }, [selectedMasterBook, selectedEditionId]);

  useEffect(() => {
    if (selectedEditionId) {
      void loadEditionTree(selectedEditionId);
    } else {
      setEditionTree(null);
    }
  }, [selectedEditionId, loadEditionTree]);

  const activeChapter: OttChapter | null = useMemo(() => {
    if (!editionTree) return null;
    return editionTree.chapters.find((c) => c.id === selectedChapterId) ?? editionTree.chapters[0] ?? null;
  }, [editionTree, selectedChapterId]);

  useEffect(() => {
    if (activeChapter) {
      setEditChapter({
        chapterNumber: activeChapter.chapterNumber,
        title: activeChapter.title,
        overview: activeChapter.overview,
      });
      setSelectedUnitId((prev) =>
        prev && activeChapter.units.some((u) => u.id === prev)
          ? prev
          : activeChapter.units[0]?.id ?? ''
      );
    } else {
      setEditChapter({ chapterNumber: '', title: '', overview: '' });
      setSelectedUnitId('');
    }
  }, [activeChapter]);

  const activeUnit: OttLegalUnit | null = useMemo(() => {
    if (!activeChapter) return null;
    return activeChapter.units.find((u) => u.id === selectedUnitId) ?? activeChapter.units[0] ?? null;
  }, [activeChapter, selectedUnitId]);

  useEffect(() => {
    if (activeUnit) {
      setEditUnit({
        unitNumber: activeUnit.unitNumber,
        title: activeUnit.title,
        definition: activeUnit.definition,
        purposeBackground: activeUnit.purposeBackground,
        deepExplanation: activeUnit.deepExplanation,
        practicalExamples: activeUnit.practicalExamples,
      });
    } else {
      setEditUnit({
        unitNumber: '',
        title: '',
        definition: '',
        purposeBackground: '',
        deepExplanation: '',
        practicalExamples: '',
      });
    }
  }, [activeUnit]);

  const activeCopy = getStructureCopy(selectedMasterBook?.bookType ?? 'constitutional');
  const draftCopy = getStructureCopy(newMasterType);

  const loadPreset = (kind: OttBookType) => {
    setNewMasterType(kind);
    setIncludeInitialStructure(true);
    if (kind === 'constitutional') {
      setNewMasterTitle('Directive Principles & Fundamental Duties Compendium');
      setNewMasterJurisdiction('Republic of India');
      setNewMasterYear('1950');
      setDraftEditions([
        {
          languageCode: 'en',
          title: 'Directive Principles & Fundamental Duties',
          subtitle: 'Part IV & Part IV-A Constitutional Study Edition',
          description:
            'Authoritative study edition covering State policy principles and citizen duties with manual audio narration.',
          narratorName: 'Dr. Rameshwar Rao',
        },
        {
          languageCode: 'te',
          title: 'ఆదేశిక సూత్రాలు మరియు ప్రాథమిక విధులు',
          subtitle: 'భారత రాజ్యాంగం — తెలుగు విశ్లేషణ',
          description:
            'రాష్ట్ర విధాన ఆదేశిక సూత్రాలు మరియు పౌరుల ప్రాథమిక విధుల సమగ్ర తెలుగు ఎడిషన్.',
          narratorName: 'శ్రీ లక్ష్మీనారాయణ',
        },
      ]);
      setDraftChapterNumber('Part IV');
      setDraftChapterTitle('Directive Principles of State Policy');
      setDraftChapterOverview(
        'Guidelines laid down in Part IV for the State to secure a social order promoting welfare of the people.'
      );
      setDraftUnits([
        {
          unitNumber: 'Article 39A',
          title: 'Equal justice and free legal aid',
          definition:
            'The State shall secure that the operation of the legal system promotes justice, on a basis of equal opportunity, and shall provide free legal aid.',
          purposeBackground:
            'Inserted by the 42nd Constitutional Amendment (1976) to ensure no citizen is denied justice by reason of economic or other disabilities.',
          deepExplanation:
            'Article 39A is the constitutional bedrock for NALSA and Lok Adalats across India, turning access to justice into an affirmative State responsibility.',
          practicalExamples:
            'Hussainara Khatoon v. State of Bihar (1979): Free legal aid recognized as essential to reasonable, fair, and just procedure under Article 21.',
        },
      ]);
    } else if (kind === 'general_law') {
      setNewMasterTitle('Consumer Protection Act, 2019');
      setNewMasterJurisdiction('Republic of India');
      setNewMasterYear('2019');
      setDraftEditions([
        {
          languageCode: 'en',
          title: 'Consumer Protection Act, 2019',
          subtitle: 'Statutory Rights, E-Commerce & Redressal Commissions',
          description:
            'Comprehensive guide to consumer rights, unfair trade practices, and three-tier redressal forums.',
          narratorName: 'Adv. Meera Sundaram',
        },
        {
          languageCode: 'hi',
          title: 'उपभोक्ता संरक्षण अधिनियम, 2019',
          subtitle: 'उपभोक्ता अधिकार एवं निवारण आयोग',
          description:
            'उपभोक्ता अधिकारों, अनुचित व्यापार प्रथाओं और निवारण प्रक्रियाओं का हिंदी संस्करण।',
          narratorName: 'अधिवक्ता संजय शर्मा',
        },
      ]);
      setDraftChapterNumber('Chapter I');
      setDraftChapterTitle('Preliminary & Consumer Rights');
      setDraftChapterOverview(
        'Establishes statutory definitions of consumer, defect, deficiency, and the six foundational consumer rights.'
      );
      setDraftUnits([
        {
          unitNumber: 'Section 2(9)',
          title: 'Definition of Consumer Rights',
          definition:
            'Enumerates six statutory rights including protection against hazardous goods, right to be informed, right to choose, right to be heard, and right to redressal.',
          purposeBackground:
            'Codifies consumer empowerment explicitly in the digital marketplace and e-commerce era.',
          deepExplanation:
            'Covers both offline purchases and online e-commerce transactions, enabling consumers to file complaints electronically from their place of residence.',
          practicalExamples:
            'A buyer receiving a defective smartphone from an online marketplace can file an e-Daakhil complaint before the District Consumer Commission.',
        },
      ]);
    } else {
      setNewMasterTitle('Dr. B.R. Ambedkar: Speeches & Constitutional Debates');
      setNewMasterJurisdiction('Historical Biography · India');
      setNewMasterYear('1956');
      setDraftEditions([
        {
          languageCode: 'en',
          title: 'Dr. B.R. Ambedkar: Speeches & Constitutional Debates',
          subtitle: 'Life Milestones, Columbia & LSE Scholarship, and the Constituent Assembly',
          description:
            'Manually curated biography and study notes documenting Babasaheb Ambedkar’s intellectual journey and constitutional vision.',
          narratorName: 'Prof. Arvind Deshmukh',
        },
        {
          languageCode: 'te',
          title: 'డా. బి.ఆర్. అంబేద్కర్: ప్రసంగాలు మరియు రాజ్యాంగ చర్చలు',
          subtitle: 'జీవిత విశేషాలు మరియు రాజ్యాంగ సభ కృషి',
          description:
            'బాబాసాహెబ్ అంబేద్కర్ గారి జీవిత చరిత్ర, విద్యాభ్యాసం మరియు రాజ్యాంగ నిర్మాణంపై తెలుగు గ్రంథం.',
          narratorName: 'డా. సురేష్ బాబు',
        },
      ]);
      setDraftChapterNumber('Chapter 1');
      setDraftChapterTitle('Foundations of Liberty, Equality & Fraternity');
      setDraftChapterOverview(
        'Explores how Dr. Ambedkar synthesized Buddhist ethics and modern constitutionalism into India’s democratic blueprint.'
      );
      setDraftUnits([
        {
          unitNumber: 'Topic 1.1',
          title: 'The Grammar of Anarchy Speech (25 November 1949)',
          definition:
            'In his final address to the Constituent Assembly, Dr. Ambedkar cautioned that political democracy cannot endure without social and economic democracy.',
          purposeBackground:
            'Delivered on the eve of adopting the Constitution of India on 26 November 1949.',
          deepExplanation:
            'Study Notes: Emphasized holding fast to constitutional methods of achieving social and economic objectives and rejecting hero-worship in politics.',
          practicalExamples:
            'Milestone: 25 November 1949 — Closing Constituent Assembly speech; 26 January 1950 — Constitution enters into force.',
        },
      ]);
    }
  };

  const resetAddBookForm = () => {
    setNewMasterTitle('');
    setNewMasterType('constitutional');
    setNewMasterJurisdiction('Republic of India');
    setNewMasterYear('2026');
    setDraftEditions([
      {
        languageCode: 'en',
        title: '',
        subtitle: '',
        description: '',
        narratorName: 'Studio Narrator',
      },
    ]);
    setIncludeInitialStructure(true);
    setDraftChapterNumber('Part I · Chapter 1');
    setDraftChapterTitle('');
    setDraftChapterOverview('');
    setDraftUnits([
      {
        unitNumber: '',
        title: '',
        definition: '',
        purposeBackground: '',
        deepExplanation: '',
        practicalExamples: '',
      },
    ]);
  };

  const handleCreateBookBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newMasterTitle.trim()) return;
    setBusyAction('create-book');
    setNotice(null);

    try {
      const cleanedEditions = draftEditions
        .map((row) => {
          const langMeta =
            OTT_EDITION_LANGUAGES.find((l) => l.code === row.languageCode) ??
            OTT_EDITION_LANGUAGES[0];
          return {
            languageCode: langMeta.code,
            languageName: langMeta.name,
            languageNativeName: langMeta.nativeName,
            title: row.title.trim() || newMasterTitle.trim(),
            subtitle: row.subtitle.trim() || undefined,
            description:
              row.description.trim() ||
              `Manually authored ${langMeta.name} edition of ${newMasterTitle.trim()}.`,
            narratorName: row.narratorName.trim() || 'Studio Narrator',
          };
        })
        .filter((ed, idx, arr) => arr.findIndex((x) => x.languageCode === ed.languageCode) === idx);

      const cleanedUnits = draftUnits
        .filter((u) => u.unitNumber.trim() && u.title.trim() && u.definition.trim())
        .map((u) => ({
          unitNumber: u.unitNumber.trim(),
          title: u.title.trim(),
          definition: u.definition.trim(),
          purposeBackground: u.purposeBackground.trim(),
          deepExplanation: u.deepExplanation.trim(),
          practicalExamples: u.practicalExamples.trim(),
        }));

      const payload: Record<string, unknown> = {
        canonicalTitle: newMasterTitle.trim(),
        bookType: newMasterType,
        jurisdiction: newMasterJurisdiction.trim() || 'Republic of India',
        year: Number(newMasterYear) || new Date().getFullYear(),
        editions: cleanedEditions,
      };

      if (includeInitialStructure && draftChapterTitle.trim()) {
        payload.initialChapter = {
          chapterNumber: draftChapterNumber.trim() || 'Chapter 1',
          title: draftChapterTitle.trim(),
          overview: draftChapterOverview.trim(),
        };
        if (cleanedUnits.length > 0) {
          payload.initialUnits = cleanedUnits;
        }
      }

      const res = await fetch('/api/books-structures/master-books/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create book.');

      await loadMasterBooks();
      if (data.masterBook?.id) {
        setSelectedMasterBookId(data.masterBook.id);
      }
      const createdEdId = data.editions?.[0]?.id ?? data.edition?.id;
      if (createdEdId) {
        setSelectedEditionId(createdEdId);
        await loadEditionTree(createdEdId);
      }

      setShowAddBookModal(false);
      resetAddBookForm();
      setNotice({
        kind: 'ok',
        text: `Created "${data.masterBook?.canonicalTitle}" with ${data.editions?.length ?? 1} language edition(s). Upload manual audio files below to bind 1-to-1 playback.`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to create book.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSoftDeleteMasterBook = async (masterBookId: string, title: string) => {
    if (!canDelete) return;
    setBusyAction(`del-master-${masterBookId}`);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/books-structures/master-books/${encodeURIComponent(masterBookId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to remove book.');
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Soft-deleted "${title}" (sync tombstone recorded for offline mobile apps).`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Delete failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddLanguageEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedMasterBook || !newEditionTitle.trim()) return;
    setBusyAction('add-edition');
    setNotice(null);
    try {
      const langMeta =
        OTT_EDITION_LANGUAGES.find((l) => l.code === newEditionLangCode) ??
        OTT_EDITION_LANGUAGES[0];
      const res = await fetch('/api/books-structures/editions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterBookId: selectedMasterBook.id,
          languageCode: langMeta.code,
          languageName: langMeta.name,
          languageNativeName: langMeta.nativeName,
          title: newEditionTitle.trim(),
          subtitle: newEditionSubtitle.trim() || undefined,
          description:
            newEditionDescription.trim() ||
            `Manually authored ${langMeta.name} edition of ${selectedMasterBook.canonicalTitle}.`,
          narratorName: newEditionNarrator.trim() || 'Native Language Narrator',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add language edition.');

      await loadMasterBooks();
      setSelectedEditionId(data.edition.id);
      await loadEditionTree(data.edition.id);
      setShowAddEditionForm(false);
      setNewEditionTitle('');
      setNewEditionSubtitle('');
      setNewEditionDescription('');
      setNotice({
        kind: 'ok',
        text: `Added manual ${langMeta.name} edition "${data.edition.title}".`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to create language edition.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedEditionId || !newChapterNumber.trim() || !newChapterTitle.trim()) {
      return;
    }
    setBusyAction('add-chapter');
    setNotice(null);
    try {
      const res = await fetch(
        `/api/books-structures/editions/${encodeURIComponent(selectedEditionId)}/chapters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterNumber: newChapterNumber.trim(),
            title: newChapterTitle.trim(),
            overview: newChapterOverview.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add chapter.');
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      if (data.chapter?.id) setSelectedChapterId(data.chapter.id);
      setShowAddChapterForm(false);
      setNewChapterNumber('');
      setNewChapterTitle('');
      setNewChapterOverview('');
      setNotice({
        kind: 'ok',
        text: `Added "${data.chapter.chapterNumber}: ${data.chapter.title}" (v${data.chapter.versionNumber}) — mobile offline apps will auto-sync this chapter.`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to create chapter.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !activeChapter || !selectedEditionId) return;
    setBusyAction('save-chapter');
    setNotice(null);
    try {
      const res = await fetch(
        `/api/books-structures/chapters/${encodeURIComponent(activeChapter.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editChapter),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save chapter.');
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Saved chapter "${data.chapter.title}" (bumped to v${data.chapter.versionNumber}).`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to save chapter.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteChapter = async (chapter: OttChapter) => {
    if (!canDelete || !selectedEditionId) return;
    setBusyAction(`del-ch-${chapter.id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/books-structures/chapters/${encodeURIComponent(chapter.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to soft-delete chapter.');
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Soft-deleted chapter "${chapter.title}" (sync tombstone incremented).`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Delete failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !canEdit ||
      !activeChapter ||
      !selectedEditionId ||
      !newUnitNumber.trim() ||
      !newUnitTitle.trim() ||
      !newUnitDefinition.trim()
    ) {
      return;
    }
    setBusyAction('add-unit');
    setNotice(null);
    try {
      const res = await fetch(
        `/api/books-structures/chapters/${encodeURIComponent(activeChapter.id)}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitNumber: newUnitNumber.trim(),
            title: newUnitTitle.trim(),
            definition: newUnitDefinition.trim(),
            purposeBackground: newUnitPurpose.trim(),
            deepExplanation: newUnitExplanation.trim(),
            practicalExamples: newUnitExamples.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to add ${activeCopy.unitSingular}.`);
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      if (data.unit?.id) setSelectedUnitId(data.unit.id);
      setShowAddUnitForm(false);
      setNewUnitNumber('');
      setNewUnitTitle('');
      setNewUnitDefinition('');
      setNewUnitPurpose('');
      setNewUnitExplanation('');
      setNewUnitExamples('');
      setNotice({
        kind: 'ok',
        text: `Added ${activeCopy.unitSingular} "${data.unit.unitNumber} · ${data.unit.title}". Upload manual audio files below for 1-to-1 playback.`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add content unit.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !activeUnit || !selectedEditionId) return;
    setBusyAction('save-unit');
    setNotice(null);
    try {
      const res = await fetch(`/api/books-structures/units/${encodeURIComponent(activeUnit.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUnit),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update unit.');
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Updated "${data.unit.unitNumber} · ${data.unit.title}" (v${data.unit.versionNumber}).`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to save changes.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteUnit = async (unit: OttLegalUnit) => {
    if (!canDelete || !selectedEditionId) return;
    setBusyAction(`del-unit-${unit.id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/books-structures/units/${encodeURIComponent(unit.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete unit.');
      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Soft-deleted "${unit.unitNumber} · ${unit.title}".`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Delete failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleUploadAudio = async (
    entityType: OttAudioEntityType,
    entityId: string,
    blockRole: OttAudioBlockRole,
    file: File,
    meta?: {
      nodeNumber: string;
      nodeTitle: string;
      chapterId: string;
      chapterTitle: string;
      nodeType: ContentAudioNodeType;
    }
  ) => {
    if (!canEdit || !selectedEditionId || !editionTree) return;
    const actionKey = `upload-${entityType}-${entityId}-${blockRole}`;
    setBusyAction(actionKey);
    setNotice(null);
    try {
      const upload = await uploadAudioFileForContentNode(file, {
        entityType,
        entityId,
        blockRole,
      });

      const contentRole = mapOttBlockRoleToContentRole(blockRole);
      const langCode = (editionTree.edition.languageCode || 'en') as ContentAudioLanguageCode;
      const nodeType: ContentAudioNodeType =
        meta?.nodeType ??
        (entityType === 'edition'
          ? 'edition'
          : entityType === 'chapter'
            ? 'chapter'
            : activeUnit?.unitType ?? 'article');

      let firestoreNote = '';
      if (onUpsertContentAudio) {
        const docId = buildContentAudioDocId('books_structures', entityId, contentRole, langCode);
        const result = await onUpsertContentAudio(
          {
            id: docId,
            contentSource: 'books_structures',
            contentNodeType: nodeType,
            bookId: editionTree.edition.id,
            bookTitle: editionTree.edition.title,
            chapterId: meta?.chapterId ?? activeChapter?.id ?? editionTree.edition.id,
            chapterTitle: meta?.chapterTitle ?? activeChapter?.title ?? editionTree.edition.title,
            contentNodeId: entityId,
            contentNodeNumber: meta?.nodeNumber ?? editionTree.edition.languageCode.toUpperCase(),
            contentNodeTitle: meta?.nodeTitle ?? editionTree.edition.title,
            blockRole: contentRole,
            language: langCode,
            narrator: editionTree.edition.narratorName || 'Studio Narrator',
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            byteSize: upload.byteSize,
            durationSec: upload.durationSec,
            durationLabel: upload.durationLabel,
            audioUrl: upload.audioUrl,
            status: 'published',
            uploadedByEmail: actor.email,
            uploadedByUid: actor.uid,
          },
          actor
        );
        firestoreNote = result.firestoreSynced
          ? ' · Metadata synced to Firestore'
          : ' · Metadata saved locally';
      }

      await loadEditionTree(selectedEditionId);
      await loadMasterBooks();
      setNotice({
        kind: 'ok',
        text: `Bound "${upload.fileName}" (${upload.durationLabel}) 1-to-1 to ${meta?.nodeNumber ?? entityType}${firestoreNote}.`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Manual audio upload failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenSqlSchema = async () => {
    setShowSqlSchema((v) => !v);
    if (!sqlSchemaText) {
      try {
        const res = await fetch('/api/books-structures/schema');
        if (res.ok) {
          setSqlSchemaText(await res.text());
        }
      } catch {
        setSqlSchemaText('-- Unable to load SQL schema.');
      }
    }
  };

  const handleCopySchema = async () => {
    if (!sqlSchemaText) return;
    try {
      await navigator.clipboard.writeText(sqlSchemaText);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const getTypeBadgeStyle = (type: OttBookType) => {
    if (type === 'constitutional') {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (type === 'general_law') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  const currentLangCode = (editionTree?.edition.languageCode ?? 'en') as ContentAudioLanguageCode;

  return (
    <div className="space-y-5">
      {/* Unified Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
            Single Source of Truth · Multi-Language Editions · 1-to-1 Manual Audio · Delta-Sync
          </p>
          <h1 className="mt-0.5 font-display text-xl font-bold text-slate-950">
            Books &amp; Structures
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Manage Master Books (Constitutional, General Law, and Biography / General), manually authored language editions, hierarchical content, direct manual audio uploads, and offline delta-sync versions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleOpenSqlSchema()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Code2 className="h-3.5 w-3.5 text-slate-500" />
            {showSqlSchema ? 'Hide SQL Schema' : 'Unified SQL Schema'}
          </button>
          <button
            type="button"
            onClick={() => {
              void loadMasterBooks();
              if (selectedEditionId) void loadEditionTree(selectedEditionId);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowAddBookModal((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              {showAddBookModal ? <X className="h-4 w-4" /> : <BookPlus className="h-4 w-4" />}
              {showAddBookModal ? 'Close Add New Book' : 'Add New Book'}
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs font-semibold ${
            notice.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Unified SQL Schema Viewer */}
      {showSqlSchema && (
        <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <p className="font-mono text-xs font-bold text-blue-400">
                database/schema.sql — Unified Books &amp; Structures Relational Schema
              </p>
              <p className="text-[11px] text-slate-400">
                Supports constitutional, general_law, and biography book types with version_number, updated_at, soft-delete tombstones, and 1-to-1 manual audio assets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopySchema()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              {copiedSchema ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedSchema ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto font-mono text-[11px] leading-relaxed text-slate-300">
            {sqlSchemaText || 'Loading schema…'}
          </pre>
        </section>
      )}

      {/* ===================================================================== */}
      {/* REDESIGNED "ADD NEW BOOK" UNIFIED STUDIO                              */}
      {/* ===================================================================== */}
      {showAddBookModal && canEdit && (
        <form
          onSubmit={handleCreateBookBundle}
          className="space-y-5 rounded-xl border-2 border-blue-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
            <div>
              <h2 className="font-display text-base font-bold text-slate-950">
                Add New Book — Master Group &amp; Multi-Language Editions
              </h2>
              <p className="text-xs text-slate-500">
                Create a Master Book parent group, pick its content structure, and add one or more manually authored language editions (no auto-translation).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadPreset('constitutional')}
                className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                Sample: Constitutional
              </button>
              <button
                type="button"
                onClick={() => loadPreset('general_law')}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              >
                Sample: General Law
              </button>
              <button
                type="button"
                onClick={() => loadPreset('biography')}
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
              >
                Sample: Biography (Ambedkar)
              </button>
            </div>
          </div>

          {/* Step 1: Flexible Book Structure Type */}
          <div>
            <label className="block text-xs font-bold text-slate-800">
              1. Book Structure Type
            </label>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {(
                [
                  {
                    type: 'constitutional' as const,
                    title: 'Constitutional Book',
                    desc: 'Chapters / Parts → Articles (Title, Definition, Deep Explanation, Examples)',
                    icon: Scale,
                  },
                  {
                    type: 'general_law' as const,
                    title: 'General Law Book',
                    desc: 'Chapters → Sections (Title, Purpose, Detailed Explanation, Case Examples)',
                    icon: BookMarked,
                  },
                  {
                    type: 'biography' as const,
                    title: 'General / Biography Book',
                    desc: 'Chapters → Sub-sections / Topics (Title, Content, Notes — e.g., Dr. B.R. Ambedkar)',
                    icon: UserCheck,
                  },
                ]
              ).map((option) => {
                const Icon = option.icon;
                const active = newMasterType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => {
                      setNewMasterType(option.type);
                      setDraftChapterNumber(
                        option.type === 'constitutional'
                          ? 'Part I · Chapter 1'
                          : 'Chapter 1'
                      );
                    }}
                    className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                      active
                        ? 'border-[#2563EB] bg-blue-50/60 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-slate-950">{option.title}</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                      {option.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Master Book Parent Metadata */}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Master Book Canonical Title *
              </label>
              <input
                required
                value={newMasterTitle}
                onChange={(e) => setNewMasterTitle(e.target.value)}
                placeholder={
                  newMasterType === 'biography'
                    ? 'e.g., Dr. B.R. Ambedkar: Life History & Legacy'
                    : newMasterType === 'general_law'
                      ? 'e.g., Consumer Protection Act, 2019'
                      : 'e.g., Constitution of India'
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Jurisdiction / Domain
              </label>
              <input
                value={newMasterJurisdiction}
                onChange={(e) => setNewMasterJurisdiction(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Year</label>
              <input
                type="number"
                value={newMasterYear}
                onChange={(e) => setNewMasterYear(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Step 3: Manually Authored Language Editions */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  2. Language Editions (Manually Authored — No Auto-Translation)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Add separate native-language editions under this Master Book. Each edition keeps its own text and manual audio files.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const usedCodes = new Set(draftEditions.map((d) => d.languageCode));
                  const nextLang =
                    OTT_EDITION_LANGUAGES.find((l) => !usedCodes.has(l.code))?.code ?? 'te';
                  setDraftEditions((prev) => [
                    ...prev,
                    {
                      languageCode: nextLang,
                      title: '',
                      subtitle: '',
                      description: '',
                      narratorName: 'Native Language Narrator',
                    },
                  ]);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Language Edition
              </button>
            </div>

            <div className="space-y-2.5">
              {draftEditions.map((ed, idx) => (
                <div
                  key={`${idx}-${ed.languageCode}`}
                  className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-12"
                >
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Language {idx === 0 ? '(Primary)' : `#${idx + 1}`}
                    </label>
                    <select
                      value={ed.languageCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftEditions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, languageCode: val } : item
                          )
                        );
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                    >
                      {OTT_EDITION_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name} ({l.nativeName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Edition Title *
                    </label>
                    <input
                      required
                      value={ed.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftEditions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                        );
                      }}
                      placeholder="Native language book title"
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Edition Overview / Description
                    </label>
                    <input
                      value={ed.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftEditions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, description: val } : item))
                        );
                      }}
                      placeholder="Short book description for this edition"
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Narrator
                    </label>
                    <input
                      value={ed.narratorName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftEditions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, narratorName: val } : item))
                        );
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="flex items-end justify-end md:col-span-1">
                    {draftEditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftEditions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remove language edition"
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 4: Initial Chapter & Units for Primary Edition */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={includeInitialStructure}
                onChange={(e) => setIncludeInitialStructure(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              3. Add Initial Chapter &amp; {draftCopy.unitPlural} to Primary Edition now
            </label>

            {includeInitialStructure && (
              <div className="space-y-3 pt-1">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Chapter / Part Number
                    </label>
                    <input
                      value={draftChapterNumber}
                      onChange={(e) => setDraftChapterNumber(e.target.value)}
                      placeholder="Chapter 1"
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Chapter Title
                    </label>
                    <input
                      value={draftChapterTitle}
                      onChange={(e) => setDraftChapterTitle(e.target.value)}
                      placeholder="e.g., Early Life & Constitutional Principles"
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Chapter Overview
                    </label>
                    <textarea
                      rows={2}
                      value={draftChapterOverview}
                      onChange={(e) => setDraftChapterOverview(e.target.value)}
                      placeholder="Concise summary of this chapter…"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Initial Articles / Sections / Topics */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                      Initial {draftCopy.unitPlural}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftUnits((prev) => [
                          ...prev,
                          {
                            unitNumber: '',
                            title: '',
                            definition: '',
                            purposeBackground: '',
                            deepExplanation: '',
                            practicalExamples: '',
                          },
                        ])
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Add {draftCopy.unitSingular}
                    </button>
                  </div>

                  {draftUnits.map((unit, idx) => (
                    <div
                      key={idx}
                      className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-2"
                    >
                      <input
                        value={unit.unitNumber}
                        onChange={(e) =>
                          setDraftUnits((prev) =>
                            prev.map((u, i) =>
                              i === idx ? { ...u, unitNumber: e.target.value } : u
                            )
                          )
                        }
                        placeholder={draftCopy.unitNumberPlaceholder}
                        className="h-9 rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                      />
                      <div className="flex gap-2">
                        <input
                          value={unit.title}
                          onChange={(e) =>
                            setDraftUnits((prev) =>
                              prev.map((u, i) => (i === idx ? { ...u, title: e.target.value } : u))
                            )
                          }
                          placeholder={draftCopy.unitTitlePlaceholder}
                          className="h-9 flex-1 rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                        />
                        {draftUnits.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftUnits((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`Remove ${draftCopy.unitSingular}`}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={unit.definition}
                        onChange={(e) =>
                          setDraftUnits((prev) =>
                            prev.map((u, i) =>
                              i === idx ? { ...u, definition: e.target.value } : u
                            )
                          )
                        }
                        placeholder={draftCopy.definitionPlaceholder}
                        className="rounded-md border border-slate-300 p-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                      />
                      <textarea
                        rows={2}
                        value={unit.deepExplanation}
                        onChange={(e) =>
                          setDraftUnits((prev) =>
                            prev.map((u, i) =>
                              i === idx ? { ...u, deepExplanation: e.target.value } : u
                            )
                          )
                        }
                        placeholder={draftCopy.explanationPlaceholder}
                        className="rounded-md border border-slate-300 p-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                      />
                      <input
                        value={unit.purposeBackground}
                        onChange={(e) =>
                          setDraftUnits((prev) =>
                            prev.map((u, i) =>
                              i === idx ? { ...u, purposeBackground: e.target.value } : u
                            )
                          )
                        }
                        placeholder={draftCopy.purposePlaceholder}
                        className="h-9 rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                      />
                      <input
                        value={unit.practicalExamples}
                        onChange={(e) =>
                          setDraftUnits((prev) =>
                            prev.map((u, i) =>
                              i === idx ? { ...u, practicalExamples: e.target.value } : u
                            )
                          )
                        }
                        placeholder={draftCopy.examplesPlaceholder}
                        className="h-9 rounded-md border border-slate-300 px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddBookModal(false)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyAction === 'create-book'}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-5 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {busyAction === 'create-book'
                ? 'Creating Book…'
                : 'Create Master Book & Language Editions'}
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* MAIN TWO-PANE UNIFIED WORKSPACE                                       */}
      {/* ===================================================================== */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* LEFT PANE: MASTER BOOK DIRECTORY */}
        <aside className="space-y-3 lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search master books or editions…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {(
                [
                  { id: 'all', label: `All (${masterBooks.length})` },
                  {
                    id: 'constitutional',
                    label: `Constitutional (${masterBooks.filter((b) => b.bookType === 'constitutional').length})`,
                  },
                  {
                    id: 'general_law',
                    label: `General Law (${masterBooks.filter((b) => b.bookType === 'general_law').length})`,
                  },
                  {
                    id: 'biography',
                    label: `Biography (${masterBooks.filter((b) => b.bookType === 'biography').length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`h-7 rounded-md px-2 font-semibold transition cursor-pointer ${
                    typeFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredMasterBooks.map((book) => {
              const isSelected = book.id === selectedMasterBookId;
              const copy = getStructureCopy(book.bookType);
              return (
                <div
                  key={book.id}
                  className={`rounded-xl border p-3.5 transition ${
                    isSelected
                      ? 'border-[#2563EB] bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedMasterBookId(book.id)}
                    className="block w-full text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${getTypeBadgeStyle(book.bookType)}`}
                      >
                        {copy.bookTypeShort}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-slate-500">
                        v{book.versionNumber} · {book.year}
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-sm font-bold text-slate-950">
                      {book.canonicalTitle}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">{book.jurisdiction}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {book.editions.map((ed) => (
                        <span
                          key={ed.id}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                        >
                          {ed.languageNativeName}
                        </span>
                      ))}
                    </div>
                  </button>
                  {canDelete && (
                    <div className="mt-2.5 flex justify-end border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        disabled={busyAction === `del-master-${book.id}`}
                        onClick={() =>
                          void handleSoftDeleteMasterBook(book.id, book.canonicalTitle)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        Soft-Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {!loadingCatalog && filteredMasterBooks.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                No books match this filter. Click <strong>Add New Book</strong> to create one.
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT PANE: EDITION SWITCHER + HIERARCHICAL CONTENT + 1-TO-1 MANUAL AUDIO */}
        <section className="space-y-4 lg:col-span-8">
          {selectedMasterBook ? (
            <>
              {/* Master Book Header & Language Edition Tabs */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${getTypeBadgeStyle(selectedMasterBook.bookType)}`}
                      >
                        {activeCopy.bookTypeLabel}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Sync v{selectedMasterBook.versionNumber} · Updated{' '}
                        {selectedMasterBook.updatedAt.slice(0, 10)}
                      </span>
                    </div>
                    <h2 className="mt-1 font-display text-lg font-bold text-slate-950">
                      {selectedMasterBook.canonicalTitle}
                    </h2>
                    <p className="text-[11px] text-slate-500">{activeCopy.structureSummary}</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAddEditionForm((v) => !v)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {showAddEditionForm ? 'Close' : '+ Add Language Edition'}
                    </button>
                  )}
                </div>

                {/* Manual Language Edition Switcher */}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                  {selectedMasterBook.editions.map((ed) => {
                    const active = ed.id === selectedEditionId;
                    return (
                      <button
                        key={ed.id}
                        type="button"
                        onClick={() => setSelectedEditionId(ed.id)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition cursor-pointer ${
                          active
                            ? 'border-[#2563EB] bg-[#2563EB] text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span>{ed.languageNativeName}</span>
                        <span className={`font-mono text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                          v{ed.versionNumber}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Add Language Edition Inline Drawer */}
                {showAddEditionForm && canEdit && (
                  <form
                    onSubmit={handleAddLanguageEdition}
                    className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 md:grid-cols-2"
                  >
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Language
                      </label>
                      <select
                        value={newEditionLangCode}
                        onChange={(e) => setNewEditionLangCode(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
                      >
                        {OTT_EDITION_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name} ({l.nativeName})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Native Edition Title *
                      </label>
                      <input
                        required
                        value={newEditionTitle}
                        onChange={(e) => setNewEditionTitle(e.target.value)}
                        placeholder="e.g., భారత రాజ్యాంగం"
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Subtitle
                      </label>
                      <input
                        value={newEditionSubtitle}
                        onChange={(e) => setNewEditionSubtitle(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Narrator Name
                      </label>
                      <input
                        value={newEditionNarrator}
                        onChange={(e) => setNewEditionNarrator(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Edition Overview / Description
                      </label>
                      <textarea
                        rows={2}
                        value={newEditionDescription}
                        onChange={(e) => setNewEditionDescription(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                      />
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => setShowAddEditionForm(false)}
                        className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busyAction === 'add-edition'}
                        className="h-8 rounded-md bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                      >
                        {busyAction === 'add-edition' ? 'Saving…' : 'Create Language Edition'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Book Overview Manual Audio Upload (1-to-1 bound to Edition) */}
                {editionTree && (
                  <div className="pt-1">
                    <ManualAudioUploadSlot
                      label={`Book Overview Audio (${editionTree.edition.languageName} · ${editionTree.edition.title})`}
                      currentUrl={editionTree.edition.descriptionAudioUrl}
                      firestoreRecord={findAudioMetadataForNode(
                        contentAudioMetadata,
                        editionTree.edition.id,
                        'full',
                        currentLangCode
                      )}
                      isFirebaseSignedIn={isFirebaseSignedIn}
                      disabled={!canEdit}
                      uploading={
                        busyAction === `upload-edition-${editionTree.edition.id}-book_description`
                      }
                      onUpload={(file) =>
                        handleUploadAudio('edition', editionTree.edition.id, 'book_description', file, {
                          nodeNumber: editionTree.edition.languageCode.toUpperCase(),
                          nodeTitle: editionTree.edition.title,
                          chapterId: editionTree.edition.id,
                          chapterTitle: 'Book Overview',
                          nodeType: 'edition',
                        })
                      }
                    />
                  </div>
                )}
              </div>

              {/* Hierarchical Chapters & Content Units Editor */}
              {loadingTree ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                  Loading chapters, {activeCopy.unitPlural.toLowerCase()}, and bound audio assets…
                </div>
              ) : editionTree ? (
                <div className="grid gap-4 lg:grid-cols-12">
                  {/* Chapters Column */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-700">
                        <Layers className="h-3.5 w-3.5 text-blue-600" />
                        Chapters ({editionTree.chapters.length})
                      </h3>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setShowAddChapterForm((v) => !v)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Chapter
                        </button>
                      )}
                    </div>

                    {showAddChapterForm && canEdit && (
                      <form
                        onSubmit={handleAddChapter}
                        className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3"
                      >
                        <input
                          required
                          value={newChapterNumber}
                          onChange={(e) => setNewChapterNumber(e.target.value)}
                          placeholder="e.g., Part IV or Chapter 2"
                          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                        />
                        <input
                          required
                          value={newChapterTitle}
                          onChange={(e) => setNewChapterTitle(e.target.value)}
                          placeholder="Chapter title"
                          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                        />
                        <textarea
                          rows={2}
                          value={newChapterOverview}
                          onChange={(e) => setNewChapterOverview(e.target.value)}
                          placeholder="Chapter overview…"
                          className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        />
                        <button
                          type="submit"
                          disabled={busyAction === 'add-chapter'}
                          className="h-8 w-full rounded-md bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                        >
                          {busyAction === 'add-chapter' ? 'Adding…' : 'Save New Chapter'}
                        </button>
                      </form>
                    )}

                    <div className="space-y-1.5">
                      {editionTree.chapters.map((ch) => {
                        const active = ch.id === activeChapter?.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setSelectedChapterId(ch.id)}
                            className={`block w-full rounded-lg border p-2.5 text-left transition cursor-pointer ${
                              active
                                ? 'border-[#2563EB] bg-blue-50/60'
                                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] font-bold text-blue-700">
                                {ch.chapterNumber}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                v{ch.versionNumber} · {ch.units.length} {activeCopy.unitPlural.toLowerCase()}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs font-bold text-slate-900">{ch.title}</p>
                          </button>
                        );
                      })}
                      {editionTree.chapters.length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                          No chapters yet. Click <strong>+ Chapter</strong> to start.
                        </p>
                      )}
                    </div>

                    {/* Selected Chapter Edit + Manual Chapter Overview Audio */}
                    {activeChapter && (
                      <div className="space-y-3 border-t border-slate-200 pt-3">
                        <form onSubmit={handleSaveChapter} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                              Edit Selected Chapter
                            </p>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteChapter(activeChapter)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            )}
                          </div>
                          <input
                            value={editChapter.chapterNumber}
                            onChange={(e) =>
                              setEditChapter((p) => ({ ...p, chapterNumber: e.target.value }))
                            }
                            disabled={!canEdit}
                            className="h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900"
                          />
                          <input
                            value={editChapter.title}
                            onChange={(e) =>
                              setEditChapter((p) => ({ ...p, title: e.target.value }))
                            }
                            disabled={!canEdit}
                            className="h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900"
                          />
                          <textarea
                            rows={2}
                            value={editChapter.overview}
                            onChange={(e) =>
                              setEditChapter((p) => ({ ...p, overview: e.target.value }))
                            }
                            disabled={!canEdit}
                            className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-900"
                          />
                          {canEdit && (
                            <button
                              type="submit"
                              disabled={busyAction === 'save-chapter'}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {busyAction === 'save-chapter' ? 'Saving…' : 'Save Chapter'}
                            </button>
                          )}
                        </form>

                        <ManualAudioUploadSlot
                          label={`Chapter Overview Audio (${activeChapter.chapterNumber})`}
                          currentUrl={activeChapter.overviewAudioUrl}
                          firestoreRecord={findAudioMetadataForNode(
                            contentAudioMetadata,
                            activeChapter.id,
                            'full',
                            currentLangCode
                          )}
                          isFirebaseSignedIn={isFirebaseSignedIn}
                          disabled={!canEdit}
                          uploading={
                            busyAction === `upload-chapter-${activeChapter.id}-chapter_overview`
                          }
                          onUpload={(file) =>
                            handleUploadAudio(
                              'chapter',
                              activeChapter.id,
                              'chapter_overview',
                              file,
                              {
                                nodeNumber: activeChapter.chapterNumber,
                                nodeTitle: activeChapter.title,
                                chapterId: activeChapter.id,
                                chapterTitle: activeChapter.title,
                                nodeType: 'chapter',
                              }
                            )
                          }
                        />
                      </div>
                    )}
                  </div>

                  {/* Articles / Sections / Topics Column */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-700">
                        <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                        {activeCopy.unitPlural} ({activeChapter?.units.length ?? 0})
                      </h3>
                      {canEdit && activeChapter && (
                        <button
                          type="button"
                          onClick={() => setShowAddUnitForm((v) => !v)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Add {activeCopy.unitSingular}
                        </button>
                      )}
                    </div>

                    {/* Add Unit Inline Form */}
                    {showAddUnitForm && canEdit && activeChapter && (
                      <form
                        onSubmit={handleAddUnit}
                        className="space-y-2.5 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5"
                      >
                        <div className="grid gap-2 md:grid-cols-3">
                          <input
                            required
                            value={newUnitNumber}
                            onChange={(e) => setNewUnitNumber(e.target.value)}
                            placeholder={activeCopy.unitNumberPlaceholder}
                            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                          />
                          <input
                            required
                            value={newUnitTitle}
                            onChange={(e) => setNewUnitTitle(e.target.value)}
                            placeholder={activeCopy.unitTitlePlaceholder}
                            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 md:col-span-2"
                          />
                        </div>
                        <textarea
                          required
                          rows={2}
                          value={newUnitDefinition}
                          onChange={(e) => setNewUnitDefinition(e.target.value)}
                          placeholder={activeCopy.definitionPlaceholder}
                          className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        />
                        <textarea
                          rows={2}
                          value={newUnitPurpose}
                          onChange={(e) => setNewUnitPurpose(e.target.value)}
                          placeholder={activeCopy.purposePlaceholder}
                          className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        />
                        <textarea
                          rows={2}
                          value={newUnitExplanation}
                          onChange={(e) => setNewUnitExplanation(e.target.value)}
                          placeholder={activeCopy.explanationPlaceholder}
                          className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        />
                        <textarea
                          rows={2}
                          value={newUnitExamples}
                          onChange={(e) => setNewUnitExamples(e.target.value)}
                          placeholder={activeCopy.examplesPlaceholder}
                          className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddUnitForm(false)}
                            className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busyAction === 'add-unit'}
                            className="h-8 rounded-md bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                          >
                            {busyAction === 'add-unit'
                              ? 'Adding…'
                              : `Save ${activeCopy.unitSingular}`}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Unit Selector Strip */}
                    {activeChapter && activeChapter.units.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {activeChapter.units.map((u) => {
                          const selected = u.id === activeUnit?.id;
                          const hasAnyAudio = Boolean(
                            u.fullAudioUrl ||
                              u.definitionAudioUrl ||
                              u.purposeAudioUrl ||
                              u.explanationAudioUrl ||
                              u.examplesAudioUrl
                          );
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => setSelectedUnitId(u.id)}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition cursor-pointer ${
                                selected
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <span>{u.unitNumber}</span>
                              {hasAnyAudio && (
                                <FileAudio
                                  className={`h-3 w-3 ${selected ? 'text-emerald-300' : 'text-emerald-600'}`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Selected Unit Text + Strict 1-to-1 Manual Audio Uploaders */}
                    {activeUnit && activeChapter ? (
                      <div className="space-y-4 border-t border-slate-200 pt-3">
                        <form onSubmit={handleSaveUnit} className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-blue-700">
                              {activeUnit.unitNumber} · Sync v{activeUnit.versionNumber}
                            </span>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteUnit(activeUnit)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" /> Soft-Delete {activeCopy.unitSingular}
                              </button>
                            )}
                          </div>

                          <div className="grid gap-2 md:grid-cols-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600">
                                Number
                              </label>
                              <input
                                value={editUnit.unitNumber}
                                onChange={(e) =>
                                  setEditUnit((p) => ({ ...p, unitNumber: e.target.value }))
                                }
                                disabled={!canEdit}
                                className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-600">
                                Title
                              </label>
                              <input
                                value={editUnit.title}
                                onChange={(e) =>
                                  setEditUnit((p) => ({ ...p, title: e.target.value }))
                                }
                                disabled={!canEdit}
                                className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-900"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600">
                              {activeCopy.definitionLabel}
                            </label>
                            <textarea
                              rows={3}
                              value={editUnit.definition}
                              onChange={(e) =>
                                setEditUnit((p) => ({ ...p, definition: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600">
                              {activeCopy.purposeLabel}
                            </label>
                            <textarea
                              rows={2}
                              value={editUnit.purposeBackground}
                              onChange={(e) =>
                                setEditUnit((p) => ({ ...p, purposeBackground: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600">
                              {activeCopy.explanationLabel}
                            </label>
                            <textarea
                              rows={3}
                              value={editUnit.deepExplanation}
                              onChange={(e) =>
                                setEditUnit((p) => ({ ...p, deepExplanation: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600">
                              {activeCopy.examplesLabel}
                            </label>
                            <textarea
                              rows={2}
                              value={editUnit.practicalExamples}
                              onChange={(e) =>
                                setEditUnit((p) => ({ ...p, practicalExamples: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs text-slate-900"
                            />
                          </div>

                          {canEdit && (
                            <button
                              type="submit"
                              disabled={busyAction === 'save-unit'}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {busyAction === 'save-unit'
                                ? 'Saving…'
                                : `Save ${activeCopy.unitSingular} Changes`}
                            </button>
                          )}
                        </form>

                        {/* 1-to-1 Manual Audio Uploaders */}
                        <div className="space-y-2.5 border-t border-slate-200 pt-3">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              1-to-1 Manual Audio Files for {activeUnit.unitNumber}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Each uploaded file binds strictly to this exact block and plays natively in the mobile app (online &amp; offline) with zero AI TTS.
                            </p>
                          </div>

                          {(
                            [
                              {
                                blockRole: 'unit_full' as const,
                                label: activeCopy.audioLabels.full,
                                url: activeUnit.fullAudioUrl,
                              },
                              {
                                blockRole: 'unit_definition' as const,
                                label: activeCopy.audioLabels.definition,
                                url: activeUnit.definitionAudioUrl,
                              },
                              {
                                blockRole: 'unit_purpose' as const,
                                label: activeCopy.audioLabels.purpose,
                                url: activeUnit.purposeAudioUrl,
                              },
                              {
                                blockRole: 'unit_explanation' as const,
                                label: activeCopy.audioLabels.explanation,
                                url: activeUnit.explanationAudioUrl,
                              },
                              {
                                blockRole: 'unit_examples' as const,
                                label: activeCopy.audioLabels.examples,
                                url: activeUnit.examplesAudioUrl,
                              },
                            ] as const
                          ).map((slot) => (
                            <ManualAudioUploadSlot
                              key={slot.blockRole}
                              label={`${activeUnit.unitNumber} · ${slot.label}`}
                              currentUrl={slot.url}
                              firestoreRecord={findAudioMetadataForNode(
                                contentAudioMetadata,
                                activeUnit.id,
                                mapOttBlockRoleToContentRole(slot.blockRole),
                                currentLangCode
                              )}
                              isFirebaseSignedIn={isFirebaseSignedIn}
                              disabled={!canEdit}
                              uploading={
                                busyAction === `upload-unit-${activeUnit.id}-${slot.blockRole}`
                              }
                              onUpload={(file) =>
                                handleUploadAudio('unit', activeUnit.id, slot.blockRole, file, {
                                  nodeNumber: activeUnit.unitNumber,
                                  nodeTitle: activeUnit.title,
                                  chapterId: activeChapter.id,
                                  chapterTitle: activeChapter.title,
                                  nodeType: activeUnit.unitType,
                                })
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                        Select a chapter and add an {activeCopy.unitSingular.toLowerCase()} to edit content and upload 1-to-1 manual audio files.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
              Select a Master Book from the left or click <strong>Add New Book</strong> to create your first multi-language book.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
