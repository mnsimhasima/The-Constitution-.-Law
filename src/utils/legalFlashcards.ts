import type { LanguageCode, LawBook, LocalizedText } from '../types/library';
import { getLocalizedText } from './libraryLogic';

export type FlashcardCategory =
  | 'all'
  | 'constitutional'
  | 'rights'
  | 'writs_doctrines'
  | 'civil_everyday'
  | 'review_only';

export type FlashcardTopic = Exclude<FlashcardCategory, 'all' | 'review_only'>;
export type FlashcardMastery = 'unseen' | 'review' | 'mastered';

export interface LegalFlashcard {
  id: string;
  term: LocalizedText;
  citation: string;
  topic: FlashcardTopic;
  topicLabel: string;
  definition: LocalizedText;
  example: LocalizedText;
  sourceBookId?: string;
  sourceChapterId?: string;
  sourceClauseId?: string;
}

export interface FlashcardStats {
  total: number;
  mastered: number;
  needsReview: number;
  unseen: number;
  masteryPercent: number;
}

export const FLASHCARD_MASTERY_STORAGE_KEY = 'constitution_law_flashcard_mastery_v1';

export const FLASHCARD_CATEGORY_TABS: ReadonlyArray<{
  id: FlashcardCategory;
  label: string;
}> = [
  { id: 'all', label: 'All Terms' },
  { id: 'constitutional', label: 'Constitutional' },
  { id: 'rights', label: 'Rights' },
  { id: 'writs_doctrines', label: 'Writs & Doctrines' },
  { id: 'civil_everyday', label: 'Civil Law' },
  { id: 'review_only', label: 'Needs Review' },
];

