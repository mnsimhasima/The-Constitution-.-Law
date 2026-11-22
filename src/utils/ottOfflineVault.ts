import type {
  OttBookEdition,
  OttChapter,
  OttDeltaSyncEditionResult,
  OttDownloadedEditionManifest,
  OttEditionDetailTree,
  OttLegalUnit,
  OttMasterBook,
} from '../types/ott';

const DB_NAME = 'constitution_law_ott_offline_vault_v1';
const DB_VERSION = 1;
const STORE_PACKAGES = 'offline_editions';
const STORE_AUDIO_BLOBS = 'internal_audio_blobs';

export interface OfflineEditionPackage {
  editionId: string;
  masterBook: OttMasterBook;
  edition: OttBookEdition;
  chapters: OttChapter[];
  units: OttLegalUnit[];
  manifest: OttDownloadedEditionManifest;
}

export interface StoredInternalAudioRecord {
  audioUrl: string;
  editionId: string;
  mimeType: string;
  byteSize: number;
  blob: Blob;
  savedAt: string;
}

export interface OttOfflineVaultStore {
  listPackages(): Promise<OfflineEditionPackage[]>;
  getPackage(editionId: string): Promise<OfflineEditionPackage | null>;
  savePackage(pkg: OfflineEditionPackage): Promise<void>;
  deletePackage(editionId: string): Promise<void>;
  putAudioBlob(record: StoredInternalAudioRecord): Promise<void>;
  getAudioBlob(audioUrl: string): Promise<StoredInternalAudioRecord | null>;
  deleteAudioBlob(audioUrl: string): Promise<void>;
  deleteAudioByEdition(editionId: string): Promise<void>;
}

/**
 * In-app internal IndexedDB offline storage manager (YouTube-style private vault).
 * Downloaded text structures, sync manifests, and audio Blobs live exclusively inside
 * the app's sandboxed IndexedDB database — never written as raw files in public downloads.
 */
function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        db.createObjectStore(STORE_PACKAGES, { keyPath: 'editionId' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO_BLOBS)) {
        const audioStore = db.createObjectStore(STORE_AUDIO_BLOBS, { keyPath: 'audioUrl' });
        audioStore.createIndex('by_edition', 'editionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open OTT offline vault.'));
  });
}

