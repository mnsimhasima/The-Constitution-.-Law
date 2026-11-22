import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LawBook } from '../types/library.ts';
import type {
  OttAudioAsset,
  OttAudioBlockRole,
  OttAudioEntityType,
  OttBookEdition,
  OttBookType,
  OttChapter,
  OttDeltaSyncEditionResult,
  OttDeltaSyncRequest,
  OttDeltaSyncResponse,
  OttEditionDetailTree,
  OttEditionSummary,
  OttGlossaryCategory,
  OttGlossaryTerm,
  OttLegalUnit,
  OttMasterBook,
  OttMasterBookGlossaryResponse,
  OttMasterBookWithEditions,
  OttPublicationStatus,
  OttRemoteEditionVersionManifest,
  OttUnitType,
  OttVersionManifestResponse,
} from '../types/ott.ts';
import { buildSeededGlossaryForMasterBook } from './ottGlossarySeed.ts';
import { buildDemoAudioUrl, createSeededOttCatalogData } from './ottSeedData.ts';

export { buildDemoAudioUrl };

export interface OttCatalogDatabase {
  masterBooks: OttMasterBook[];
  editions: OttBookEdition[];
  chapters: OttChapter[];
  units: OttLegalUnit[];
  audioAssets: OttAudioAsset[];
}

export const ALLOWED_AUDIO_MIME_TYPES: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
};