export const CORE_LEGAL_FLASHCARDS: readonly LegalFlashcard[] = [
  {
    id: 'fc-habeas-corpus',
    term: {
      en: 'Habeas Corpus',
      te: 'హెబియస్ కార్పస్ (బందీ ప్రత్యక్షీకరణ రిట్)',
    },
    citation: 'Article 32 & 226 · Constitutional Writ',
    topic: 'writs_doctrines',
    topicLabel: 'Writs & Doctrines',
    definition: {
      en: 'Literally "produce the body." A court order requiring authorities to bring a detained person before a judge to verify whether the detention is lawful.',
      te: 'అక్రమంగా నిర్బంధించబడిన వ్యక్తిని న్యాయస్థానం ముందు హాజరుపరచమని ఆదేశించే రాజ్యాంగ రిట్. ఆ నిర్బంధం చట్టబద్ధమో కాదో న్యాయమూర్తి పరిశీలిస్తారు.',
    },
    example: {
      en: 'If police hold a citizen without charges or magistrate approval beyond 24 hours, family members can petition the High Court or Supreme Court for immediate release.',
      te: '24 గంటలకు మించి మేజిస్ట్రేట్ అనుమతి లేకుండా వ్యక్తిని అదుపులో ఉంచితే, కుటుంబ సభ్యులు హైకోర్టు లేదా సుప్రీంకోర్టులో హెబియస్ కార్పస్ పిటిషన్ వేయవచ్చు.',
    },
    sourceBookId: 'india-constitution',
    sourceChapterId: 'in-part3',
  },
  {
    id: 'fc-due-process',
    term: {
      en: 'Due Process & Law of the Land',
      te: 'న్యాయమైన చట్ట ప్రక్రియ (డ్యూ ప్రాసెస్)',
    },
    citation: 'Magna Carta Clause 39 · Article 21',
    topic: 'rights',
    topicLabel: 'Rights',
    definition: {
      en: 'The constitutional guarantee that the state cannot deprive any person of life, liberty, or property except through fair, just, and reasonable legal procedures.',
      te: 'న్యాయమైన, సహేతుకమైన చట్ట ప్రక్రియ లేకుండా ఏ వ్యక్తి యొక్క ప్రాణాన్ని లేదా వ్యక్తిగత స్వేచ్ఛను ప్రభుత్వం హరించకూడదనే రాజ్యాంగ హామీ.',
    },
    example: {
      en: 'In Maneka Gandhi v. Union of India, the Supreme Court held that any law restricting personal liberty under Article 21 must be fair, non-arbitrary, and reasonable.',
      te: 'మేనకా గాంధీ కేసులో ఆర్టికల్ 21 కింద వ్యక్తిగత స్వేచ్ఛను నియంత్రించే ఏ చట్టమైనా న్యాయబద్ధంగా మరియు సహేతుకంగా ఉండాలని సుప్రీంకోర్టు తీర్పునిచ్చింది.',
    },
    sourceBookId: 'magna-carta',
    sourceChapterId: 'mc-ch1',
  },
  {
    id: 'fc-constitutional-morality',
    term: {
      en: 'Constitutional Morality',
      te: 'రాజ్యాంగ నైతికత',
    },
    citation: 'Dr. B. R. Ambedkar · Constituent Assembly (1948)',
    topic: 'constitutional',
    topicLabel: 'Constitutional',
    definition: {
      en: 'Paramount reverence for the forms, norms, and equality values of the Constitution—resolving public disagreements peacefully through democratic institutions rather than custom or majoritarian will.',
      te: 'సంప్రదాయాలు లేదా మెజారిటీ ఒత్తిడి కంటే రాజ్యాంగ విలువలు, సమానత్వం మరియు ప్రజాస్వామ్య పద్ధతులకు అత్యున్నత గౌరవం ఇవ్వడం.',
    },
    example: {
      en: 'Courts invoke constitutional morality to strike down discriminatory social practices that violate dignity and equal citizenship, even when historically widespread.',
      te: 'సమాన పౌరసత్వానికి మరియు గౌరవానికి భంగం కలిగించే వివక్షాపూరిత ఆచారాలను రద్దు చేయడానికి న్యాయస్థానాలు రాజ్యాంగ నైతికతను ఉపయోగిస్తాయి.',
    },
    sourceBookId: 'ambedkar-constitutional-history',
    sourceChapterId: 'amb-ch2-mahad-constitution',
  },
  {
    id: 'fc-basic-structure',
    term: {
      en: 'Basic Structure Doctrine',
      te: 'మౌలిక స్వరూప సిద్ధాంతం',
    },
    citation: 'Kesavananda Bharati (1973) · Article 368',
    topic: 'writs_doctrines',
    topicLabel: 'Writs & Doctrines',
    definition: {
      en: 'The judicial principle that Parliament may amend the Constitution, but cannot alter or destroy its foundational identity—such as democracy, judicial independence, federalism, and equality.',
      te: 'పార్లమెంటు రాజ్యాంగాన్ని సవరించవచ్చు కానీ ప్రజాస్వామ్యం, న్యాయవ్యవస్థ స్వాతంత్ర్యం, సమానత్వం వంటి మౌలిక లక్షణాలను నాశనం చేయలేదనే సిద్ధాంతం.',
    },
    example: {
      en: 'Any constitutional amendment attempting to abolish free elections or eliminate judicial review can be invalidated by the Supreme Court.',
      te: 'స్వేచ్ఛాయుత ఎన్నికలను లేదా న్యాయ సమీక్షను రద్దు చేసే ఏ రాజ్యాంగ సవరణనైనా సుప్రీంకోర్టు చెల్లదని ప్రకటించగలదు.',
    },
    sourceBookId: 'india-constitution',
    sourceChapterId: 'in-preamble',
  },
  {
    id: 'fc-equality-before-law',
    term: {
      en: 'Equality Before Law & Equal Protection',
      te: 'చట్టం ముందు సమానత్వం',
    },
    citation: 'Article 14 · Fundamental Rights',
    topic: 'rights',
    topicLabel: 'Rights',
    definition: {
      en: 'No person is above the law regardless of rank or wealth, and similarly situated individuals must be treated equally by legislation and administration.',
      te: 'హోదా లేదా సంపదతో సంబంధం లేకుండా అందరూ చట్టానికి సమానం మరియు ఒకే పరిస్థితిలో ఉన్నవారికి సమాన చట్ట రక్షణ లభించాలి.',
    },
    example: {
      en: 'Government hiring rules cannot arbitrarily exclude qualified candidates based on caste, gender, or place of birth.',
      te: 'ప్రభుత్వ ఉద్యోగ నియామకాలలో కులం, లింగం లేదా జన్మస్థలం ఆధారంగా అర్హులైన అభ్యర్థులను వివక్షకు గురిచేయకూడదు.',
    },
    sourceBookId: 'india-constitution',
    sourceChapterId: 'in-part3',
  },
  {
    id: 'fc-mandamus',
    term: {
      en: 'Writ of Mandamus',
      te: 'మాండమస్ రిట్ (పరమాదేశం)',
    },
    citation: 'Article 32 & 226 · Public Duty Remedy',
    topic: 'writs_doctrines',
    topicLabel: 'Writs & Doctrines',
    definition: {
      en: 'Literally "we command." A writ issued by a superior court directing a public official, government agency, or lower tribunal to perform a mandatory legal duty it has failed to do.',
      te: 'తమ చట్టబద్ధమైన కర్తవ్యాన్ని నిర్వర్తించని ప్రభుత్వ అధికారి లేదా సంస్థకు ఆ పనిని తప్పనిసరిగా చేయమని ఉన్నత న్యాయస్థానం ఇచ్చే ఆదేశం.',
    },
    example: {
      en: 'When a municipal authority unlawfully refuses to issue a legally earned license or pension, a court can issue mandamus compelling action.',
      te: 'చట్టబద్ధమైన పెన్షన్ లేదా లైసెన్స్ జారీ చేయడానికి అధికారి నిరాకరిస్తే, కోర్టు మాండమస్ రిట్ ద్వారా ఆదేశించగలదు.',
    },
    sourceBookId: 'india-constitution',
    sourceChapterId: 'in-part3',
  },
  {
    id: 'fc-natural-justice',
    term: {
      en: 'Audi Alteram Partem (Natural Justice)',
      te: 'సహజ న్యాయ సూత్రం (ఇరుపక్షాల వాదన వినడం)',
    },
    citation: 'Administrative & Procedural Law',
    topic: 'writs_doctrines',
    topicLabel: 'Writs & Doctrines',
    definition: {
      en: 'Literally "hear the other side." A core rule of fairness requiring that no person be condemned or penalized without prior notice and a fair opportunity to be heard.',
      te: 'ముందస్తు నోటీసు మరియు తమ వాదన వినిపించుకునే అవకాశం ఇవ్వకుండా ఎవరిపైనా శిక్ష లేదా ప్రతికూల నిర్ణయం తీసుకోకూడదనే న్యాయ సూత్రం.',
    },
    example: {
      en: 'An employer or university cannot expel someone based on an accusation without sharing the allegations and allowing a defense.',
      te: 'ఆరోపణలను తెలియజేసి వివరణ ఇచ్చే అవకాశం ఇవ్వకుండా ఒక విద్యార్థిని లేదా ఉద్యోగిని తొలగించడం సహజ న్యాయానికి విరుద్ధం.',
    },
  },
  {
    id: 'fc-social-democracy',
    term: {
      en: 'Union of Liberty, Equality & Fraternity',
      te: 'స్వేచ్ఛ, సమానత్వం మరియు సౌభ్రాతృత్వ ఐక్యత',
    },
    citation: 'Dr. B. R. Ambedkar · 25 Nov 1949',
    topic: 'constitutional',
    topicLabel: 'Constitutional',
    definition: {
      en: 'A way of social life where liberty, equality, and fraternity form an inseparable trinity: without equality, liberty favors the powerful; without fraternity, liberty and equality cannot endure.',
      te: 'స్వేచ్ఛ, సమానత్వం, సౌభ్రాతృత్వం విడదీయలేని త్రయం. సమానత్వం లేని స్వేచ్ఛ కొందరి ఆధిపత్యానికి దారితీస్తుంది; సౌభ్రాతృత్వం లేకుండా ఇవి నిలవవు.',
    },
    example: {
      en: 'Political voting equality ("one person, one vote") must be paired with economic and social dignity so every citizen truly shares in democratic life.',
      te: 'రాజకీయ ఓటు హక్కు సమానత్వంతో పాటు సామాజిక మరియు ఆర్థిక గౌరవం కూడా ప్రతి పౌరుడికి అందాలి.',
    },
    sourceBookId: 'ambedkar-constitutional-history',
    sourceChapterId: 'amb-ch2-mahad-constitution',
  },
  {
    id: 'fc-rti-transparency',
    term: {
      en: 'Right to Information (30-Day Rule)',
      te: 'సమాచార హక్కు (30 రోజుల నియమం)',
    },
    citation: 'RTI Act 2005 · Section 7',
    topic: 'civil_everyday',
    topicLabel: 'Civil Law',
    definition: {
      en: 'The statutory right of every citizen to request public records, spending details, and official decisions from government bodies, with a mandatory 30-day response timeline (48 hours for life & liberty).',
      te: 'ప్రభుత్వ రికార్డులు, నిధుల వినియోగం మరియు నిర్ణయాల వివరాలను 30 రోజుల్లోగా (ప్రాణ, స్వేచ్ఛ విషయాల్లో 48 గంటల్లో) పొందే పౌర హక్కు.',
    },
    example: {
      en: 'A resident can file an RTI application asking for road repair contracts, contractor bills, and quality inspection reports in their ward.',
      te: 'తమ ప్రాంతంలోని రహదారి మరమ్మతుల కాంట్రాక్టులు మరియు ఖర్చుల వివరాలను పౌరుడు ఆర్‌టిఐ దరఖాస్తు ద్వారా తెలుసుకోవచ్చు.',
    },
    sourceBookId: 'indian-law-handbook',
    sourceChapterId: 'il-ch1',
  },
  {
    id: 'fc-consumer-redressal',
    term: {
      en: 'Consumer Right to Redressal',
      te: 'వినియోగదారుని పరిహార హక్కు',
    },
    citation: 'Consumer Protection Act 2019',
    topic: 'civil_everyday',
    topicLabel: 'Civil Law',
    definition: {
      en: 'Protection against defective goods, deficient services, misleading ads, and unfair e-commerce refund refusals, enforceable through simple online consumer commissions.',
      te: 'లోపభూయిష్టమైన వస్తువులు, సేవా లోపాలు మరియు అన్యాయమైన రిఫండ్ నిరాకరణలపై వినియోగదారుల కమిషన్ ద్వారా పరిహారం పొందే హక్కు.',
    },
    example: {
      en: 'If an online retailer refuses to refund a damaged product despite proof of delivery defect, the buyer can file a complaint on e-Daakhil without needing a lawyer.',
      te: 'దెబ్బతిన్న వస్తువుకు ఆన్‌లైన్ సంస్థ రిఫండ్ నిరాకరిస్తే, వినియోగదారుడు న్యాయవాది అవసరం లేకుండానే ఈ-దాఖిల్‌లో ఫిర్యాదు చేయవచ్చు.',
    },
    sourceBookId: 'indian-law-handbook',
    sourceChapterId: 'il-ch2',
  },
  {
    id: 'fc-judicial-review',
    term: {
      en: 'Judicial Review',
      te: 'న్యాయ సమీక్ష అధికారం',
    },
    citation: 'Article 13 · Constitutional Supremacy',
    topic: 'constitutional',
    topicLabel: 'Constitutional',
    definition: {
      en: 'The power of constitutional courts to examine laws and executive actions and declare them void if they conflict with fundamental rights or constitutional limits.',
      te: 'ప్రాథమిక హక్కులకు లేదా రాజ్యాంగ పరిమితులకు విరుద్ధంగా ఉన్న చట్టాలను, ప్రభుత్వ ఉత్తర్వులను సమీక్షించి రద్దు చేసే న్యాయస్థానాల అధికారం.',
    },
    example: {
      en: 'If a state law restricts peaceful assembly without valid constitutional grounds, courts can strike it down under Article 13.',
      te: 'సరైన రాజ్యాంగ కారణం లేకుండా శాంతియుత సమావేశాలను నిషేధించే చట్టాన్ని న్యాయస్థానాలు ఆర్టికల్ 13 కింద రద్దు చేయగలవు.',
    },
    sourceBookId: 'india-constitution',
    sourceChapterId: 'in-part3',
  },
  {
    id: 'fc-rule-of-law',
    term: {
      en: 'Rule of Law',
      te: 'చట్టబద్ధ పాలన (రూల్ ఆఫ్ లా)',
    },
    citation: 'Universal Declaration · Preamble & Art. 7',
    topic: 'rights',
    topicLabel: 'Rights',
    definition: {
      en: 'Governance by publicly enacted, equally enforced, and independently adjudicated laws—never by arbitrary personal power.',
      te: 'వ్యక్తుల ఇష్టానుసారం కాకుండా బహిరంగంగా రూపొందించిన, అందరికీ సమానంగా వర్తించే చట్టాల ప్రకారం జరిగే పాలన.',
    },
    example: {
      en: 'Public officials, police officers, and private citizens are all answerable before the exact same courts when they break the law.',
      te: 'చట్టాన్ని ఉల్లంఘించినప్పుడు ప్రభుత్వ అధికారులు, పోలీసులు మరియు సాధారణ పౌరులు అందరూ ఒకే న్యాయస్థానానికి జవాబుదారీగా ఉంటారు.',
    },
    sourceBookId: 'udhr-1948',
    sourceChapterId: 'udhr-ch1',
  },
];

