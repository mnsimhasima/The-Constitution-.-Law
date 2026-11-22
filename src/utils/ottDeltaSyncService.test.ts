import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OttCatalogStore } from '../server/ottCatalogStore.ts';
import {
  compareLocalWithRemoteManifest,
  createOttDeltaSyncService,
  formatSyncReportSummary,
} from './ottDeltaSyncService.ts';
import {
  createInMemoryOttVaultStore,
  downloadEditionToOfflineVault,
} from './ottOfflineVault.ts';

test('compareLocalWithRemoteManifest accurately detects new, updated, and soft-deleted chapters and sections by version number', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manifest-diff-'));
  const serverStore = new OttCatalogStore({
    dbFilePath: path.join(dir, 'ott-catalog.json'),
    audioDir: path.join(dir, 'audio-uploads'),
  });
  const clientVault = createInMemoryOttVaultStore();

  try {
    const rtiTree = await serverStore.getEditionTree('ed-rti-en');
    assert.ok(rtiTree);
    const localPkg = await downloadEditionToOfflineVault({
      tree: rtiTree,
      vault: clientVault,
      fetchAudioBlob: async (url) => new Blob([`bytes-${url}`], { type: 'audio/wav' }),
    });

    // Immediately identical -> needsSync === false
    const manifest0 = await serverStore.getVersionManifest(['ed-rti-en']);
    const diff0 = compareLocalWithRemoteManifest([localPkg], manifest0.editions);
    assert.equal(diff0.length, 1);
    assert.equal(diff0[0].needsSync, false);
    assert.deepEqual(diff0[0].newChapterIds, []);
    assert.deepEqual(diff0[0].updatedChapterIds, []);
    assert.deepEqual(diff0[0].newUnitIds, []);
    assert.deepEqual(diff0[0].updatedUnitIds, []);

    // Add a new chapter + section, update an existing section
    const newCh = await serverStore.createChapter('ed-rti-en', {
      chapterNumber: 'Chapter III',
      title: 'Appeals & Information Commission',
      overviewDefinition: 'Statutory remedies when public authorities delay or deny disclosure.',
    });
    const newSec = await serverStore.createLegalUnit(newCh.id, {
      unitNumber: 'Section 19',
      title: 'First & Second Appeal Procedure',
      definition: 'Any citizen aggrieved by a decision of a PIO may prefer an appeal within 30 days.',
    });
    const existingUnitId = localPkg.units[0].id;
    await serverStore.updateLegalUnit(existingUnitId, {
      deepExplanation: 'Revised statutory commentary on citizen disclosure rights.',
    });

    const manifest1 = await serverStore.getVersionManifest(['ed-rti-en']);
    const diff1 = compareLocalWithRemoteManifest([localPkg], manifest1.editions);
    assert.equal(diff1[0].needsSync, true);
    assert.ok(diff1[0].remoteEditionVersion > diff1[0].localEditionVersion);
    assert.deepEqual(diff1[0].newChapterIds, [newCh.id]);
    assert.deepEqual(diff1[0].newUnitIds, [newSec.id]);
    assert.deepEqual(diff1[0].updatedUnitIds, [existingUnitId]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('2-phase background sync skips delta API when versions match and downloads only stale editions on reconnect', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-two-phase-'));
  const serverStore = new OttCatalogStore({
    dbFilePath: path.join(dir, 'ott-catalog.json'),
    audioDir: path.join(dir, 'audio-uploads'),
  });
  const clientVault = createInMemoryOttVaultStore();

  try {
    const mockFetchAudioBlob = async (url: string) =>
      new Blob([`audio-bytes-${url}`], { type: 'audio/wav' });

    const coiTree = await serverStore.getEditionTree('ed-coi-en');
    const rtiTree = await serverStore.getEditionTree('ed-rti-en');
    assert.ok(coiTree && rtiTree);

    await downloadEditionToOfflineVault({
      tree: coiTree,
      vault: clientVault,
      fetchAudioBlob: mockFetchAudioBlob,
    });
    await downloadEditionToOfflineVault({
      tree: rtiTree,
      vault: clientVault,
      fetchAudioBlob: mockFetchAudioBlob,
    });

    let manifestCalls = 0;
    let deltaCalls = 0;
    let lastDeltaEditionIds: string[] = [];

    const syncService = createOttDeltaSyncService({
      vault: clientVault,
      initialOnline: false,
      fetchVersionManifest: async (ids) => {
        manifestCalls += 1;
        return serverStore.getVersionManifest(ids);
      },
      postDeltaSync: async (req) => {
        deltaCalls += 1;
        lastDeltaEditionIds = req.downloadedEditions.map((e) => e.editionId);
        return serverStore.computeDeltaSync(req);
      },
      fetchAudioBlob: mockFetchAudioBlob,
    });

    // Reconnect with NO server changes -> Phase 1 manifest runs, Phase 2 delta is skipped completely!
    const cleanReport = await syncService.handleOnline();
    assert.ok(cleanReport);
    assert.equal(manifestCalls, 1);
    assert.equal(deltaCalls, 0);
    assert.equal(cleanReport.hasChanges, false);
    assert.equal(cleanReport.skippedUpToDateEditions, 2);

    // Go offline; CMS updates ONLY RTI Act (adds Chapter 3 + Section 20) while Constitution stays unchanged
    syncService.handleOffline();
    const newCh = await serverStore.createChapter('ed-rti-en', {
      chapterNumber: 'Chapter III',
      title: 'Penalties & Accountability',
      overviewDefinition: 'Daily monetary penalties for unjustified denial of information.',
    });
    const newSec = await serverStore.createLegalUnit(newCh.id, {
      unitNumber: 'Section 20',
      title: 'Penalties for Unreasonable Delay',
      definition: 'The Information Commission may impose a penalty of Rs. 250 per day of delay.',
    });

    // Reconnect -> Phase 1 detects ONLY ed-rti-en is stale; Phase 2 requests ONLY ed-rti-en!
    const reconnectReport = await syncService.handleOnline();
    assert.ok(reconnectReport);
    assert.equal(manifestCalls, 2);
    assert.equal(deltaCalls, 1);
    assert.deepEqual(lastDeltaEditionIds, ['ed-rti-en']);
    assert.equal(reconnectReport.trigger, 'online-return');
    assert.equal(reconnectReport.skippedUpToDateEditions, 1);
    assert.equal(reconnectReport.addedChaptersCount, 1);
    assert.equal(reconnectReport.addedUnitsCount, 1);
    assert.equal(reconnectReport.editionChanges.length, 1);
    assert.equal(reconnectReport.editionChanges[0].addedUnits[0].unitNumber, 'Section 20');
    assert.match(formatSyncReportSummary(reconnectReport), /Synced on reconnect/i);

    const updatedRti = await clientVault.getPackage('ed-rti-en');
    assert.ok(updatedRti);
    assert.ok(updatedRti.chapters.some((c) => c.id === newCh.id));
    assert.ok(updatedRti.units.some((u) => u.id === newSec.id));

    syncService.dispose();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('End-to-end Offline Download + CMS adds Chapter 3, updates Chapter 2, soft-deletes unit + Online Reconnection prunes orphaned audio', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-delta-e2e-'));
  const serverStore = new OttCatalogStore({
    dbFilePath: path.join(dir, 'ott-catalog.json'),
    audioDir: path.join(dir, 'audio-uploads'),
  });
  const clientVault = createInMemoryOttVaultStore();

  try {
    // 1. User downloads Constitution of India (English) while it has Chapters 1 & 2
    const initialTree = await serverStore.getEditionTree('ed-coi-en');
    assert.ok(initialTree);
    assert.equal(initialTree.chapters.length, 2);

    const fetchedUrls: string[] = [];
    const mockFetchAudioBlob = async (url: string) => {
      fetchedUrls.push(url);
      return new Blob([`audio-bytes-for-${url}`], { type: 'audio/wav' });
    };

    const downloadedPkg = await downloadEditionToOfflineVault({
      tree: initialTree,
      vault: clientVault,
      fetchAudioBlob: mockFetchAudioBlob,
    });
    assert.equal(downloadedPkg.chapters.length, 2);
    assert.ok(fetchedUrls.length >= 3);

    // 2. Device goes offline; Admin adds Chapter 3 + Article 44, updates Chapter 2, and soft-deletes one unit
    const unitToDelete = downloadedPkg.units[downloadedPkg.units.length - 1];
    const deletedUnitAudioUrl = unitToDelete.fullUnitAudioUrl!;
    assert.ok(await clientVault.getAudioBlob(deletedUnitAudioUrl));

    let lastReportTrigger: string | null = null;
    const syncService = createOttDeltaSyncService({
      vault: clientVault,
      initialOnline: false,
      fetchVersionManifest: (ids) => serverStore.getVersionManifest(ids),
      postDeltaSync: (req) => serverStore.computeDeltaSync(req),
      fetchAudioBlob: mockFetchAudioBlob,
      onSyncComplete: (report) => {
        lastReportTrigger = report.trigger;
      },
    });

    const ch3 = await serverStore.createChapter('ed-coi-en', {
      chapterNumber: 'Part IV · Chapter 3',
      title: 'Directive Principles & Social Justice',
      overviewDefinition: 'Economic democracy and welfare principles guiding Indian legislation.',
    });
    const art44 = await serverStore.createLegalUnit(ch3.id, {
      unitNumber: 'Article 44',
      title: 'Uniform Civil Code for the Citizens',
      definition:
        'The State shall endeavour to secure for the citizens a uniform civil code throughout the territory of India.',
      purposeBackground: 'Encourages national integration and gender justice across personal laws.',
      deepExplanation: 'Part of Directive Principles intended to harmonize civil rights progressively.',
      practicalExamples: 'Discussed extensively in constitutional debates on family law reform.',
    });
    await serverStore.updateChapter('ch-coi-en-2', {
      overviewDefinition: 'Updated Chapter 2 overview after CMS revision.',
    });
    await serverStore.softDeleteLegalUnit(unitToDelete.id);

    // While offline, syncNow returns null
    assert.equal(await syncService.syncNow('manual'), null);

    // 3. Device reconnects to the internet -> automatic 2-phase Delta-Sync runs
    const report = await syncService.handleOnline();
    assert.ok(report);
    assert.equal(lastReportTrigger, 'online-return');
    assert.equal(report.hasChanges, true);
    assert.equal(report.addedChaptersCount, 1);
    assert.equal(report.updatedChaptersCount, 1);
    assert.equal(report.addedUnitsCount, 1);
    assert.equal(report.deletedUnitsCount, 1);
    assert.ok(report.prefetchedAudioCount >= 2);
    assert.ok(report.prunedAudioCount >= 1);

    // 4. Verify local offline vault contains Chapter 3, Article 44, updated Chapter 2, and pruned deleted audio!
    const refreshedPkg = await clientVault.getPackage('ed-coi-en');
    assert.ok(refreshedPkg);
    assert.equal(refreshedPkg.chapters.length, 3);
    assert.ok(refreshedPkg.chapters.some((c) => c.id === ch3.id));
    assert.ok(
      refreshedPkg.chapters
        .find((c) => c.id === 'ch-coi-en-2')
        ?.overviewDefinition.includes('CMS revision')
    );
    assert.ok(refreshedPkg.units.some((u) => u.id === art44.id));
    assert.ok(!refreshedPkg.units.some((u) => u.id === unitToDelete.id));
    assert.equal(await clientVault.getAudioBlob(deletedUnitAudioUrl), null);

    const ch3Audio = await clientVault.getAudioBlob(ch3.overviewAudioUrl!);
    const art44Audio = await clientVault.getAudioBlob(art44.fullUnitAudioUrl!);
    assert.ok(ch3Audio && ch3Audio.byteSize > 0);
    assert.ok(art44Audio && art44Audio.byteSize > 0);

    // 5. Subsequent Delta-Sync immediately reports zero changes (upToDate)
    const secondReport = await syncService.syncNow('manual');
    assert.ok(secondReport);
    assert.equal(secondReport.hasChanges, false);
    assert.equal(secondReport.addedChaptersCount, 0);

    syncService.dispose();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Background sync retries with backoff on transient reconnect failure, respects visibility throttle, and aborts cleanly on offline drop', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-sync-resilience-'));
  const serverStore = new OttCatalogStore({
    dbFilePath: path.join(dir, 'ott-catalog.json'),
    audioDir: path.join(dir, 'audio-uploads'),
  });
  const clientVault = createInMemoryOttVaultStore();

  try {
    const rtiTree = await serverStore.getEditionTree('ed-rti-en');
    assert.ok(rtiTree);
    await downloadEditionToOfflineVault({
      tree: rtiTree,
      vault: clientVault,
      fetchAudioBlob: async (url) => new Blob([`bytes-${url}`], { type: 'audio/wav' }),
    });

    let clockMs = 1_000_000;
    let attempts = 0;
    let completedCount = 0;
    const statuses: string[] = [];

    const syncService = createOttDeltaSyncService({
      vault: clientVault,
      initialOnline: false,
      minSyncIntervalMs: 30_000,
      maxRetries: 2,
      retryBaseDelayMs: 25,
      now: () => clockMs,
      onStatusChange: (s) => statuses.push(s),
      onSyncComplete: () => {
        completedCount += 1;
      },
      fetchVersionManifest: async (ids) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Transient network flap after reconnect');
        }
        return serverStore.getVersionManifest(ids);
      },
      postDeltaSync: (req) => serverStore.computeDeltaSync(req),
    });

    // First attempt fails transiently, automatic backoff retry succeeds
    const firstResult = await syncService.handleOnline();
    assert.equal(firstResult, null);
    assert.equal(attempts, 1);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(attempts, 2);
    assert.equal(completedCount, 1);
    assert.equal(syncService.getStatus(), 'synced');

    // Visibility resume inside cooldown window does NOT re-query server
    clockMs += 5_000;
    assert.equal(await syncService.handleVisibilityVisible(), null);
    assert.equal(attempts, 2);

    // Visibility resume AFTER cooldown triggers background check cleanly
    clockMs += 35_000;
    const visReport = await syncService.handleVisibilityVisible();
    assert.ok(visReport);
    assert.equal(visReport.trigger, 'visibility');
    assert.equal(attempts, 3);

    // Going offline mid-flight aborts and sets status to offline
    let abortObserved = false;
    let notifyManifestStarted: (() => void) | null = null;
    const manifestStarted = new Promise<void>((resolve) => {
      notifyManifestStarted = resolve;
    });
    const slowService = createOttDeltaSyncService({
      vault: clientVault,
      initialOnline: true,
      fetchVersionManifest: async (_ids, signal) =>
        new Promise((_resolve, reject) => {
          notifyManifestStarted?.();
          signal?.addEventListener('abort', () => {
            abortObserved = true;
            reject(new Error('Aborted'));
          });
        }),
    });

    const pending = slowService.syncNow('manual');
    await manifestStarted;
    slowService.handleOffline();
    const abortedResult = await pending;
    assert.equal(abortedResult, null);
    assert.equal(abortObserved, true);
    assert.equal(slowService.getStatus(), 'offline');

    slowService.dispose();
    syncService.dispose();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

