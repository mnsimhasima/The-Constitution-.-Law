import type { OttGlossaryCategory, OttGlossaryTerm, OttMasterBook } from '../types/ott.ts';

export interface SeedGlossaryEntry {
  id: string;
  term: string;
  aliases?: string[];
  category: OttGlossaryCategory;
  simpleDefinition: string;
  legalContext?: string;
  citation?: string;
}

/**
 * Curated plain-language legal glossary definitions attached to backend Master Books.
 * Used to power the ReaderView inline term highlighter and Expandable Glossary overlay.
 */
export const MASTER_BOOK_GLOSSARY_SEED: Record<string, SeedGlossaryEntry[]> = {
  'mb-constitution-india': [
    {
      id: 'gl-habeas-corpus',
      term: 'Habeas Corpus',
      category: 'Judicial Remedy',
      simpleDefinition:
        'A court order requiring officials to bring a detained person before a judge and prove the detention is lawful.',
      legalContext:
        'Literally Latin for "you shall have the body." It is the fastest constitutional safeguard against illegal arrest or secret custody.',
      citation: 'Articles 32 & 226, Constitution of India',
    },
    {
      id: 'gl-mandamus',
      term: 'Mandamus',
      aliases: ['Writ of Mandamus'],
      category: 'Judicial Remedy',
      simpleDefinition:
        'A judicial command directing a public official, government agency, or lower authority to perform a legal duty they refused to carry out.',
      legalContext:
        'Latin for "we command." Citizens use it when a statutory body fails to issue entitled permits, pensions, or official records.',
      citation: 'Articles 32 & 226, Constitution of India',
    },
    {
      id: 'gl-certiorari',
      term: 'Certiorari',
      category: 'Judicial Remedy',
      simpleDefinition:
        'An order by a higher court cancelling an unlawful decision made by a lower court or administrative tribunal.',
      legalContext:
        'Issued when an authority acts beyond its legal jurisdiction or violates principles of natural justice.',
      citation: 'Articles 32 & 226, Constitution of India',
    },
    {
      id: 'gl-prohibition',
      term: 'Prohibition',
      category: 'Judicial Remedy',
      simpleDefinition:
        'A preventive writ ordering a lower court or tribunal to stop proceedings that exceed its lawful authority.',
      legalContext:
        'While Certiorari quashes a completed illegal order, Prohibition halts unlawful proceedings before a final order is passed.',
      citation: 'Articles 32 & 226, Constitution of India',
    },
    {
      id: 'gl-quo-warranto',
      term: 'Quo Warranto',
      category: 'Judicial Remedy',
      simpleDefinition:
        'A legal challenge demanding that a person holding a public office prove by what legal authority they occupy that post.',
      legalContext:
        'Protects citizens against unauthorized or unqualified appointments to statutory and public offices.',
      citation: 'Articles 32 & 226, Constitution of India',
    },
    {
      id: 'gl-writ',
      term: 'Writs',
      aliases: ['Writ', 'constitutional writs'],
      category: 'Judicial Remedy',
      simpleDefinition:
        'Formal written orders issued by higher courts to enforce fundamental rights or correct unlawful government action.',
      legalContext:
        'Provides a direct fast-track remedy before High Courts and the Supreme Court without waiting years in ordinary civil trials.',
      citation: 'Articles 32 & 226',
    },
    {
      id: 'gl-fundamental-rights',
      term: 'Fundamental Rights',
      aliases: ['Fundamental Right'],
      category: 'Constitutional',
      simpleDefinition:
        'Core human liberties guaranteed by the Constitution that the government cannot lawfully violate or take away arbitrarily.',
      legalContext:
        'Enforceable directly in courts; any statute that violates Fundamental Rights can be struck down as unconstitutional.',
      citation: 'Part III (Articles 12–35)',
    },
    {
      id: 'gl-due-process',
      term: 'Due Process',
      aliases: ['procedure established by law'],
      category: 'Constitutional',
      simpleDefinition:
        'The guarantee that the government must follow fair, transparent, and reasonable legal procedures before depriving anyone of life, liberty, or property.',
      legalContext:
        'Confirmed by courts to require laws and state procedures to be just, fair, and non-arbitrary—not merely technically enacted.',
      citation: 'Article 21 · Fifth & Fourteenth Amendments',
    },
    {
      id: 'gl-equal-protection',
      term: 'Equal Protection',
      aliases: ['equality before the law', 'constitutional equality'],
      category: 'Constitutional',
      simpleDefinition:
        'The rule that laws must treat people in similar situations fairly without unreasonable discrimination or favoritism.',
      legalContext:
        'Forbids arbitrary class legislation while permitting reasonable affirmative classifications to uplift marginalized groups.',
      citation: 'Article 14, Constitution of India',
    },
    {
      id: 'gl-sovereign',
      term: 'Sovereign',
      aliases: ['sovereignty'],
      category: 'Constitutional',
      simpleDefinition:
        'Having supreme, independent self-governing authority free from outside political control.',
      legalContext:
        'In a constitutional republic, ultimate sovereignty rests with the people who adopt and sustain the Constitution.',
      citation: 'Preamble, Constitution of India',
    },
    {
      id: 'gl-judicial-review',
      term: 'Judicial Review',
      category: 'Constitutional',
      simpleDefinition:
        'The power of independent courts to examine laws and executive actions and invalidate any that violate the Constitution.',
      legalContext:
        'Acts as the constitutional check preventing legislatures or officials from exceeding their legal limits.',
      citation: 'Article 13 & Basic Structure Doctrine',
    },
    {
      id: 'gl-separation-of-powers',
      term: 'Separation of Powers',
      category: 'Constitutional',
      simpleDefinition:
        'Dividing government authority among legislative (law-making), executive (enforcing), and judicial (interpreting) branches so no single branch holds absolute control.',
      citation: 'Article 50 · U.S. Constitution Articles I–III',
    },
    {
      id: 'gl-jurisdiction',
      term: 'Jurisdiction',
      category: 'Judicial Remedy',
      simpleDefinition:
        'The official legal power and geographic or subject-matter limits within which a court or authority may decide cases.',
      citation: 'Constitutional & Procedural Law',
    },
    {
      id: 'gl-detention',
      term: 'Unlawful Detention',
      aliases: ['detention', 'arbitrary detention'],
      category: 'Human Rights',
      simpleDefinition:
        'Holding or confining a person in custody without valid legal grounds, proper warrant, or timely presentation before a magistrate.',
      citation: 'Article 22 · UDHR Article 9',
    },
    {
      id: 'gl-bail',
      term: 'Bail',
      category: 'Criminal & Procedure',
      simpleDefinition:
        'Temporary release of an accused person awaiting trial, usually subject to conditions ensuring they appear in court.',
      legalContext:
        'Rooted in the presumption of innocence: "Bail is the rule, jail is the exception."',
      citation: 'Criminal Procedure Code / BNSS',
    },
    {
      id: 'gl-magistrate',
      term: 'Magistrate',
      category: 'Criminal & Procedure',
      simpleDefinition:
        'A judicial officer who presides over initial criminal hearings, reviews arrests within 24 hours, and safeguards procedural fairness.',
      citation: 'Article 22(2) · Criminal Procedure',
    },
    {
      id: 'gl-rule-of-law',
      term: 'Rule of Law',
      aliases: ['law of the land'],
      category: 'Constitutional',
      simpleDefinition:
        'The foundational principle that every person—including rulers, officials, and institutions—is accountable to publicly enacted, fair laws.',
      citation: 'Magna Carta Clause 39 · Article 14',
    },
  ],
  'mb-constitutional-duties-charter': [
    {
      id: 'gl-constitutional-morality',
      term: 'Constitutional Morality',
      category: 'Constitutional',
      simpleDefinition:
        'A deep commitment by citizens and officials to follow constitutional values—equality, dignity, and fairness—even when they clash with social customs or majority pressure.',
      legalContext:
        'Articulated by Dr. B. R. Ambedkar in the Constituent Assembly and frequently cited by the Supreme Court to protect minority and individual rights.',
      citation: 'Constituent Assembly Debates · 4 Nov 1948 & 25 Nov 1949',
    },
    {
      id: 'gl-social-democracy',
      term: 'Social Democracy',
      category: 'Constitutional',
      simpleDefinition:
        'A way of everyday civic life that recognizes liberty, equality, and fraternity as inseparable principles—not merely voting once every few years.',
      legalContext:
        'Dr. Ambedkar warned that political democracy ("one person, one vote") cannot survive without social and economic equality.',
      citation: 'Dr. B. R. Ambedkar, Closing Speech (25 Nov 1949)',
    },
    {
      id: 'gl-fraternity',
      term: 'Fraternity',
      category: 'Constitutional',
      simpleDefinition:
        'A sense of shared civic fellowship and mutual respect among all citizens that assures the dignity of every individual.',
      legalContext:
        'Unites liberty and equality so neither collapses into privilege for the few or loss of individual freedom.',
      citation: 'Preamble, Constitution of India',
    },
    {
      id: 'gl-constituent-assembly',
      term: 'Constituent Assembly',
      category: 'Constitutional',
      simpleDefinition:
        'The elected representative body that debated, drafted, and adopted the Constitution of India between 1946 and 1949.',
      legalContext:
        'Dr. B. R. Ambedkar chaired its Drafting Committee, carefully synthesizing global constitutional safeguards with Indian realities.',
      citation: 'Adopted 26 November 1949 · Enforced 26 January 1950',
    },
    {
      id: 'gl-barrister-at-law',
      term: 'Barrister-at-Law',
      category: 'Statutory & Civic',
      simpleDefinition:
        'A senior legal qualification earned at the Inns of Court in London authorizing a lawyer to plead and argue cases before higher courts.',
      legalContext:
        'Dr. Ambedkar qualified as a Barrister-at-Law at Gray’s Inn, London alongside his economics doctorates.',
    },
    {
      id: 'gl-emancipation',
      term: 'Emancipation',
      category: 'Human Rights',
      simpleDefinition:
        'The process of freeing individuals or communities from legal, social, or structural restrictions so they can exercise equal rights.',
      citation: 'Human Rights & Constitutional History',
    },
    {
      id: 'gl-codified',
      term: 'Codified',
      aliases: ['codify'],
      category: 'Statutory & Civic',
      simpleDefinition:
        'Written down and systematically arranged into an official, legally binding code or constitutional article.',
      legalContext:
        'For example, the principle of equal public access from Mahad (1927) was later codified in Article 15(2).',
      citation: 'Article 15(2), Constitution of India',
    },
    {
      id: 'gl-constitutional-safeguards',
      term: 'Constitutional Safeguards',
      aliases: ['safeguards'],
      category: 'Constitutional',
      simpleDefinition:
        'Built-in legal protections written into a constitution to prevent discrimination, abuse of power, or erosion of citizen rights.',
      citation: 'Parts III & IV, Constitution of India',
    },
    {
      id: 'gl-satyagraha',
      term: 'Satyagraha',
      category: 'Human Rights',
      simpleDefinition:
        'Peaceful, non-violent civic resistance rooted in truth and moral courage to challenge unjust laws or discriminatory exclusions.',
      citation: 'Mahad Satyagraha (20 March 1927)',
    },
    {
      id: 'gl-human-rights',
      term: 'Human Rights',
      aliases: ['inalienable rights'],
      category: 'Human Rights',
      simpleDefinition:
        'Universal moral and legal entitlements belonging inherently to every human being regardless of nationality, caste, gender, or creed.',
      citation: 'Universal Declaration of Human Rights (1948)',
    },
    {
      id: 'gl-majoritarian',
      term: 'Majoritarian',
      category: 'Constitutional',
      simpleDefinition:
        'A practice where the numerical majority imposes its will without respecting constitutional limits or minority protections.',
      citation: 'Constitutional Democracy Principles',
    },
  ],
  'mb-rti-act-2005': [
    {
      id: 'gl-informed-consent',
      term: 'Informed Consent',
      aliases: ['unambiguous consent', 'revocable data consent'],
      category: 'Statutory & Civic',
      simpleDefinition:
        'Clear, voluntary permission given by a person after being told in plain language exactly what data is collected and how it will be used.',
      legalContext:
        'Modern privacy laws require consent to be free, specific, and just as easy to withdraw as it was to grant.',
      citation: 'Digital Personal Data Protection Framework',
    },
    {
      id: 'gl-public-authority',
      term: 'Public Authority',
      aliases: ['public records'],
      category: 'Statutory & Civic',
      simpleDefinition:
        'Any government body, ministry, municipality, or institution substantially funded by the state that is legally accountable to citizens for official information.',
      citation: 'Section 2(h), Right to Information Act, 2005',
    },
    {
      id: 'gl-statutory',
      term: 'Statutory',
      aliases: ['statutory duty', 'statutory right'],
      category: 'Statutory & Civic',
      simpleDefinition:
        'Created, required, or guaranteed directly by a written Act passed by Parliament or a State Legislature.',
      legalContext:
        'A statutory duty is legally binding—officials cannot ignore it at their personal discretion.',
      citation: 'Statutory Interpretation Principles',
    },
    {
      id: 'gl-erasure',
      term: 'Erasure',
      category: 'Statutory & Civic',
      simpleDefinition:
        'A user’s legal right to ask an organization to permanently delete personal digital data once consent is withdrawn or the purpose is fulfilled.',
      citation: 'Data Protection & Digital Privacy Law',
    },
    {
      id: 'gl-tribunal',
      term: 'Tribunal',
      aliases: ['administrative tribunal'],
      category: 'Judicial Remedy',
      simpleDefinition:
        'A specialized quasi-judicial body set up by statute to resolve specific types of disputes (such as consumer, tax, or service cases) faster than regular courts.',
      citation: 'Articles 323A & 323B',
    },
  ],
  'mb-consumer-protection-law': [
    {
      id: 'gl-law-of-torts',
      term: 'Law of Torts',
      aliases: ['tort law', 'civil torts'],
      category: 'Civil & Tort',
      simpleDefinition:
        'The branch of civil law that lets an injured person claim compensation when someone else’s wrongful act or carelessness causes harm.',
      legalContext:
        'Unlike criminal law (which punishes offenders through fines or prison), tort law focuses on restoring the injured victim.',
      citation: 'Indian Civil & Tort Jurisprudence',
    },
    {
      id: 'gl-duty-of-care',
      term: 'Duty of Care',
      aliases: ['reasonable care'],
      category: 'Civil & Tort',
      simpleDefinition:
        'The legal obligation to act with sensible caution so your actions or products do not foreseeably injure other people.',
      legalContext:
        'Applies to hospitals, builders, drivers, manufacturers, and service providers alike.',
      citation: 'Law of Negligence (Donoghue v. Stevenson principle)',
    },
    {
      id: 'gl-civil-negligence',
      term: 'Civil Negligence',
      aliases: ['negligence'],
      category: 'Civil & Tort',
      simpleDefinition:
        'Failing to take the level of care a reasonable person or professional would take, directly causing injury or financial loss to someone else.',
      citation: 'Civil Tort Liability',
    },
    {
      id: 'gl-injunctions',
      term: 'Injunctions',
      aliases: ['injunction', 'court injunctions'],
      category: 'Judicial Remedy',
      simpleDefinition:
        'A court order commanding a person or organization either to stop doing a harmful act or to take a specific protective action immediately.',
      citation: 'Specific Relief Act & Civil Procedure',
    },
    {
      id: 'gl-redressal',
      term: 'Redressal',
      aliases: ['grievance redressal'],
      category: 'Civil & Tort',
      simpleDefinition:
        'Official remedy, refund, replacement, or compensation granted to correct an unfair practice or resolve a citizen’s legal complaint.',
      citation: 'Consumer Protection Act, 2019',
    },
    {
      id: 'gl-drip-pricing',
      term: 'Drip-Pricing',
      category: 'Civil & Tort',
      simpleDefinition:
        'An unfair commercial practice where an app or seller advertises a low headline price and secretly adds mandatory fees only at the final checkout screen.',
      legalContext:
        'Recognized as an unlawful "dark pattern" under modern consumer protection rules.',
      citation: 'Central Consumer Protection Authority Guidelines',
    },
    {
      id: 'gl-compensation',
      term: 'Civil Compensation',
      aliases: ['money damages', 'civil damages'],
      category: 'Civil & Tort',
      simpleDefinition:
        'Financial payment ordered by a court or commission to make up for physical injury, financial loss, or deficient service.',
      citation: 'Law of Torts & Consumer Commissions',
    },
  ],
};

export function buildSeededGlossaryForMasterBook(
  masterBook: Pick<OttMasterBook, 'id' | 'canonicalTitle'>
): OttGlossaryTerm[] {
  const entries = MASTER_BOOK_GLOSSARY_SEED[masterBook.id] ?? [];
  return entries.map((entry) => ({
    ...entry,
    masterBookId: masterBook.id,
    masterBookTitle: masterBook.canonicalTitle,
  }));
}