export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function slugifyTitle(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || `book-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generates a compact, genuinely playable PCM WAV tone clip with gentle harmonic envelope
 * used as instant playable audio for seeded OTT content blocks (while uploaded MP3/WAV files
 * stream directly from disk).
 */
export function synthesizePlayableWavBuffer(seedKey: string, durationSec = 2.2): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const clampedDuration = Math.min(5, Math.max(1.2, durationSec));
  const numSamples = Math.floor(sampleRate * clampedDuration);
  const dataByteLength = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  // Deterministic pleasant chord frequencies based on seedKey hash
  const hash = crypto.createHash('sha256').update(seedKey).digest();
  const baseNotes = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
  const f1 = baseNotes[hash[0] % baseNotes.length];
  const f2 = f1 * 1.25;
  const f3 = f1 * 1.5;

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.08);
    const release = Math.min(1, (clampedDuration - t) / 0.35);
    const envelope = Math.max(0, Math.min(attack, release)) * 0.24;
    const wave =
      0.55 * Math.sin(2 * Math.PI * f1 * t) +
      0.28 * Math.sin(2 * Math.PI * f2 * t) +
      0.17 * Math.sin(2 * Math.PI * f3 * t);
    const sample = Math.max(-1, Math.min(1, wave * envelope));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}

export function createSeededOttCatalog(): OttCatalogDatabase {
  const seeded = createSeededOttCatalogData();
  return {
    masterBooks: seeded.masterBooks,
    editions: seeded.editions,
    chapters: seeded.chapters,
    units: seeded.units,
    audioAssets: [],
  };
}

function collectAudioUrlsFromChapter(chapter: OttChapter): string[] {
  return chapter.overviewAudioUrl ? [chapter.overviewAudioUrl] : [];
}

function collectAudioUrlsFromUnit(unit: OttLegalUnit): string[] {
  const urls: string[] = [];
  if (unit.definitionAudioUrl) urls.push(unit.definitionAudioUrl);
  if (unit.purposeAudioUrl) urls.push(unit.purposeAudioUrl);
  if (unit.explanationAudioUrl) urls.push(unit.explanationAudioUrl);
  if (unit.examplesAudioUrl) urls.push(unit.examplesAudioUrl);
  if (unit.fullUnitAudioUrl) urls.push(unit.fullUnitAudioUrl);
  return urls;
}

function normalizeBookType(value: unknown): OttBookType {
  if (value === 'general_law') return 'general_law';
  if (value === 'biography') return 'biography';
  return 'constitutional';
}

function resolveUnitTypeForBookType(bookType: OttBookType | undefined): OttUnitType {
  if (bookType === 'general_law') return 'section';
  if (bookType === 'biography') return 'topic';
  return 'article';
}

function migrateLegacyAudioUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/^\/api\/ott\/audio\//, '/api/books-structures/audio/');
}

export class OttCatalogStore {
  private readonly dbFilePath: string;
  private readonly legacyDbFilePath: string;
  private readonly audioDir: string;
  private data: OttCatalogDatabase | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options?: { dbFilePath?: string; audioDir?: string }) {
    this.dbFilePath =
      options?.dbFilePath ?? path.resolve(process.cwd(), 'data', 'books-structures.json');
    this.legacyDbFilePath = path.resolve(process.cwd(), 'data', 'ott-catalog.json');
    this.audioDir = options?.audioDir ?? path.resolve(process.cwd(), '.ott-audio-uploads');
  }

  private async ensureLoaded(): Promise<OttCatalogDatabase> {
    if (this.data) return this.data;
    const candidatePaths =
      this.dbFilePath === this.legacyDbFilePath
        ? [this.dbFilePath]
        : [this.dbFilePath, this.legacyDbFilePath];

    for (const filePath of candidatePaths) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<OttCatalogDatabase>;
        if (
          parsed &&
          Array.isArray(parsed.masterBooks) &&
          Array.isArray(parsed.editions) &&
          Array.isArray(parsed.chapters) &&
          Array.isArray(parsed.units)
        ) {
          let needsMigrationPersist = filePath !== this.dbFilePath;
          const hydratedMasterBooks = parsed.masterBooks.map((mb) =>
            Array.isArray(mb.glossaryTerms) && mb.glossaryTerms.length > 0
              ? mb
              : { ...mb, glossaryTerms: buildSeededGlossaryForMasterBook(mb) }
          );

          const migratedEditions = parsed.editions.map((ed) => {
            const nextUrl = migrateLegacyAudioUrl(ed.descriptionAudioUrl);
            if (nextUrl !== ed.descriptionAudioUrl) needsMigrationPersist = true;
            return { ...ed, descriptionAudioUrl: nextUrl };
          });

          const migratedChapters = parsed.chapters.map((ch) => {
            const nextUrl = migrateLegacyAudioUrl(ch.overviewAudioUrl);
            if (nextUrl !== ch.overviewAudioUrl) needsMigrationPersist = true;
            return { ...ch, overviewAudioUrl: nextUrl };
          });

          const migratedUnits = parsed.units.map((u) => {
            const definitionAudioUrl = migrateLegacyAudioUrl(u.definitionAudioUrl);
            const purposeAudioUrl = migrateLegacyAudioUrl(u.purposeAudioUrl);
            const explanationAudioUrl = migrateLegacyAudioUrl(u.explanationAudioUrl);
            const examplesAudioUrl = migrateLegacyAudioUrl(u.examplesAudioUrl);
            const fullUnitAudioUrl = migrateLegacyAudioUrl(u.fullUnitAudioUrl);
            if (
              definitionAudioUrl !== u.definitionAudioUrl ||
              purposeAudioUrl !== u.purposeAudioUrl ||
              explanationAudioUrl !== u.explanationAudioUrl ||
              examplesAudioUrl !== u.examplesAudioUrl ||
              fullUnitAudioUrl !== u.fullUnitAudioUrl
            ) {
              needsMigrationPersist = true;
            }
            return {
              ...u,
              definitionAudioUrl,
              purposeAudioUrl,
              explanationAudioUrl,
              examplesAudioUrl,
              fullUnitAudioUrl,
            };
          });

          const migratedAssets = (Array.isArray(parsed.audioAssets) ? parsed.audioAssets : []).map(
            (asset) => {
              const nextUrl = migrateLegacyAudioUrl(asset.storageUrl) ?? asset.storageUrl;
              if (nextUrl !== asset.storageUrl) needsMigrationPersist = true;
              return { ...asset, storageUrl: nextUrl };
            }
          );

          // Ensure seeded Biography Master Book is present when upgrading an older catalog file
          const seeded = createSeededOttCatalogData();
          const bioMaster = seeded.masterBooks.find((mb) => mb.id === 'mb-ambedkar-biography');
          if (bioMaster && !hydratedMasterBooks.some((mb) => mb.id === bioMaster.id)) {
            hydratedMasterBooks.push(bioMaster);
            migratedEditions.push(
              ...seeded.editions.filter((ed) => ed.masterBookId === bioMaster.id)
            );
            const bioEditionIds = new Set(
              seeded.editions.filter((ed) => ed.masterBookId === bioMaster.id).map((ed) => ed.id)
            );
            migratedChapters.push(...seeded.chapters.filter((ch) => bioEditionIds.has(ch.editionId)));
            migratedUnits.push(...seeded.units.filter((u) => bioEditionIds.has(u.editionId)));
            needsMigrationPersist = true;
          }

          this.data = {
            masterBooks: hydratedMasterBooks,
            editions: migratedEditions,
            chapters: migratedChapters,
            units: migratedUnits,
            audioAssets: migratedAssets,
          };
          if (needsMigrationPersist) {
            await this.persist();
          }
          return this.data;
        }
      } catch {
        // Try next candidate path or seed fresh
      }
    }

    this.data = createSeededOttCatalog();
    await this.persist();
    return this.data;
  }

  private async persist(): Promise<void> {
    if (!this.data) return;
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.dbFilePath), { recursive: true });
      const tempPath = `${this.dbFilePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.writeFile(tempPath, snapshot, 'utf-8');
      await fs.rename(tempPath, this.dbFilePath);
    });
    await this.writeChain;
  }

  private buildEditionSummary(db: OttCatalogDatabase, edition: OttBookEdition): OttEditionSummary {
    const activeChapters = db.chapters.filter((c) => c.editionId === edition.id && !c.isDeleted);
    const activeUnits = db.units.filter((u) => u.editionId === edition.id && !u.isDeleted);
    return {
      ...edition,
      chapterCount: activeChapters.length,
      unitCount: activeUnits.length,
    };
  }

  async listMasterBooks(): Promise<OttMasterBookWithEditions[]> {
    const db = await this.ensureLoaded();
    return db.masterBooks
      .filter((mb) => !mb.isDeleted)
      .map((mb) => ({
        ...mb,
        editions: db.editions
          .filter((e) => e.masterBookId === mb.id && !e.isDeleted)
          .map((e) => this.buildEditionSummary(db, e)),
      }));
  }

  async getEditionTree(editionId: string): Promise<OttEditionDetailTree | null> {
    const db = await this.ensureLoaded();
    const edition = db.editions.find((e) => e.id === editionId && !e.isDeleted);
    if (!edition) return null;
    const masterBook = db.masterBooks.find((mb) => mb.id === edition.masterBookId && !mb.isDeleted);
    if (!masterBook) return null;

    const siblingEditions = db.editions
      .filter((e) => e.masterBookId === masterBook.id && !e.isDeleted)
      .map((e) => this.buildEditionSummary(db, e));

    const chapters = db.chapters
      .filter((c) => c.editionId === edition.id && !c.isDeleted)
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((ch) => ({
        ...ch,
        units: db.units
          .filter((u) => u.chapterId === ch.id && !u.isDeleted)
          .sort((a, b) => a.unitOrder - b.unitOrder),
      }));

    return {
      masterBook,
      edition,
      siblingEditions,
      chapters,
    };
  }

  async createMasterBook(input: {
    canonicalTitle: string;
    bookType: OttBookType;
    jurisdiction?: string;
    enactmentYear?: string;
    coverTone?: OttMasterBook['coverTone'];
    coverImageUrl?: string;
  }): Promise<OttMasterBook> {
    const db = await this.ensureLoaded();
    const canonicalTitle = input.canonicalTitle.trim();
    if (canonicalTitle.length < 2 || canonicalTitle.length > 240) {
      throw new Error('Master Book title must be between 2 and 240 characters.');
    }
    const baseSlug = slugifyTitle(canonicalTitle);
    const slug = db.masterBooks.some((b) => b.slug === baseSlug)
      ? `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`
      : baseSlug;
    const now = new Date().toISOString();

    const masterBook: OttMasterBook = {
      id: `mb-${crypto.randomUUID().slice(0, 8)}`,
      slug,
      bookType: normalizeBookType(input.bookType),
      canonicalTitle,
      jurisdiction: (input.jurisdiction ?? 'Republic of India').trim().slice(0, 160),
      enactmentYear: (input.enactmentYear ?? '2025').trim().slice(0, 32),
      ...(input.coverImageUrl?.trim() ? { coverImageUrl: input.coverImageUrl.trim() } : {}),
      coverTone: input.coverTone ?? 'cobalt',
      versionNumber: 1,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    db.masterBooks.push(masterBook);
    await this.persist();
    return masterBook;
  }

  async softDeleteMasterBook(masterBookId: string): Promise<{ deleted: true; affectedEditionIds: string[] }> {
    const db = await this.ensureLoaded();
    const masterBook = db.masterBooks.find((mb) => mb.id === masterBookId && !mb.isDeleted);
    if (!masterBook) {
      throw new Error('Master Book not found.');
    }
    const now = new Date().toISOString();
    masterBook.isDeleted = true;
    masterBook.versionNumber += 1;
    masterBook.updatedAt = now;

    const affectedEditionIds: string[] = [];
    for (const edition of db.editions) {
      if (edition.masterBookId === masterBookId && !edition.isDeleted) {
        edition.isDeleted = true;
        edition.versionNumber += 1;
        edition.updatedAt = now;
        affectedEditionIds.push(edition.id);
      }
    }
    const edSet = new Set(affectedEditionIds);
    for (const ch of db.chapters) {
      if (edSet.has(ch.editionId) && !ch.isDeleted) {
        ch.isDeleted = true;
        ch.versionNumber += 1;
        ch.updatedAt = now;
      }
    }
    for (const u of db.units) {
      if (edSet.has(u.editionId) && !u.isDeleted) {
        u.isDeleted = true;
        u.versionNumber += 1;
        u.updatedAt = now;
      }
    }

    await this.persist();
    return { deleted: true, affectedEditionIds };
  }

  /**
   * Atomically creates a Master Book along with one or more manually authored Language Editions,
   * an optional initial Chapter, and one or more Articles/Sections/Topics.
   */
  async createMasterBookBundle(input: {
    canonicalTitle: string;
    bookType: OttBookType;
    jurisdiction?: string;
    enactmentYear?: string;
    coverTone?: OttMasterBook['coverTone'];
    edition?: {
      languageCode: string;
      languageName: string;
      nativeLanguageName: string;
      title?: string;
      subtitle?: string;
      description?: string;
      narratorName?: string;
      descriptionAudioUrl?: string;
    };
    editions?: Array<{
      languageCode: string;
      languageName: string;
      nativeLanguageName: string;
      title?: string;
      subtitle?: string;
      description?: string;
      narratorName?: string;
      descriptionAudioUrl?: string;
    }>;
    chapter?: {
      chapterNumber: string;
      title: string;
      overviewDefinition?: string;
      overviewAudioUrl?: string;
      estimatedMinutes?: number;
    };
    units?: Array<{
      unitNumber: string;
      title: string;
      definition: string;
      purposeBackground?: string;
      deepExplanation?: string;
      practicalExamples?: string;
      definitionAudioUrl?: string;
      purposeAudioUrl?: string;
      explanationAudioUrl?: string;
      examplesAudioUrl?: string;
      fullUnitAudioUrl?: string;
    }>;
  }): Promise<{
    masterBook: OttMasterBook;
    edition?: OttBookEdition;
    editions: OttBookEdition[];
    chapter?: OttChapter;
    units: OttLegalUnit[];
  }> {
    const masterBook = await this.createMasterBook({
      canonicalTitle: input.canonicalTitle,
      bookType: input.bookType,
      jurisdiction: input.jurisdiction,
      enactmentYear: input.enactmentYear,
      coverTone: input.coverTone,
    });

    const editionInputs =
      Array.isArray(input.editions) && input.editions.length > 0
        ? input.editions
        : input.edition && input.edition.languageCode.trim()
          ? [input.edition]
          : [];

    const createdEditions: OttBookEdition[] = [];
    for (const edInput of editionInputs) {
      if (!edInput.languageCode?.trim()) continue;
      const createdEd = await this.createEdition(masterBook.id, {
        languageCode: edInput.languageCode,
        languageName: edInput.languageName,
        nativeLanguageName: edInput.nativeLanguageName,
        title: edInput.title?.trim() || masterBook.canonicalTitle,
        subtitle: edInput.subtitle,
        description: edInput.description,
        narratorName: edInput.narratorName,
        descriptionAudioUrl: edInput.descriptionAudioUrl,
        status: 'published',
      });
      createdEditions.push(createdEd);
    }

    const primaryEdition = createdEditions[0];
    let chapter: OttChapter | undefined;
    const createdUnits: OttLegalUnit[] = [];

    if (primaryEdition && input.chapter && input.chapter.title.trim()) {
      chapter = await this.createChapter(primaryEdition.id, {
        chapterNumber: input.chapter.chapterNumber || 'Chapter 1',
        title: input.chapter.title,
        overviewDefinition: input.chapter.overviewDefinition,
        overviewAudioUrl: input.chapter.overviewAudioUrl,
        estimatedMinutes: input.chapter.estimatedMinutes,
      });

      for (const u of input.units ?? []) {
        if (u.title.trim().length >= 2 && u.definition.trim().length >= 5) {
          const created = await this.createLegalUnit(chapter.id, {
            unitNumber: u.unitNumber,
            title: u.title,
            definition: u.definition,
            purposeBackground: u.purposeBackground,
            deepExplanation: u.deepExplanation,
            practicalExamples: u.practicalExamples,
            definitionAudioUrl: u.definitionAudioUrl,
            purposeAudioUrl: u.purposeAudioUrl,
            explanationAudioUrl: u.explanationAudioUrl,
            examplesAudioUrl: u.examplesAudioUrl,
            fullUnitAudioUrl: u.fullUnitAudioUrl,
          });
          createdUnits.push(created);
        }
      }
    }

    return {
      masterBook,
      edition: primaryEdition,
      editions: createdEditions,
      chapter,
      units: createdUnits,
    };
  }

  async createEdition(
    masterBookId: string,
    input: {
      languageCode: string;
      languageName: string;
      nativeLanguageName: string;
      title: string;
      subtitle?: string;
      description?: string;
      narratorName?: string;
      status?: OttPublicationStatus;
      descriptionAudioUrl?: string;
    }
  ): Promise<OttBookEdition> {
    const db = await this.ensureLoaded();
    const masterBook = db.masterBooks.find((mb) => mb.id === masterBookId && !mb.isDeleted);
    if (!masterBook) {
      throw new Error('Master Book not found.');
    }

    const languageCode = input.languageCode.trim().toLowerCase().slice(0, 16);
    if (!languageCode) {
      throw new Error('Language code is required.');
    }
    const duplicate = db.editions.find(
      (e) => e.masterBookId === masterBookId && e.languageCode === languageCode && !e.isDeleted
    );
    if (duplicate) {
      throw new Error(`An edition for language "${languageCode}" already exists under this Master Book.`);
    }

    const title = input.title.trim();
    if (title.length < 2 || title.length > 240) {
      throw new Error('Edition title must be between 2 and 240 characters.');
    }

    const now = new Date().toISOString();
    const id = `ed-${crypto.randomUUID().slice(0, 8)}`;
    const edition: OttBookEdition = {
      id,
      masterBookId,
      languageCode,
      languageName: input.languageName.trim().slice(0, 64) || languageCode.toUpperCase(),
      nativeLanguageName: input.nativeLanguageName.trim().slice(0, 64) || input.languageName.trim(),
      title,
      subtitle: (input.subtitle ?? '').trim().slice(0, 360),
      description: (input.description ?? '').trim().slice(0, 4000),
      // Strict 1-to-1 manual audio: only bound when explicitly uploaded
      descriptionAudioUrl: input.descriptionAudioUrl?.trim() || undefined,
      coverImageUrl: masterBook.coverImageUrl,
      narratorName: (input.narratorName ?? 'Editorial Studio').trim().slice(0, 120),
      status: input.status ?? 'published',
      versionNumber: 1,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    db.editions.push(edition);
    masterBook.versionNumber += 1;
    masterBook.updatedAt = now;
    await this.persist();
    return edition;
  }

  async updateEdition(
    editionId: string,
    patch: Partial<
      Pick<
        OttBookEdition,
        'title' | 'subtitle' | 'description' | 'descriptionAudioUrl' | 'narratorName' | 'status'
      >
    >
  ): Promise<OttBookEdition> {
    const db = await this.ensureLoaded();
    const edition = db.editions.find((e) => e.id === editionId && !e.isDeleted);
    if (!edition) throw new Error('Book edition not found.');

    const now = new Date().toISOString();
    if (typeof patch.title === 'string' && patch.title.trim().length >= 2) {
      edition.title = patch.title.trim().slice(0, 240);
    }
    if (typeof patch.subtitle === 'string') {
      edition.subtitle = patch.subtitle.trim().slice(0, 360);
    }
    if (typeof patch.description === 'string') {
      edition.description = patch.description.trim().slice(0, 4000);
    }
    if (typeof patch.descriptionAudioUrl === 'string') {
      edition.descriptionAudioUrl = patch.descriptionAudioUrl.trim() || undefined;
    }
    if (typeof patch.narratorName === 'string' && patch.narratorName.trim()) {
      edition.narratorName = patch.narratorName.trim().slice(0, 120);
    }
    if (patch.status) {
      edition.status = patch.status;
    }
    edition.versionNumber += 1;
    edition.updatedAt = now;

    await this.persist();
    return edition;
  }

  async createChapter(
    editionId: string,
    input: {
      chapterNumber: string;
      title: string;
      overviewDefinition?: string;
      overviewAudioUrl?: string;
      estimatedMinutes?: number;
    }
  ): Promise<OttChapter> {
    const db = await this.ensureLoaded();
    const edition = db.editions.find((e) => e.id === editionId && !e.isDeleted);
    if (!edition) throw new Error('Book edition not found.');

    const title = input.title.trim();
    if (title.length < 2 || title.length > 240) {
      throw new Error('Chapter title must be between 2 and 240 characters.');
    }

    const existingChapters = db.chapters.filter((c) => c.editionId === editionId && !c.isDeleted);
    const nextOrder =
      existingChapters.reduce((max, c) => Math.max(max, c.chapterOrder), 0) + 1;
    const now = new Date().toISOString();
    const id = `ch-${crypto.randomUUID().slice(0, 8)}`;

    const chapter: OttChapter = {
      id,
      editionId,
      chapterOrder: nextOrder,
      chapterNumber: (input.chapterNumber || `Chapter ${nextOrder}`).trim().slice(0, 64),
      title,
      overviewDefinition: (input.overviewDefinition ?? '').trim().slice(0, 4000),
      // Strict 1-to-1 manual audio: only bound when explicitly uploaded
      overviewAudioUrl: input.overviewAudioUrl?.trim() || undefined,
      estimatedMinutes:
        typeof input.estimatedMinutes === 'number' && Number.isFinite(input.estimatedMinutes) && input.estimatedMinutes >= 1
          ? Math.round(input.estimatedMinutes)
          : 6,
      versionNumber: 1,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    db.chapters.push(chapter);
    // Bump parent edition version so mobile Delta-Sync detects the new chapter immediately
    edition.versionNumber += 1;
    edition.updatedAt = now;
    await this.persist();
    return chapter;
  }

  async updateChapter(
    chapterId: string,
    patch: Partial<
      Pick<
        OttChapter,
        'chapterNumber' | 'title' | 'overviewDefinition' | 'overviewAudioUrl' | 'estimatedMinutes'
      >
    >
  ): Promise<OttChapter> {
    const db = await this.ensureLoaded();
    const chapter = db.chapters.find((c) => c.id === chapterId && !c.isDeleted);
    if (!chapter) throw new Error('Chapter not found.');

    const edition = db.editions.find((e) => e.id === chapter.editionId);
    const now = new Date().toISOString();

    if (typeof patch.chapterNumber === 'string' && patch.chapterNumber.trim()) {
      chapter.chapterNumber = patch.chapterNumber.trim().slice(0, 64);
    }
    if (typeof patch.title === 'string' && patch.title.trim().length >= 2) {
      chapter.title = patch.title.trim().slice(0, 240);
    }
    if (typeof patch.overviewDefinition === 'string') {
      chapter.overviewDefinition = patch.overviewDefinition.trim().slice(0, 4000);
    }
    if (typeof patch.overviewAudioUrl === 'string') {
      chapter.overviewAudioUrl = patch.overviewAudioUrl.trim() || undefined;
    }
    if (
      typeof patch.estimatedMinutes === 'number' &&
      Number.isFinite(patch.estimatedMinutes) &&
      patch.estimatedMinutes >= 1
    ) {
      chapter.estimatedMinutes = Math.round(patch.estimatedMinutes);
    }

    chapter.versionNumber += 1;
    chapter.updatedAt = now;
    if (edition) {
      edition.versionNumber += 1;
      edition.updatedAt = now;
    }

    await this.persist();
    return chapter;
  }

  async softDeleteChapter(chapterId: string): Promise<{ deleted: true; editionVersion: number }> {
    const db = await this.ensureLoaded();
    const chapter = db.chapters.find((c) => c.id === chapterId && !c.isDeleted);
    if (!chapter) throw new Error('Chapter not found.');

    const now = new Date().toISOString();
    chapter.isDeleted = true;
    chapter.versionNumber += 1;
    chapter.updatedAt = now;

    for (const unit of db.units) {
      if (unit.chapterId === chapterId && !unit.isDeleted) {
        unit.isDeleted = true;
        unit.versionNumber += 1;
        unit.updatedAt = now;
      }
    }

    const edition = db.editions.find((e) => e.id === chapter.editionId);
    let editionVersion = 1;
    if (edition) {
      edition.versionNumber += 1;
      edition.updatedAt = now;
      editionVersion = edition.versionNumber;
    }

    await this.persist();
    return { deleted: true, editionVersion };
  }

  async createLegalUnit(
    chapterId: string,
    input: {
      unitNumber: string;
      title: string;
      definition: string;
      purposeBackground?: string;
      deepExplanation?: string;
      practicalExamples?: string;
      definitionAudioUrl?: string;
      purposeAudioUrl?: string;
      explanationAudioUrl?: string;
      examplesAudioUrl?: string;
      fullUnitAudioUrl?: string;
      audioDurationSec?: number;
    }
  ): Promise<OttLegalUnit> {
    const db = await this.ensureLoaded();
    const chapter = db.chapters.find((c) => c.id === chapterId && !c.isDeleted);
    if (!chapter) throw new Error('Chapter not found.');
    const edition = db.editions.find((e) => e.id === chapter.editionId && !e.isDeleted);
    if (!edition) throw new Error('Edition not found.');
    const masterBook = db.masterBooks.find((mb) => mb.id === edition.masterBookId);

    const title = input.title.trim();
    const definition = input.definition.trim();
    if (title.length < 2) throw new Error('Article/Section title is required.');
    if (definition.length < 5) throw new Error('Definition text must be at least 5 characters.');

    const existingUnits = db.units.filter((u) => u.chapterId === chapterId && !u.isDeleted);
    const nextOrder = existingUnits.reduce((max, u) => Math.max(max, u.unitOrder), 0) + 1;
    const unitType = resolveUnitTypeForBookType(masterBook?.bookType);
    const defaultPrefix =
      unitType === 'article' ? 'Article' : unitType === 'section' ? 'Section' : 'Topic';
    const now = new Date().toISOString();
    const id = `u-${crypto.randomUUID().slice(0, 8)}`;

    const unit: OttLegalUnit = {
      id,
      chapterId,
      editionId: edition.id,
      unitType,
      unitOrder: nextOrder,
      unitNumber: (input.unitNumber || `${defaultPrefix} ${nextOrder}`).trim().slice(0, 64),
      title: title.slice(0, 260),
      definition: definition.slice(0, 6000),
      purposeBackground: (input.purposeBackground ?? '').trim().slice(0, 6000),
      deepExplanation: (input.deepExplanation ?? '').trim().slice(0, 6000),
      practicalExamples: (input.practicalExamples ?? '').trim().slice(0, 6000),
      // Strict 1-to-1 manual audio: only attached when uploaded in Books & Structures CMS
      definitionAudioUrl: input.definitionAudioUrl?.trim() || undefined,
      purposeAudioUrl: input.purposeAudioUrl?.trim() || undefined,
      explanationAudioUrl: input.explanationAudioUrl?.trim() || undefined,
      examplesAudioUrl: input.examplesAudioUrl?.trim() || undefined,
      fullUnitAudioUrl: input.fullUnitAudioUrl?.trim() || undefined,
      audioDurationSec:
        typeof input.audioDurationSec === 'number' &&
        Number.isFinite(input.audioDurationSec) &&
        input.audioDurationSec >= 1
          ? Math.round(input.audioDurationSec)
          : 0,
      versionNumber: 1,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    db.units.push(unit);
    chapter.versionNumber += 1;
    chapter.updatedAt = now;
    edition.versionNumber += 1;
    edition.updatedAt = now;
    await this.persist();
    return unit;
  }

  async updateLegalUnit(
    unitId: string,
    patch: Partial<
      Pick<
        OttLegalUnit,
        | 'unitNumber'
        | 'title'
        | 'definition'
        | 'purposeBackground'
        | 'deepExplanation'
        | 'practicalExamples'
        | 'definitionAudioUrl'
        | 'purposeAudioUrl'
        | 'explanationAudioUrl'
        | 'examplesAudioUrl'
        | 'fullUnitAudioUrl'
        | 'audioDurationSec'
      >
    >
  ): Promise<OttLegalUnit> {
    const db = await this.ensureLoaded();
    const unit = db.units.find((u) => u.id === unitId && !u.isDeleted);
    if (!unit) throw new Error('Article or Section not found.');

    const chapter = db.chapters.find((c) => c.id === unit.chapterId);
    const edition = db.editions.find((e) => e.id === unit.editionId);
    const now = new Date().toISOString();

    if (typeof patch.unitNumber === 'string' && patch.unitNumber.trim()) {
      unit.unitNumber = patch.unitNumber.trim().slice(0, 64);
    }
    if (typeof patch.title === 'string' && patch.title.trim().length >= 2) {
      unit.title = patch.title.trim().slice(0, 260);
    }
    if (typeof patch.definition === 'string' && patch.definition.trim().length >= 5) {
      unit.definition = patch.definition.trim().slice(0, 6000);
    }
    if (typeof patch.purposeBackground === 'string') {
      unit.purposeBackground = patch.purposeBackground.trim().slice(0, 6000);
    }
    if (typeof patch.deepExplanation === 'string') {
      unit.deepExplanation = patch.deepExplanation.trim().slice(0, 6000);
    }
    if (typeof patch.practicalExamples === 'string') {
      unit.practicalExamples = patch.practicalExamples.trim().slice(0, 6000);
    }
    if (typeof patch.definitionAudioUrl === 'string') {
      unit.definitionAudioUrl = patch.definitionAudioUrl.trim() || undefined;
    }
    if (typeof patch.purposeAudioUrl === 'string') {
      unit.purposeAudioUrl = patch.purposeAudioUrl.trim() || undefined;
    }
    if (typeof patch.explanationAudioUrl === 'string') {
      unit.explanationAudioUrl = patch.explanationAudioUrl.trim() || undefined;
    }
    if (typeof patch.examplesAudioUrl === 'string') {
      unit.examplesAudioUrl = patch.examplesAudioUrl.trim() || undefined;
    }
    if (typeof patch.fullUnitAudioUrl === 'string') {
      unit.fullUnitAudioUrl = patch.fullUnitAudioUrl.trim() || undefined;
    }
    if (
      typeof patch.audioDurationSec === 'number' &&
      Number.isFinite(patch.audioDurationSec) &&
      patch.audioDurationSec >= 5
    ) {
      unit.audioDurationSec = Math.round(patch.audioDurationSec);
    }

    unit.versionNumber += 1;
    unit.updatedAt = now;
    if (chapter) {
      chapter.versionNumber += 1;
      chapter.updatedAt = now;
    }
    if (edition) {
      edition.versionNumber += 1;
      edition.updatedAt = now;
    }

    await this.persist();
    return unit;
  }

  async softDeleteLegalUnit(unitId: string): Promise<{ deleted: true; editionVersion: number }> {
    const db = await this.ensureLoaded();
    const unit = db.units.find((u) => u.id === unitId && !u.isDeleted);
    if (!unit) throw new Error('Article or Section not found.');

    const now = new Date().toISOString();
    unit.isDeleted = true;
    unit.versionNumber += 1;
    unit.updatedAt = now;

    const chapter = db.chapters.find((c) => c.id === unit.chapterId);
    if (chapter) {
      chapter.versionNumber += 1;
      chapter.updatedAt = now;
    }
    const edition = db.editions.find((e) => e.id === unit.editionId);
    let editionVersion = 1;
    if (edition) {
      edition.versionNumber += 1;
      edition.updatedAt = now;
      editionVersion = edition.versionNumber;
    }

    await this.persist();
    return { deleted: true, editionVersion };
  }

  /**
   * Saves an uploaded audio file securely inside the confined audio directory,
   * validates MIME type and byte size, attaches the resulting URL to the target
   * Edition/Chapter/LegalUnit block, and increments sync versions cleanly.
   */
  async saveUploadedAudio(input: {
    entityType: OttAudioEntityType;
    entityId: string;
    blockRole: OttAudioBlockRole;
    originalFilename: string;
    mimeType: string;
    base64Data: string;
    durationSec?: number;
    uploadedByUid?: string;
  }): Promise<OttAudioAsset> {
    const db = await this.ensureLoaded();
    const normalizedMime = input.mimeType.trim().toLowerCase().split(';')[0];
    const ext = ALLOWED_AUDIO_MIME_TYPES[normalizedMime];
    if (!ext) {
      throw new Error('Unsupported audio format. Please upload MP3, WAV, OGG, WEBM, or M4A.');
    }

    const cleanedBase64 = input.base64Data.includes(',')
      ? input.base64Data.slice(input.base64Data.indexOf(',') + 1)
      : input.base64Data;
    const buffer = Buffer.from(cleanedBase64, 'base64');
    if (buffer.length === 0) {
      throw new Error('Uploaded audio file is empty.');
    }
    if (buffer.length > MAX_AUDIO_UPLOAD_BYTES) {
      throw new Error('Audio file exceeds the 10 MB upload limit.');
    }

    const assetId = `aud-${crypto.randomUUID().slice(0, 12)}`;
    const safeFileName = `${assetId}${ext}`;
    await fs.mkdir(this.audioDir, { recursive: true });
    const resolvedPath = path.resolve(this.audioDir, safeFileName);
    if (!resolvedPath.startsWith(this.audioDir + path.sep)) {
      throw new Error('Invalid audio storage path.');
    }
    await fs.writeFile(resolvedPath, buffer);

    const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageUrl = `/api/books-structures/audio/${assetId}`;
    const now = new Date().toISOString();

    const asset: OttAudioAsset = {
      id: assetId,
      entityType: input.entityType,
      entityId: input.entityId,
      blockRole: input.blockRole,
      originalFilename: path.basename(input.originalFilename || safeFileName).slice(0, 200),
      storageUrl,
      mimeType: normalizedMime,
      byteSize: buffer.length,
      durationSec:
        typeof input.durationSec === 'number' && Number.isFinite(input.durationSec) && input.durationSec > 0
          ? Math.round(input.durationSec)
          : Math.max(5, Math.round(buffer.length / 16000)),
      sha256Checksum,
      uploadedByUid: (input.uploadedByUid ?? 'cms-admin').slice(0, 128),
      createdAt: now,
    };

    db.audioAssets.push(asset);

    // Attach URL directly to target entity and bump sync versions
    if (input.entityType === 'edition') {
      await this.updateEdition(input.entityId, { descriptionAudioUrl: storageUrl });
    } else if (input.entityType === 'chapter') {
      await this.updateChapter(input.entityId, { overviewAudioUrl: storageUrl });
    } else if (input.entityType === 'legal_unit') {
      const unitPatch: Partial<OttLegalUnit> = {};
      if (input.blockRole === 'unit_definition') unitPatch.definitionAudioUrl = storageUrl;
      else if (input.blockRole === 'unit_purpose') unitPatch.purposeAudioUrl = storageUrl;
      else if (input.blockRole === 'unit_explanation') unitPatch.explanationAudioUrl = storageUrl;
      else if (input.blockRole === 'unit_examples') unitPatch.examplesAudioUrl = storageUrl;
      else unitPatch.fullUnitAudioUrl = storageUrl;
      await this.updateLegalUnit(input.entityId, unitPatch);
    } else {
      await this.persist();
    }

    return asset;
  }

  async readAudioAssetFile(
    assetId: string
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    if (!/^[a-zA-Z0-9_-]{3,140}$/.test(assetId)) {
      return null;
    }

    // Seeded synthesized preview audio for instant playback on every seeded block
    if (assetId.startsWith('synth-')) {
      return {
        buffer: synthesizePlayableWavBuffer(assetId, 2.4),
        mimeType: 'audio/wav',
        filename: `${assetId}.wav`,
      };
    }

    const db = await this.ensureLoaded();
    const asset = db.audioAssets.find((a) => a.id === assetId);
    if (!asset) return null;

    const ext = ALLOWED_AUDIO_MIME_TYPES[asset.mimeType];
    if (!ext) return null;

    const resolvedPath = path.resolve(this.audioDir, `${asset.id}${ext}`);
    if (!resolvedPath.startsWith(this.audioDir + path.sep)) {
      return null;
    }

    try {
      const buffer = await fs.readFile(resolvedPath);
      return {
        buffer,
        mimeType: asset.mimeType,
        filename: asset.originalFilename,
      };
    } catch {
      return null;
    }
  }

  /**
   * Incremental Mobile Delta-Sync Engine:
   * Compares the mobile device's locally stored edition/chapter/unit version map
   * against the authoritative catalog and returns ONLY added, updated, or soft-deleted
   * records plus the exact list of new/changed audio URLs to prefetch offline.
   */
  async computeDeltaSync(request: OttDeltaSyncRequest): Promise<OttDeltaSyncResponse> {
    const db = await this.ensureLoaded();
    const serverTime = new Date().toISOString();
    const results: OttDeltaSyncEditionResult[] = [];
    let totalAddedChapters = 0;
    let totalUpdatedChapters = 0;
    let totalAddedUnits = 0;
    let totalUpdatedUnits = 0;

    const trackedList = Array.isArray(request.downloadedEditions)
      ? request.downloadedEditions.slice(0, 50)
      : [];

    for (const item of trackedList) {
      if (!item || typeof item.editionId !== 'string') continue;

      const edition = db.editions.find((e) => e.id === item.editionId);
      if (!edition || edition.isDeleted) {
        results.push({
          editionId: item.editionId,
          masterBookId: edition?.masterBookId ?? '',
          editionTitle: edition?.title ?? 'Removed Edition',
          languageName: edition?.languageName ?? '',
          upToDate: false,
          editionDeleted: true,
          latestEditionVersion: edition?.versionNumber ?? item.editionVersion,
          editionUpdated: false,
          addedChapters: [],
          updatedChapters: [],
          deletedChapterIds: Object.keys(item.chapterVersions ?? {}),
          addedUnits: [],
          updatedUnits: [],
          deletedUnitIds: Object.keys(item.unitVersions ?? {}),
          audioUrlsToPrefetch: [],
          syncedAt: serverTime,
        });
        continue;
      }

      const clientChapterVersions = item.chapterVersions ?? {};
      const clientUnitVersions = item.unitVersions ?? {};

      const editionChapters = db.chapters
        .filter((c) => c.editionId === edition.id)
        .sort((a, b) => a.chapterOrder - b.chapterOrder);
      const editionUnits = db.units
        .filter((u) => u.editionId === edition.id)
        .sort((a, b) => a.unitOrder - b.unitOrder);

      const addedChapters: OttChapter[] = [];
      const updatedChapters: OttChapter[] = [];
      const deletedChapterIds: string[] = [];

      const addedUnits: OttLegalUnit[] = [];
      const updatedUnits: OttLegalUnit[] = [];
      const deletedUnitIds: string[] = [];
      const audioUrls = new Set<string>();

      for (const ch of editionChapters) {
        const clientVer = clientChapterVersions[ch.id];
        if (ch.isDeleted) {
          if (clientVer !== undefined) {
            deletedChapterIds.push(ch.id);
          }
          continue;
        }
        if (clientVer === undefined) {
          addedChapters.push(ch);
          collectAudioUrlsFromChapter(ch).forEach((u) => audioUrls.add(u));
        } else if (ch.versionNumber > clientVer) {
          updatedChapters.push(ch);
          collectAudioUrlsFromChapter(ch).forEach((u) => audioUrls.add(u));
        }
      }

      for (const unit of editionUnits) {
        const clientVer = clientUnitVersions[unit.id];
        if (unit.isDeleted) {
          if (clientVer !== undefined) {
            deletedUnitIds.push(unit.id);
          }
          continue;
        }
        if (clientVer === undefined) {
          addedUnits.push(unit);
          collectAudioUrlsFromUnit(unit).forEach((u) => audioUrls.add(u));
        } else if (unit.versionNumber > clientVer) {
          updatedUnits.push(unit);
          collectAudioUrlsFromUnit(unit).forEach((u) => audioUrls.add(u));
        }
      }

      const editionUpdated = edition.versionNumber > (item.editionVersion ?? 0);
      if (editionUpdated && edition.descriptionAudioUrl) {
        audioUrls.add(edition.descriptionAudioUrl);
      }

      const hasDelta =
        editionUpdated ||
        addedChapters.length > 0 ||
        updatedChapters.length > 0 ||
        deletedChapterIds.length > 0 ||
        addedUnits.length > 0 ||
        updatedUnits.length > 0 ||
        deletedUnitIds.length > 0;

      totalAddedChapters += addedChapters.length;
      totalUpdatedChapters += updatedChapters.length;
      totalAddedUnits += addedUnits.length;
      totalUpdatedUnits += updatedUnits.length;

      results.push({
        editionId: edition.id,
        masterBookId: edition.masterBookId,
        editionTitle: edition.title,
        languageName: edition.languageName,
        upToDate: !hasDelta,
        editionDeleted: false,
        latestEditionVersion: edition.versionNumber,
        editionUpdated,
        ...(editionUpdated ? { edition } : {}),
        addedChapters,
        updatedChapters,
        deletedChapterIds,
        addedUnits,
        updatedUnits,
        deletedUnitIds,
        audioUrlsToPrefetch: Array.from(audioUrls),
        syncedAt: serverTime,
      });
    }

    return {
      serverTime,
      results,
      totalAddedChapters,
      totalUpdatedChapters,
      totalAddedUnits,
      totalUpdatedUnits,
    };
  }

  /**
   * Lightweight Version Manifest Endpoint:
   * Returns only version numbers, soft-delete flags, and updated timestamps for requested
   * editions and their chapters/sections so mobile devices can perform fast local metadata
   * comparison on reconnection before requesting incremental content downloads.
   */
  async getVersionManifest(editionIds?: string[]): Promise<OttVersionManifestResponse> {
    const db = await this.ensureLoaded();
    const serverTime = new Date().toISOString();

    const requestedIds = Array.isArray(editionIds)
      ? Array.from(
          new Set(
            editionIds
              .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
              .map((id) => id.trim())
          )
        ).slice(0, 50)
      : null;

    const targetEditions =
      requestedIds && requestedIds.length > 0
        ? requestedIds.map((id) => ({
            requestedId: id,
            record: db.editions.find((e) => e.id === id) ?? null,
          }))
        : db.editions
            .filter((e) => !e.isDeleted)
            .map((record) => ({ requestedId: record.id, record }));

    const editions: OttRemoteEditionVersionManifest[] = targetEditions.map(
      ({ requestedId, record }) => {
        if (!record) {
          return {
            editionId: requestedId,
            masterBookId: '',
            editionTitle: 'Removed Edition',
            languageName: '',
            versionNumber: 0,
            isDeleted: true,
            updatedAt: serverTime,
            chapters: [],
            units: [],
          };
        }

        const chapters = db.chapters
          .filter((c) => c.editionId === record.id)
          .sort((a, b) => a.chapterOrder - b.chapterOrder)
          .map((c) => ({
            id: c.id,
            versionNumber: c.versionNumber,
            isDeleted: c.isDeleted,
            updatedAt: c.updatedAt,
          }));

        const units = db.units
          .filter((u) => u.editionId === record.id)
          .sort((a, b) => a.unitOrder - b.unitOrder)
          .map((u) => ({
            id: u.id,
            chapterId: u.chapterId,
            versionNumber: u.versionNumber,
            isDeleted: u.isDeleted,
            updatedAt: u.updatedAt,
          }));

        return {
          editionId: record.id,
          masterBookId: record.masterBookId,
          editionTitle: record.title,
          languageName: record.languageName,
          versionNumber: record.versionNumber,
          isDeleted: record.isDeleted,
          updatedAt: record.updatedAt,
          chapters,
          units,
        };
      }
    );

    return {
      serverTime,
      editions,
    };
  }

  /**
   * Resolves curated legal glossary metadata from backend Master Books.
   * Prioritizes terms attached to the matched Master Book (by ID, slug, or title similarity),
   * followed by cross-book legal terms across all active Master Books.
   */
  async getMasterBookGlossary(query?: {
    masterBookId?: string;
    bookId?: string;
    bookTitle?: string;
  }): Promise<OttMasterBookGlossaryResponse> {
    const db = await this.ensureLoaded();
    const serverTime = new Date().toISOString();
    const activeMasters = db.masterBooks.filter((mb) => !mb.isDeleted);

    const requestedMasterId = query?.masterBookId?.trim().toLowerCase() ?? '';
    const requestedBookId = query?.bookId?.trim().toLowerCase() ?? '';
    const requestedTitle = query?.bookTitle?.trim().toLowerCase() ?? '';

    const resolveMasterBook = (): OttMasterBook | null => {
      if (requestedMasterId) {
        const direct = activeMasters.find(
          (mb) =>
            mb.id.toLowerCase() === requestedMasterId || mb.slug.toLowerCase() === requestedMasterId
        );
        if (direct) return direct;
      }

      const combinedHint = `${requestedBookId} ${requestedTitle}`.trim();
      if (!combinedHint) return activeMasters[0] ?? null;

      // Semantic match between ReaderView book IDs/titles and backend Master Books
      if (combinedHint.includes('ambedkar') || combinedHint.includes('duties') || combinedHint.includes('charter')) {
        const match = activeMasters.find((mb) => mb.id === 'mb-constitutional-duties-charter');
        if (match) return match;
      }
      if (combinedHint.includes('rti') || combinedHint.includes('digital') || combinedHint.includes('information')) {
        const match = activeMasters.find((mb) => mb.id === 'mb-rti-act-2005');
        if (match) return match;
      }
      if (
        combinedHint.includes('consumer') ||
        combinedHint.includes('tort') ||
        combinedHint.includes('civil') ||
        combinedHint.includes('handbook')
      ) {
        const match = activeMasters.find((mb) => mb.id === 'mb-consumer-protection-law');
        if (match) return match;
      }
      if (combinedHint.includes('constitution') || combinedHint.includes('india')) {
        const match = activeMasters.find((mb) => mb.id === 'mb-constitution-india');
        if (match) return match;
      }

      // Fuzzy token overlap fallback against canonicalTitle / slug
      const hintTokens = combinedHint
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      let best: OttMasterBook | null = null;
      let bestScore = 0;
      for (const mb of activeMasters) {
        const hay = `${mb.canonicalTitle} ${mb.slug} ${mb.jurisdiction}`.toLowerCase();
        const score = hintTokens.reduce((acc, tok) => (hay.includes(tok) ? acc + 1 : acc), 0);
        if (score > bestScore) {
          bestScore = score;
          best = mb;
        }
      }
      return best ?? activeMasters[0] ?? null;
    };

    const matched = resolveMasterBook();

    const orderedMasters = matched
      ? [matched, ...activeMasters.filter((mb) => mb.id !== matched.id)]
      : activeMasters;

    const seenTermKeys = new Set<string>();
    const terms: OttGlossaryTerm[] = [];

    for (const mb of orderedMasters) {
      const mbTerms =
        Array.isArray(mb.glossaryTerms) && mb.glossaryTerms.length > 0
          ? mb.glossaryTerms
          : buildSeededGlossaryForMasterBook(mb);
      for (const entry of mbTerms) {
        const key = entry.term.trim().toLowerCase();
        if (!key || seenTermKeys.has(key)) continue;
        seenTermKeys.add(key);
        terms.push({
          ...entry,
          masterBookId: mb.id,
          masterBookTitle: mb.canonicalTitle,
        });
      }
    }

    return {
      matchedMasterBook: matched
        ? {
            id: matched.id,
            slug: matched.slug,
            canonicalTitle: matched.canonicalTitle,
            jurisdiction: matched.jurisdiction,
            enactmentYear: matched.enactmentYear,
            bookType: matched.bookType,
          }
        : null,
      masterBooksCount: activeMasters.length,
      terms,
      serverTime,
    };
  }

  async upsertMasterBookGlossaryTerm(
    masterBookId: string,
    input: {
      term: string;
      aliases?: string[];
      category?: OttGlossaryCategory;
      simpleDefinition: string;
      legalContext?: string;
      citation?: string;
    }
  ): Promise<OttGlossaryTerm> {
    const db = await this.ensureLoaded();
    const masterBook = db.masterBooks.find((mb) => mb.id === masterBookId && !mb.isDeleted);
    if (!masterBook) {
      throw new Error('Master Book not found.');
    }

    const term = input.term.trim();
    const simpleDefinition = input.simpleDefinition.trim();
    if (term.length < 2 || term.length > 100) {
      throw new Error('Glossary term must be between 2 and 100 characters.');
    }
    if (simpleDefinition.length < 8 || simpleDefinition.length > 600) {
      throw new Error('Simple definition must be between 8 and 600 characters.');
    }

    const validCategories: OttGlossaryCategory[] = [
      'Constitutional',
      'Judicial Remedy',
      'Civil & Tort',
      'Statutory & Civic',
      'Criminal & Procedure',
      'Human Rights',
    ];
    const category: OttGlossaryCategory =
      input.category && validCategories.includes(input.category)
        ? input.category
        : 'Constitutional';

    const aliases = Array.isArray(input.aliases)
      ? Array.from(
          new Set(
            input.aliases
              .map((a) => a.trim())
              .filter((a) => a.length >= 2 && a.toLowerCase() !== term.toLowerCase())
          )
        ).slice(0, 8)
      : undefined;

    if (!Array.isArray(masterBook.glossaryTerms)) {
      masterBook.glossaryTerms = buildSeededGlossaryForMasterBook(masterBook);
    }

    const existingIndex = masterBook.glossaryTerms.findIndex(
      (g) => g.term.toLowerCase() === term.toLowerCase()
    );

    const record: OttGlossaryTerm = {
      id:
        existingIndex >= 0
          ? masterBook.glossaryTerms[existingIndex].id
          : `gl-${slugifyTitle(term)}-${crypto.randomBytes(2).toString('hex')}`,
      term,
      aliases: aliases && aliases.length > 0 ? aliases : undefined,
      category,
      simpleDefinition,
      legalContext: input.legalContext?.trim() || undefined,
      citation: input.citation?.trim() || undefined,
      masterBookId: masterBook.id,
      masterBookTitle: masterBook.canonicalTitle,
    };

    if (existingIndex >= 0) {
      masterBook.glossaryTerms[existingIndex] = record;
    } else {
      masterBook.glossaryTerms.push(record);
    }

    masterBook.versionNumber += 1;
    masterBook.updatedAt = new Date().toISOString();
    await this.persist();
    return record;
  }

  /**
   * Projects the authoritative Books & Structures catalog into mobile-ready LawBook[] records
   * with strict 1-to-1 manual audio URLs bound to every book overview, chapter, and clause/unit.
   */
  async buildMobileLibraryBooks(): Promise<LawBook[]> {
    const db = await this.ensureLoaded();
    const activeMasters = db.masterBooks.filter((mb) => !mb.isDeleted);
    const books: LawBook[] = [];

    for (const mb of activeMasters) {
      const editions = db.editions.filter((ed) => ed.masterBookId === mb.id && !ed.isDeleted);
      if (editions.length === 0) continue;

      const primaryEdition =
        editions.find((ed) => ed.languageCode === 'en') ?? editions[0];
      const teEdition = editions.find((ed) => ed.languageCode === 'te');
      const hiEdition = editions.find((ed) => ed.languageCode === 'hi');

      const primaryChapters = db.chapters
        .filter((ch) => ch.editionId === primaryEdition.id && !ch.isDeleted)
        .sort((a, b) => a.chapterOrder - b.chapterOrder);

      const teChapters = teEdition
        ? db.chapters
            .filter((ch) => ch.editionId === teEdition.id && !ch.isDeleted)
            .sort((a, b) => a.chapterOrder - b.chapterOrder)
        : [];
      const hiChapters = hiEdition
        ? db.chapters
            .filter((ch) => ch.editionId === hiEdition.id && !ch.isDeleted)
            .sort((a, b) => a.chapterOrder - b.chapterOrder)
        : [];

      const category: LawBook['category'] =
        mb.bookType === 'biography'
          ? 'history'
          : mb.bookType === 'general_law'
            ? 'statutory'
            : 'constitutions';

      const mappedChapters: LawBook['chapters'] = primaryChapters.map((ch, chIdx) => {
        const teCh = teChapters[chIdx];
        const hiCh = hiChapters[chIdx];

        const primaryUnits = db.units
          .filter((u) => u.chapterId === ch.id && !u.isDeleted)
          .sort((a, b) => a.unitOrder - b.unitOrder);
        const teUnits = teCh
          ? db.units
              .filter((u) => u.chapterId === teCh.id && !u.isDeleted)
              .sort((a, b) => a.unitOrder - b.unitOrder)
          : [];
        const hiUnits = hiCh
          ? db.units
              .filter((u) => u.chapterId === hiCh.id && !u.isDeleted)
              .sort((a, b) => a.unitOrder - b.unitOrder)
          : [];

        return {
          id: ch.id,
          number: ch.chapterNumber,
          title: {
            en: ch.title,
            ...(teCh ? { te: teCh.title } : {}),
            ...(hiCh ? { hi: hiCh.title } : {}),
          },
          summary: {
            en: ch.overviewDefinition || ch.title,
            ...(teCh?.overviewDefinition ? { te: teCh.overviewDefinition } : {}),
            ...(hiCh?.overviewDefinition ? { hi: hiCh.overviewDefinition } : {}),
          },
          ...(ch.overviewAudioUrl ? { overviewAudioUrl: ch.overviewAudioUrl } : {}),
          estimatedMinutes: ch.estimatedMinutes,
          versionNumber: ch.versionNumber,
          updatedAt: ch.updatedAt,
          isDeleted: ch.isDeleted,
          clauses: primaryUnits.map((u, uIdx) => {
            const teU = teUnits[uIdx];
            const hiU = hiUnits[uIdx];
            const attachments: NonNullable<LawBook['chapters'][number]['clauses'][number]['audioAttachments']> = {};
            const pushAttach = (
              role: 'full' | 'definition' | 'purpose' | 'explanation' | 'example',
              url: string | undefined
            ) => {
              if (!url) return;
              attachments[role] = {
                audioMetadataId: `${u.id}-${role}`,
                assetId: url.split('/').pop() ?? `${u.id}-${role}`,
                audioUrl: url,
                fileName: `${u.unitNumber}-${role}.wav`,
                mimeType: 'audio/wav',
                byteSize: 44100,
                durationSec: u.audioDurationSec || 12,
                durationLabel: '00:12',
                language: primaryEdition.languageCode,
                narrator: primaryEdition.narratorName || 'Editorial Studio',
                blockRole: role,
                updatedAt: u.updatedAt,
              };
            };
            pushAttach('full', u.fullUnitAudioUrl);
            pushAttach('definition', u.definitionAudioUrl);
            pushAttach('purpose', u.purposeAudioUrl);
            pushAttach('explanation', u.explanationAudioUrl);
            pushAttach('example', u.examplesAudioUrl);

            return {
              id: u.id,
              number: u.unitNumber,
              principle: {
                en: u.title,
                ...(teU ? { te: teU.title } : {}),
                ...(hiU ? { hi: hiU.title } : {}),
              },
              text: {
                en: u.definition,
                ...(teU?.definition ? { te: teU.definition } : {}),
                ...(hiU?.definition ? { hi: hiU.definition } : {}),
              },
              explanation: {
                en: u.deepExplanation || u.purposeBackground || u.definition,
                ...(teU?.deepExplanation || teU?.purposeBackground
                  ? { te: teU.deepExplanation || teU.purposeBackground }
                  : {}),
                ...(hiU?.deepExplanation || hiU?.purposeBackground
                  ? { hi: hiU.deepExplanation || hiU.purposeBackground }
                  : {}),
              },
              realWorldExample: {
                en: u.practicalExamples || u.purposeBackground || u.definition,
                ...(teU?.practicalExamples || teU?.purposeBackground
                  ? { te: teU.practicalExamples || teU.purposeBackground }
                  : {}),
                ...(hiU?.practicalExamples || hiU?.purposeBackground
                  ? { hi: hiU.practicalExamples || hiU.purposeBackground }
                  : {}),
              },
              ...(Object.keys(attachments).length > 0 ? { audioAttachments: attachments } : {}),
            };
          }),
        };
      });

      books.push({
        id: mb.id,
        masterBookId: mb.id,
        editionId: primaryEdition.id,
        bookType: mb.bookType,
        shortTitle: primaryEdition.title.slice(0, 32),
        title: {
          en: primaryEdition.title,
          ...(teEdition ? { te: teEdition.title } : {}),
          ...(hiEdition ? { hi: hiEdition.title } : {}),
        },
        subtitle: {
          en: primaryEdition.subtitle || primaryEdition.description || mb.canonicalTitle,
          ...(teEdition?.subtitle ? { te: teEdition.subtitle } : {}),
          ...(hiEdition?.subtitle ? { hi: hiEdition.subtitle } : {}),
        },
        jurisdiction: mb.jurisdiction,
        year: mb.enactmentYear,
        category,
        coverImage: mb.coverImageUrl || primaryEdition.coverImageUrl,
        coverTone: mb.coverTone,
        ...(primaryEdition.descriptionAudioUrl
          ? { descriptionAudioUrl: primaryEdition.descriptionAudioUrl }
          : {}),
        versionNumber: mb.versionNumber,
        updatedAt: mb.updatedAt,
        isDeleted: mb.isDeleted,
        chapters: mappedChapters,
      });
    }

    return books;
  }
}

export const ottCatalogStore = new OttCatalogStore();
export const booksStructuresStore = ottCatalogStore;