export function buildLibraryFlashcards(books: LawBook[]): LegalFlashcard[] {
  const bookIds = new Set(books.map((b) => b.id));
  return CORE_LEGAL_FLASHCARDS.map((card) => {
    if (!card.sourceBookId || !bookIds.has(card.sourceBookId)) {
      return {
        ...card,
        sourceBookId: undefined,
        sourceChapterId: undefined,
        sourceClauseId: undefined,
      };
    }
    const book = books.find((b) => b.id === card.sourceBookId);
    const chapter =
      book?.chapters.find((c) => c.id === card.sourceChapterId) ?? book?.chapters[0];
    return {
      ...card,
      sourceBookId: book?.id,
      sourceChapterId: chapter?.id,
    };
  });
}

export function filterFlashcards(
  cards: readonly LegalFlashcard[],
  options: {
    category: FlashcardCategory;
    query: string;
    masteryMap: Record<string, FlashcardMastery>;
    language: LanguageCode;
  }
): LegalFlashcard[] {
  const { category, query, masteryMap, language } = options;
  const normalizedQuery = query.trim().toLowerCase();

  return cards.filter((card) => {
    if (category === 'review_only') {
      const status = masteryMap[card.id] ?? 'unseen';
      if (status === 'mastered') return false;
    } else if (category !== 'all' && card.topic !== category) {
      return false;
    }

    if (!normalizedQuery) return true;

    const haystack = [
      getLocalizedText(card.term, language),
      card.term.en,
      card.citation,
      card.topicLabel,
      getLocalizedText(card.definition, language),
      card.definition.en,
      getLocalizedText(card.example, language),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function shuffleFlashcards<T>(cards: readonly T[], seed?: number): T[] {
  const copy = [...cards];
  let state = typeof seed === 'number' ? seed >>> 0 : Date.now() >>> 0;
  const nextRand = () => {
    if (typeof seed === 'number') {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    }
    return Math.random();
  };

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function computeFlashcardStats(
  cards: readonly LegalFlashcard[],
  masteryMap: Record<string, FlashcardMastery>
): FlashcardStats {
  let mastered = 0;
  let needsReview = 0;
  let unseen = 0;

  for (const card of cards) {
    const status = masteryMap[card.id] ?? 'unseen';
    if (status === 'mastered') mastered += 1;
    else if (status === 'review') needsReview += 1;
    else unseen += 1;
  }

  const total = cards.length;
  const masteryPercent = total > 0 ? Math.round((mastered / total) * 100) : 0;

  return { total, mastered, needsReview, unseen, masteryPercent };
}

export function updateFlashcardMastery(
  masteryMap: Record<string, FlashcardMastery>,
  cardId: string,
  status: FlashcardMastery
): Record<string, FlashcardMastery> {
  if (masteryMap[cardId] === status) return masteryMap;
  return {
    ...masteryMap,
    [cardId]: status,
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadFlashcardMasteryFromStorage(
  storage?: StorageLike | null
): Record<string, FlashcardMastery> {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return {};
  try {
    const raw = target.getItem(FLASHCARD_MASTERY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const sanitized: Record<string, FlashcardMastery> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'unseen' || value === 'review' || value === 'mastered') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  } catch {
    return {};
  }
}

export function saveFlashcardMasteryToStorage(
  masteryMap: Record<string, FlashcardMastery>,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(FLASHCARD_MASTERY_STORAGE_KEY, JSON.stringify(masteryMap));
  } catch {
    // Ignore storage write errors
  }
}