function createIndexedDbVaultStore(): OttOfflineVaultStore {
  return {
    async listPackages() {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PACKAGES, 'readonly');
        const req = tx.objectStore(STORE_PACKAGES).getAll();
        req.onsuccess = () => resolve((req.result as OfflineEditionPackage[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    },
    async getPackage(editionId) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PACKAGES, 'readonly');
        const req = tx.objectStore(STORE_PACKAGES).get(editionId);
        req.onsuccess = () => resolve((req.result as OfflineEditionPackage) ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    async savePackage(pkg) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PACKAGES, 'readwrite');
        tx.objectStore(STORE_PACKAGES).put(pkg);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async deletePackage(editionId) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PACKAGES, 'readwrite');
        tx.objectStore(STORE_PACKAGES).delete(editionId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async putAudioBlob(record) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
        tx.objectStore(STORE_AUDIO_BLOBS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async getAudioBlob(audioUrl) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readonly');
        const req = tx.objectStore(STORE_AUDIO_BLOBS).get(audioUrl);
        req.onsuccess = () => resolve((req.result as StoredInternalAudioRecord) ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    async deleteAudioBlob(audioUrl) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
        tx.objectStore(STORE_AUDIO_BLOBS).delete(audioUrl);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async deleteAudioByEdition(editionId) {
      const db = await openVaultDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
        const store = tx.objectStore(STORE_AUDIO_BLOBS);
        const index = store.index('by_edition');
        const cursorReq = index.openCursor(IDBKeyRange.only(editionId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

export function createInMemoryOttVaultStore(): OttOfflineVaultStore {
  const packages = new Map<string, OfflineEditionPackage>();
  const blobs = new Map<string, StoredInternalAudioRecord>();
  return {
    async listPackages() {
      return Array.from(packages.values());
    },
    async getPackage(editionId) {
      return packages.get(editionId) ?? null;
    },
    async savePackage(pkg) {
      packages.set(pkg.editionId, pkg);
    },
    async deletePackage(editionId) {
      packages.delete(editionId);
    },
    async putAudioBlob(record) {
      blobs.set(record.audioUrl, record);
    },
    async getAudioBlob(audioUrl) {
      return blobs.get(audioUrl) ?? null;
    },
    async deleteAudioBlob(audioUrl) {
      blobs.delete(audioUrl);
    },
    async deleteAudioByEdition(editionId) {
      for (const [key, value] of blobs.entries()) {
        if (value.editionId === editionId) blobs.delete(key);
      }
    },
  };
}

let singletonVaultStore: OttOfflineVaultStore | null = null;

export function getOttOfflineVaultStore(): OttOfflineVaultStore {
  if (!singletonVaultStore) {
    singletonVaultStore =
      typeof indexedDB !== 'undefined' ? createIndexedDbVaultStore() : createInMemoryOttVaultStore();
  }
  return singletonVaultStore;
}

export function collectEditionAudioUrls(
  edition: OttBookEdition,
  chapters: OttChapter[],
  units: OttLegalUnit[]
): string[] {
  const urls = new Set<string>();
  if (edition.descriptionAudioUrl) urls.add(edition.descriptionAudioUrl);
  for (const ch of chapters) {
    if (ch.overviewAudioUrl) urls.add(ch.overviewAudioUrl);
  }
  for (const u of units) {
    if (u.definitionAudioUrl) urls.add(u.definitionAudioUrl);
    if (u.purposeAudioUrl) urls.add(u.purposeAudioUrl);
    if (u.explanationAudioUrl) urls.add(u.explanationAudioUrl);
    if (u.examplesAudioUrl) urls.add(u.examplesAudioUrl);
    if (u.fullUnitAudioUrl) urls.add(u.fullUnitAudioUrl);
  }
  return Array.from(urls);
}

export async function downloadEditionToOfflineVault(params: {
  tree: OttEditionDetailTree;
  chapterIds?: string[];
  vault?: OttOfflineVaultStore;
  fetchAudioBlob?: (audioUrl: string) => Promise<Blob>;
  onProgress?: (completed: number, total: number) => void;
}): Promise<OfflineEditionPackage> {
  const vault = params.vault ?? getOttOfflineVaultStore();
  const fetchBlob =
    params.fetchAudioBlob ??
    (async (url: string) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Audio fetch failed (${resp.status})`);
      return resp.blob();
    });

  const existing = await vault.getPackage(params.tree.edition.id);
  const selectedChapters =
    params.chapterIds && params.chapterIds.length > 0
      ? params.tree.chapters.filter((ch) => params.chapterIds!.includes(ch.id))
      : params.tree.chapters;

  // Merge with any previously downloaded chapters of this edition
  const chapterMap = new Map<string, OttChapter>();
  const unitMap = new Map<string, OttLegalUnit>();

  if (existing) {
    for (const ch of existing.chapters) chapterMap.set(ch.id, ch);
    for (const u of existing.units) unitMap.set(u.id, u);
  }

  for (const ch of selectedChapters) {
    const { units, ...chapterRecord } = ch;
    chapterMap.set(ch.id, chapterRecord);
    for (const u of units) {
      unitMap.set(u.id, u);
    }
  }

  const mergedChapters = Array.from(chapterMap.values()).sort(
    (a, b) => a.chapterOrder - b.chapterOrder
  );
  const mergedUnits = Array.from(unitMap.values()).sort((a, b) => a.unitOrder - b.unitOrder);

  const audioUrls = collectEditionAudioUrls(params.tree.edition, mergedChapters, mergedUnits);
  let totalBytes = existing?.manifest.totalAudioBytes ?? 0;
  let completed = 0;
  params.onProgress?.(0, audioUrls.length);

  for (const url of audioUrls) {
    const alreadyCached = await vault.getAudioBlob(url);
    if (!alreadyCached) {
      try {
        const blob = await fetchBlob(url);
        await vault.putAudioBlob({
          audioUrl: url,
          editionId: params.tree.edition.id,
          mimeType: blob.type || 'audio/wav',
          byteSize: blob.size,
          blob,
          savedAt: new Date().toISOString(),
        });
        totalBytes += blob.size;
      } catch {
        // Keep partial audio resilient if one clip fails transiently
      }
    }
    completed += 1;
    params.onProgress?.(completed, audioUrls.length);
  }

  const chapterVersions: Record<string, number> = {};
  for (const ch of mergedChapters) chapterVersions[ch.id] = ch.versionNumber;
  const unitVersions: Record<string, number> = {};
  for (const u of mergedUnits) unitVersions[u.id] = u.versionNumber;

  const pkg: OfflineEditionPackage = {
    editionId: params.tree.edition.id,
    masterBook: params.tree.masterBook,
    edition: params.tree.edition,
    chapters: mergedChapters,
    units: mergedUnits,
    manifest: {
      editionId: params.tree.edition.id,
      masterBookId: params.tree.masterBook.id,
      editionVersion: params.tree.edition.versionNumber,
      chapterVersions,
      unitVersions,
      downloadedChapterIds:
        params.chapterIds && params.chapterIds.length > 0
          ? mergedChapters.map((c) => c.id)
          : undefined,
      lastSyncedAt: new Date().toISOString(),
      totalAudioBytes: totalBytes,
    },
  };

  await vault.savePackage(pkg);
  return pkg;
}

export async function removeEditionFromOfflineVault(
  editionId: string,
  vault: OttOfflineVaultStore = getOttOfflineVaultStore()
): Promise<void> {
  await vault.deleteAudioByEdition(editionId);
  await vault.deletePackage(editionId);
}

/**
 * Applies an incremental Delta-Sync result for one downloaded edition directly into
 * the local offline vault, updating chapters/units, removing soft-deleted records,
 * and silently prefetching newly added or updated audio blobs in the background.
 */
export async function applyDeltaResultToOfflineVault(params: {
  delta: OttDeltaSyncEditionResult;
  vault?: OttOfflineVaultStore;
  fetchAudioBlob?: (audioUrl: string, signal?: AbortSignal) => Promise<Blob>;
  signal?: AbortSignal;
}): Promise<{ pkg: OfflineEditionPackage | null; prefetchedAudioCount: number; prunedAudioCount: number }> {
  const vault = params.vault ?? getOttOfflineVaultStore();
  const { delta, signal } = params;

  if (delta.editionDeleted) {
    await removeEditionFromOfflineVault(delta.editionId, vault);
    return { pkg: null, prefetchedAudioCount: 0, prunedAudioCount: 0 };
  }

  const existing = await vault.getPackage(delta.editionId);
  if (!existing) {
    return { pkg: null, prefetchedAudioCount: 0, prunedAudioCount: 0 };
  }

  const previousAudioUrls = new Set(
    collectEditionAudioUrls(existing.edition, existing.chapters, existing.units)
  );

  const chapterMap = new Map(existing.chapters.map((c) => [c.id, c]));
  const unitMap = new Map(existing.units.map((u) => [u.id, u]));

  for (const id of delta.deletedChapterIds) chapterMap.delete(id);
  for (const id of delta.deletedUnitIds) unitMap.delete(id);

  for (const ch of [...delta.addedChapters, ...delta.updatedChapters]) {
    chapterMap.set(ch.id, ch);
  }
  for (const u of [...delta.addedUnits, ...delta.updatedUnits]) {
    unitMap.set(u.id, u);
  }

  const nextEdition = delta.edition ?? {
    ...existing.edition,
    versionNumber: delta.latestEditionVersion,
  };
  const nextChapters = Array.from(chapterMap.values()).sort(
    (a, b) => a.chapterOrder - b.chapterOrder
  );
  const nextUnits = Array.from(unitMap.values()).sort((a, b) => a.unitOrder - b.unitOrder);

  const nextActiveAudioUrls = new Set(
    collectEditionAudioUrls(nextEdition, nextChapters, nextUnits)
  );

  // Prune orphaned audio blobs belonging to deleted chapters/units or replaced audio tracks
  let prunedAudioCount = 0;
  for (const oldUrl of previousAudioUrls) {
    if (!nextActiveAudioUrls.has(oldUrl)) {
      try {
        await vault.deleteAudioBlob(oldUrl);
        prunedAudioCount += 1;
      } catch {
        // Ignore non-fatal cleanup error
      }
    }
  }

  const fetchBlob =
    params.fetchAudioBlob ??
    (async (url: string, abortSignal?: AbortSignal) => {
      const resp = await fetch(url, abortSignal ? { signal: abortSignal } : undefined);
      if (!resp.ok) throw new Error(`Audio prefetch failed (${resp.status})`);
      return resp.blob();
    });

  let prefetchedAudioCount = 0;
  for (const audioUrl of delta.audioUrlsToPrefetch) {
    if (signal?.aborted) break;
    try {
      const blob = await fetchBlob(audioUrl, signal);
      if (signal?.aborted) break;
      await vault.putAudioBlob({
        audioUrl,
        editionId: delta.editionId,
        mimeType: blob.type || 'audio/wav',
        byteSize: blob.size,
        blob,
        savedAt: delta.syncedAt,
      });
      prefetchedAudioCount += 1;
    } catch {
      // Tolerate transient audio fetch error; text delta still applies cleanly
    }
  }

  // Recompute accurate cached audio byte footprint across active URLs
  let totalAudioBytes = 0;
  for (const activeUrl of nextActiveAudioUrls) {
    try {
      const rec = await vault.getAudioBlob(activeUrl);
      if (rec) totalAudioBytes += rec.byteSize;
    } catch {
      // Non-fatal
    }
  }

  const chapterVersions: Record<string, number> = {};
  for (const ch of nextChapters) chapterVersions[ch.id] = ch.versionNumber;
  const unitVersions: Record<string, number> = {};
  for (const u of nextUnits) unitVersions[u.id] = u.versionNumber;

  const updatedPkg: OfflineEditionPackage = {
    ...existing,
    edition: nextEdition,
    chapters: nextChapters,
    units: nextUnits,
    manifest: {
      ...existing.manifest,
      editionVersion: delta.latestEditionVersion,
      chapterVersions,
      unitVersions,
      lastSyncedAt: delta.syncedAt,
      totalAudioBytes,
    },
  };

  await vault.savePackage(updatedPkg);
  return { pkg: updatedPkg, prefetchedAudioCount, prunedAudioCount };
}
