import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  COMMUNITY_OFF_TOPIC_ERROR,
  COMMUNITY_PROFANITY_ERROR,
  validateCommunityPostTextLocally,
} from './src/utils/communityModeration.ts';
import { parseBulkBooksCsv, parseBulkBooksJson } from './src/utils/bulkImportParser.ts';
import { INITIAL_LAW_BOOKS } from './src/data/booksData.ts';
import { computeCatalogVersion } from './src/utils/bookIndexSync.ts';
import { booksStructuresStore } from './src/server/ottCatalogStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

const PORT = Number(readCliArg('--port') ?? process.env.PORT ?? 3000);
const HOST = readCliArg('--host') ?? '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  // Security headers compatible with iframe preview
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'constitution-law-backend' });
  });

  // Community Text-Only AI + Profanity Moderation Endpoint
  app.post('/api/community/moderate', async (req, res) => {
    const rawContent = typeof req.body?.content === 'string' ? req.body.content : '';
    const content = rawContent.trim();

    // Step 1: Fast deterministic text-only & profanity check
    const localCheck = validateCommunityPostTextLocally(content);
    if (!localCheck.valid) {
      res.status(200).json({
        allowed: false,
        containsProfanity: localCheck.containsProfanity,
        isRelatedToCommunity: false,
        errorMessage: localCheck.errorMessage,
        reason: localCheck.containsProfanity ? 'Blocked by profanity filter' : 'Text-only rule check',
      });
      return;
    }

    // Step 2: Gemini semantic relevance & multilingual profanity verification
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        allowed: false,
        containsProfanity: false,
        isRelatedToCommunity: false,
        errorMessage:
          'AI community moderation service is not configured on the server. Please configure GEMINI_API_KEY.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const callModerationModel = async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Evaluate this community post submitted to "The Constitution & Law" civic education app:\n\n"""${content}"""`,
          config: {
            systemInstruction:
              'You are a strict content moderator for "The Constitution & Law" civic and legal learning community. ' +
              'Determine two things: ' +
              '(1) containsProfanity: true if the text has any profanity, slurs, insults, hate speech, sexual content, or bad words in any language (including English, Telugu, Hindi, or transliterated slang). ' +
              '(2) isRelatedToCommunity: true ONLY if the post meaningfully relates to constitutions, laws, legal rights, civic duties, courts, justice, governance, democracy, public policy, Dr. B. R. Ambedkar, human rights, or studying constitutional/legal books. ' +
              'Posts about unrelated topics (such as movies, cricket/sports, recipes, video games, shopping, crypto, dating, random greetings without legal context, or spam) MUST return isRelatedToCommunity: false.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                containsProfanity: { type: Type.BOOLEAN },
                isRelatedToCommunity: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['containsProfanity', 'isRelatedToCommunity', 'reason'],
            },
          },
        });
        const rawJson = (response.text ?? '')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
        if (!rawJson) throw new Error('Empty moderation response from model');
        return JSON.parse(rawJson) as {
          containsProfanity?: boolean;
          isRelatedToCommunity?: boolean;
          reason?: string;
        };
      };

      let verdict: {
        containsProfanity?: boolean;
        isRelatedToCommunity?: boolean;
        reason?: string;
      };
      try {
        verdict = await callModerationModel();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 800));
        verdict = await callModerationModel();
      }

      const containsProfanity = Boolean(verdict.containsProfanity);
      const isRelatedToCommunity = Boolean(verdict.isRelatedToCommunity);
      const reason = typeof verdict.reason === 'string' ? verdict.reason : '';

      if (containsProfanity) {
        res.status(200).json({
          allowed: false,
          containsProfanity: true,
          isRelatedToCommunity,
          errorMessage: COMMUNITY_PROFANITY_ERROR,
          reason,
        });
        return;
      }

      if (!isRelatedToCommunity) {
        res.status(200).json({
          allowed: false,
          containsProfanity: false,
          isRelatedToCommunity: false,
          errorMessage: COMMUNITY_OFF_TOPIC_ERROR,
          reason,
        });
        return;
      }

      res.status(200).json({
        allowed: true,
        containsProfanity: false,
        isRelatedToCommunity: true,
        reason,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Community moderation API error:', msg);
      const isAuthErr = msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403');
      res.status(503).json({
        allowed: false,
        containsProfanity: false,
        isRelatedToCommunity: false,
        errorMessage: isAuthErr
          ? 'Gemini API key needs attention in Settings > Secrets before AI community moderation can run.'
          : 'Unable to verify post relevance right now. Please try again in a moment.',
      });
    }
  });

  // Server-side bulk JSON / CSV validation helper for Admin & Editor Dashboard
  app.post('/api/admin/validate-bulk', (req, res) => {
    const format = req.body?.format === 'csv' ? 'csv' : 'json';
    const payload = typeof req.body?.payload === 'string' ? req.body.payload : '';
    const actor = {
      uid: typeof req.body?.actorUid === 'string' && req.body.actorUid ? req.body.actorUid : 'staff-import',
      email: typeof req.body?.actorEmail === 'string' && req.body.actorEmail ? req.body.actorEmail : 'editor@constitutionlaw.org',
      defaultStatus:
        req.body?.defaultStatus === 'published' || req.body?.defaultStatus === 'draft'
          ? req.body.defaultStatus
          : 'pending_review',
    } as const;

    if (!payload.trim()) {
      res.status(400).json({
        books: [],
        errors: ['Empty import payload.'],
        warnings: [],
        rowCount: 0,
      });
      return;
    }

    const result =
      format === 'csv'
        ? parseBulkBooksCsv(payload, actor)
        : parseBulkBooksJson(payload, actor);

    res.status(200).json(result);
  });

  // =========================================================================
  // UNIFIED "BOOKS & STRUCTURES" PLATFORM APIs (Single Source of Truth)
  // Serves Master Books, Multi-Language Editions, Constitutional Articles,
  // General Law Sections, Biography/General Topics, 1-to-1 Manual Audio
  // Uploads/Streaming, Glossary Metadata, Mobile Library Projection,
  // and Automatic Incremental Offline Delta-Sync.
  // =========================================================================

  const parseBookType = (raw: unknown): 'constitutional' | 'general_law' | 'biography' => {
    if (raw === 'general_law') return 'general_law';
    if (raw === 'biography') return 'biography';
    return 'constitutional';
  };

  // Authoritative unified mobile library projection built from Books & Structures
  app.get('/api/books-structures/mobile-library', async (req, res) => {
    try {
      const unifiedBooks = await booksStructuresStore.buildMobileLibraryBooks();
      // Merge with reference baseline books that have distinct IDs so existing reading plans keep working
      const seenIds = new Set(unifiedBooks.map((b) => b.id));
      const mergedBooks = [
        ...unifiedBooks,
        ...INITIAL_LAW_BOOKS.filter((b) => !seenIds.has(b.id)),
      ];
      const version = computeCatalogVersion(mergedBooks);
      const hash = crypto.createHash('sha256').update(version).digest('hex').slice(0, 16);
      const etag = `W/"${hash}"`;

      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', etag);

      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      res.status(200).json({
        version,
        updatedAt: new Date().toISOString(),
        totalBooks: mergedBooks.length,
        books: mergedBooks,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load unified mobile library.',
      });
    }
  });

  // Serve authoritative PostgreSQL relational schema blueprint for Books & Structures
  app.get('/api/books-structures/schema', async (_req, res) => {
    try {
      const schemaSql = await fs.readFile(path.resolve(__dirname, 'database', 'schema.sql'), 'utf-8');
      res.status(200).type('text/plain; charset=utf-8').send(schemaSql);
    } catch {
      res.status(404).json({ error: 'Relational SQL schema file not found.' });
    }
  });

  // List all Master Books with manually authored Language Editions
  app.get('/api/books-structures/master-books', async (_req, res) => {
    try {
      const masterBooks = await booksStructuresStore.listMasterBooks();
      res.status(200).json({ masterBooks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load master books.' });
    }
  });

  // Resolve legal glossary terms powered by unified Books & Structures Master Book metadata
  app.get('/api/books-structures/glossary', async (req, res) => {
    try {
      const masterBookId =
        typeof req.query.masterBookId === 'string' ? req.query.masterBookId : undefined;
      const bookId = typeof req.query.bookId === 'string' ? req.query.bookId : undefined;
      const bookTitle = typeof req.query.bookTitle === 'string' ? req.query.bookTitle : undefined;
      const payload = await booksStructuresStore.getMasterBookGlossary({
        masterBookId,
        bookId,
        bookTitle,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load master book glossary metadata.',
      });
    }
  });

  // Add or update a legal glossary term on a Master Book
  app.post('/api/books-structures/master-books/:masterBookId/glossary', async (req, res) => {
    try {
      const entry = await booksStructuresStore.upsertMasterBookGlossaryTerm(req.params.masterBookId, {
        term: String(req.body?.term ?? ''),
        aliases: Array.isArray(req.body?.aliases) ? req.body.aliases.map(String) : undefined,
        category: req.body?.category,
        simpleDefinition: String(req.body?.simpleDefinition ?? ''),
        legalContext:
          typeof req.body?.legalContext === 'string' ? req.body.legalContext : undefined,
        citation: typeof req.body?.citation === 'string' ? req.body.citation : undefined,
      });
      res.status(201).json({ entry });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to save glossary term.',
      });
    }
  });

  // Create a new Master Book (Constitutional, General Law, or Biography / General)
  app.post('/api/books-structures/master-books', async (req, res) => {
    try {
      const masterBook = await booksStructuresStore.createMasterBook({
        canonicalTitle: String(req.body?.canonicalTitle ?? ''),
        bookType: parseBookType(req.body?.bookType),
        jurisdiction: typeof req.body?.jurisdiction === 'string' ? req.body.jurisdiction : undefined,
        enactmentYear: typeof req.body?.enactmentYear === 'string' ? req.body.enactmentYear : undefined,
        coverTone: typeof req.body?.coverTone === 'string' ? req.body.coverTone : undefined,
        coverImageUrl: typeof req.body?.coverImageUrl === 'string' ? req.body.coverImageUrl : undefined,
      });
      res.status(201).json({ masterBook });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid master book input.' });
    }
  });

  // Soft-delete a Master Book and cascade sync tombstones to its editions/chapters/units
  app.delete('/api/books-structures/master-books/:masterBookId', async (req, res) => {
    try {
      const result = await booksStructuresStore.softDeleteMasterBook(req.params.masterBookId);
      res.status(200).json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Master Book not found.' });
    }
  });

  // Create a Master Book + One or Multiple Language Editions + Initial Chapter + Initial Articles/Sections/Topics atomically
  app.post('/api/books-structures/master-books/bundle', async (req, res) => {
    try {
      const result = await booksStructuresStore.createMasterBookBundle({
        canonicalTitle: String(req.body?.canonicalTitle ?? ''),
        bookType: parseBookType(req.body?.bookType),
        jurisdiction: typeof req.body?.jurisdiction === 'string' ? req.body.jurisdiction : undefined,
        enactmentYear:
          typeof req.body?.enactmentYear === 'string' ? req.body.enactmentYear : undefined,
        coverTone: typeof req.body?.coverTone === 'string' ? req.body.coverTone : undefined,
        edition: req.body?.edition,
        editions: Array.isArray(req.body?.editions) ? req.body.editions : undefined,
        chapter: req.body?.chapter,
        units: Array.isArray(req.body?.units) ? req.body.units : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Could not create book bundle.' });
    }
  });

  // Get full hierarchical tree for a specific Language Edition (Master Book + Siblings + Chapters + Units)
  app.get('/api/books-structures/editions/:editionId', async (req, res) => {
    try {
      const tree = await booksStructuresStore.getEditionTree(req.params.editionId);
      if (!tree) {
        res.status(404).json({ error: 'Language edition not found.' });
        return;
      }
      res.status(200).json(tree);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load edition.' });
    }
  });

  // Create a manually authored Language Edition under a Master Book
  app.post('/api/books-structures/master-books/:masterBookId/editions', async (req, res) => {
    try {
      const edition = await booksStructuresStore.createEdition(req.params.masterBookId, {
        languageCode: String(req.body?.languageCode ?? ''),
        languageName: String(req.body?.languageName ?? ''),
        nativeLanguageName: String(req.body?.nativeLanguageName ?? ''),
        title: String(req.body?.title ?? ''),
        subtitle: typeof req.body?.subtitle === 'string' ? req.body.subtitle : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        narratorName: typeof req.body?.narratorName === 'string' ? req.body.narratorName : undefined,
        status: req.body?.status,
        descriptionAudioUrl:
          typeof req.body?.descriptionAudioUrl === 'string' ? req.body.descriptionAudioUrl : undefined,
      });
      res.status(201).json({ edition });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create edition.' });
    }
  });

  // Update Edition metadata / description audio (increments version_number)
  app.patch('/api/books-structures/editions/:editionId', async (req, res) => {
    try {
      const edition = await booksStructuresStore.updateEdition(req.params.editionId, {
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        subtitle: typeof req.body?.subtitle === 'string' ? req.body.subtitle : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        descriptionAudioUrl:
          typeof req.body?.descriptionAudioUrl === 'string' ? req.body.descriptionAudioUrl : undefined,
        narratorName: typeof req.body?.narratorName === 'string' ? req.body.narratorName : undefined,
        status: req.body?.status,
      });
      res.status(200).json({ edition });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update edition.' });
    }
  });

  // Add a Chapter to a Language Edition (bumps edition version_number for Delta-Sync)
  app.post('/api/books-structures/editions/:editionId/chapters', async (req, res) => {
    try {
      const chapter = await booksStructuresStore.createChapter(req.params.editionId, {
        chapterNumber: String(req.body?.chapterNumber ?? ''),
        title: String(req.body?.title ?? ''),
        overviewDefinition:
          typeof req.body?.overviewDefinition === 'string' ? req.body.overviewDefinition : undefined,
        overviewAudioUrl:
          typeof req.body?.overviewAudioUrl === 'string' ? req.body.overviewAudioUrl : undefined,
        estimatedMinutes:
          typeof req.body?.estimatedMinutes === 'number' ? req.body.estimatedMinutes : undefined,
      });
      res.status(201).json({ chapter });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create chapter.' });
    }
  });

  // Update a Chapter (bumps chapter & edition version_number)
  app.patch('/api/books-structures/chapters/:chapterId', async (req, res) => {
    try {
      const chapter = await booksStructuresStore.updateChapter(req.params.chapterId, {
        chapterNumber: typeof req.body?.chapterNumber === 'string' ? req.body.chapterNumber : undefined,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        overviewDefinition:
          typeof req.body?.overviewDefinition === 'string' ? req.body.overviewDefinition : undefined,
        overviewAudioUrl:
          typeof req.body?.overviewAudioUrl === 'string' ? req.body.overviewAudioUrl : undefined,
        estimatedMinutes:
          typeof req.body?.estimatedMinutes === 'number' ? req.body.estimatedMinutes : undefined,
      });
      res.status(200).json({ chapter });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update chapter.' });
    }
  });

  // Soft-delete a Chapter (bumps version_number so offline devices remove it on Delta-Sync)
  app.delete('/api/books-structures/chapters/:chapterId', async (req, res) => {
    try {
      const result = await booksStructuresStore.softDeleteChapter(req.params.chapterId);
      res.status(200).json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Chapter not found.' });
    }
  });

  // Add an Article (Constitutional), Section (General Law), or Topic (Biography/General) under a Chapter
  app.post('/api/books-structures/chapters/:chapterId/units', async (req, res) => {
    try {
      const unit = await booksStructuresStore.createLegalUnit(req.params.chapterId, {
        unitNumber: String(req.body?.unitNumber ?? ''),
        title: String(req.body?.title ?? ''),
        definition: String(req.body?.definition ?? ''),
        purposeBackground:
          typeof req.body?.purposeBackground === 'string' ? req.body.purposeBackground : undefined,
        deepExplanation:
          typeof req.body?.deepExplanation === 'string' ? req.body.deepExplanation : undefined,
        practicalExamples:
          typeof req.body?.practicalExamples === 'string' ? req.body.practicalExamples : undefined,
        definitionAudioUrl:
          typeof req.body?.definitionAudioUrl === 'string' ? req.body.definitionAudioUrl : undefined,
        purposeAudioUrl:
          typeof req.body?.purposeAudioUrl === 'string' ? req.body.purposeAudioUrl : undefined,
        explanationAudioUrl:
          typeof req.body?.explanationAudioUrl === 'string' ? req.body.explanationAudioUrl : undefined,
        examplesAudioUrl:
          typeof req.body?.examplesAudioUrl === 'string' ? req.body.examplesAudioUrl : undefined,
        fullUnitAudioUrl:
          typeof req.body?.fullUnitAudioUrl === 'string' ? req.body.fullUnitAudioUrl : undefined,
        audioDurationSec:
          typeof req.body?.audioDurationSec === 'number' ? req.body.audioDurationSec : undefined,
      });
      res.status(201).json({ unit });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create content unit.' });
    }
  });

  // Update an Article, Section, or Topic
  app.patch('/api/books-structures/units/:unitId', async (req, res) => {
    try {
      const unit = await booksStructuresStore.updateLegalUnit(req.params.unitId, {
        unitNumber: typeof req.body?.unitNumber === 'string' ? req.body.unitNumber : undefined,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        definition: typeof req.body?.definition === 'string' ? req.body.definition : undefined,
        purposeBackground:
          typeof req.body?.purposeBackground === 'string' ? req.body.purposeBackground : undefined,
        deepExplanation:
          typeof req.body?.deepExplanation === 'string' ? req.body.deepExplanation : undefined,
        practicalExamples:
          typeof req.body?.practicalExamples === 'string' ? req.body.practicalExamples : undefined,
        definitionAudioUrl:
          typeof req.body?.definitionAudioUrl === 'string' ? req.body.definitionAudioUrl : undefined,
        purposeAudioUrl:
          typeof req.body?.purposeAudioUrl === 'string' ? req.body.purposeAudioUrl : undefined,
        explanationAudioUrl:
          typeof req.body?.explanationAudioUrl === 'string' ? req.body.explanationAudioUrl : undefined,
        examplesAudioUrl:
          typeof req.body?.examplesAudioUrl === 'string' ? req.body.examplesAudioUrl : undefined,
        fullUnitAudioUrl:
          typeof req.body?.fullUnitAudioUrl === 'string' ? req.body.fullUnitAudioUrl : undefined,
        audioDurationSec:
          typeof req.body?.audioDurationSec === 'number' ? req.body.audioDurationSec : undefined,
      });
      res.status(200).json({ unit });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update content unit.' });
    }
  });

  // Soft-delete an Article, Section, or Topic
  app.delete('/api/books-structures/units/:unitId', async (req, res) => {
    try {
      const result = await booksStructuresStore.softDeleteLegalUnit(req.params.unitId);
      res.status(200).json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Content unit not found.' });
    }
  });

  // Upload & bind a manual audio file 1-to-1 to a Book Overview, Chapter, or Article/Section/Topic block
  app.post('/api/books-structures/audio/upload', express.json({ limit: '15mb' }), async (req, res) => {
    try {
      const asset = await booksStructuresStore.saveUploadedAudio({
        entityType: req.body?.entityType,
        entityId: String(req.body?.entityId ?? ''),
        blockRole: req.body?.blockRole,
        originalFilename: String(req.body?.originalFilename ?? 'recording.wav'),
        mimeType: String(req.body?.mimeType ?? ''),
        base64Data: String(req.body?.base64Data ?? ''),
        durationSec: typeof req.body?.durationSec === 'number' ? req.body.durationSec : undefined,
        uploadedByUid: typeof req.body?.uploadedByUid === 'string' ? req.body.uploadedByUid : undefined,
      });
      res.status(201).json({ asset, audioUrl: asset.storageUrl });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Audio upload failed.' });
    }
  });

  // Stream uploaded or seeded manual block audio securely (internal app playback & offline prefetch)
  app.get('/api/books-structures/audio/:assetId', async (req, res) => {
    try {
      const file = await booksStructuresStore.readAudioAssetFile(req.params.assetId);
      if (!file) {
        res.status(404).json({ error: 'Audio asset not found.' });
        return;
      }
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', String(file.buffer.length));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.status(200).send(file.buffer);
    } catch {
      res.status(500).json({ error: 'Unable to stream audio asset.' });
    }
  });

  // Mobile App Lightweight Version Manifest Endpoint (for local vs backend version comparison)
  app.get('/api/books-structures/sync/manifest', async (req, res) => {
    try {
      const rawParam = typeof req.query.editionIds === 'string' ? req.query.editionIds : '';
      const editionIds = rawParam
        ? rawParam
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, 50)
        : undefined;
      const manifest = await booksStructuresStore.getVersionManifest(editionIds);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(manifest);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to load sync version manifest.',
      });
    }
  });

  // Mobile App Incremental Delta-Sync Endpoint
  app.post('/api/books-structures/sync/delta', async (req, res) => {
    try {
      const payload = await booksStructuresStore.computeDeltaSync({
        downloadedEditions: Array.isArray(req.body?.downloadedEditions)
          ? req.body.downloadedEditions
          : [],
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(payload);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delta-Sync failed.' });
    }
  });

  // Frontend Vite middleware in dev OR built static assets in prod
  if (!isProduction) {
    // Serve a zero-WebSocket /@vite/client shim when HMR is disabled so the browser
    // never attempts an unreachable HMR WebSocket connection in the Cloud Run iframe.
    app.get('/@vite/client', (_req, res) => {
      res.status(200).type('application/javascript').send(`
export class ErrorOverlay extends HTMLElement {}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function updateStyle(id, content) {
  let style = document.querySelector('style[data-vite-dev-id="' + CSS.escape(id) + '"]');
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = document.querySelector('style[data-vite-dev-id="' + CSS.escape(id) + '"]');
  if (style) style.remove();
}
export function injectQuery(url) {
  return url;
}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', async (_req, res) => {
      try {
        const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch {
        res.status(404).send('App build not found.');
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`The Constitution & Law full-stack server running at http://${HOST}:${PORT}`);
  });
}

void startServer();
