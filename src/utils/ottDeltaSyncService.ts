import type {
  OttDeltaSyncRequest,
  OttDeltaSyncResponse,
  OttEditionVersionDiff,
  OttRemoteEditionVersionManifest,
  OttSyncEditionChangeSummary,
  OttVersionManifestResponse,
} from '../types/ott';
import {
  applyDeltaResultToOfflineVault,
  getOttOfflineVaultStore,
  type OfflineEditionPackage,
  type OttOfflineVaultStore,
} from './ottOfflineVault';

export type OttSyncTrigger = 'online-return' | 'visibility' | 'manual' | 'startup';

export type OttSyncStatus = 'idle' | 'comparing' | 'downloading' | 'synced' | 'offline' | 'error';

export interface OttDeltaSyncReport {
  syncedAt: string;
  trigger: OttSyncTrigger;
  checkedEditions: number;
  skippedUpToDateEditions: number;
  updatedEditionTitles: string[];
  addedChaptersCount: number;
  updatedChaptersCount: number;
  deletedChaptersCount: number;
  addedUnitsCount: number;
  updatedUnitsCount: number;
  deletedUnitsCount: number;
  prefetchedAudioCount: number;
  prunedAudioCount: number;
  editionChanges: OttSyncEditionChangeSummary[];
  hasChanges: boolean;
}

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibilityDocumentLike extends EventTargetLike {
  visibilityState?: string;
}

export interface OttDeltaSyncServiceOptions {
  vault?: OttOfflineVaultStore;
  fetchVersionManifest?: (
    editionIds: string[],
    signal?: AbortSignal
  ) => Promise<OttVersionManifestResponse>;
  postDeltaSync?: (
    request: OttDeltaSyncRequest,
    signal?: AbortSignal
  ) => Promise<OttDeltaSyncResponse>;
  fetchAudioBlob?: (audioUrl: string, signal?: AbortSignal) => Promise<Blob>;
  initialOnline?: boolean;
  minSyncIntervalMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  now?: () => number;
  onStatusChange?: (status: OttSyncStatus, errorMessage: string | null) => void;
  onSyncComplete?: (report: OttDeltaSyncReport, updatedPackages: OfflineEditionPackage[]) => void;
  onSyncError?: (message: string) => void;
}

export interface OttDeltaSyncService {
  syncNow(trigger?: OttSyncTrigger): Promise<OttDeltaSyncReport | null>;
  handleOnline(): Promise<OttDeltaSyncReport | null>;
  handleOffline(): void;
  handleVisibilityVisible(): Promise<OttDeltaSyncReport | null>;
  isOnline(): boolean;
  getStatus(): OttSyncStatus;
  attachWindowListeners(
    target?: EventTargetLike | null,
    documentTarget?: VisibilityDocumentLike | null
  ): () => void;
  dispose(): void;
}

/**
 * Pure, deterministic version-number comparison between locally downloaded offline editions
 * and the backend version manifest. Identifies exactly which chapters and sections/articles
 * are new, updated (remote.versionNumber > localVersion), or soft-deleted.
 */
export function compareLocalWithRemoteManifest(
  localPackages: readonly OfflineEditionPackage[],
  remoteEditions: readonly OttRemoteEditionVersionManifest[]
): OttEditionVersionDiff[] {
  const remoteById = new Map<string, OttRemoteEditionVersionManifest>();
  for (const remote of remoteEditions) {
    remoteById.set(remote.editionId, remote);
  }

  return localPackages.map((pkg) => {
    const remote = remoteById.get(pkg.editionId);
    const localEditionVersion = pkg.manifest.editionVersion;
    const localChapterVersions = pkg.manifest.chapterVersions ?? {};
    const localUnitVersions = pkg.manifest.unitVersions ?? {};

    if (!remote || remote.isDeleted) {
      return {
        editionId: pkg.editionId,
        editionTitle: remote?.editionTitle || pkg.edition.title,
        languageName: remote?.languageName || pkg.edition.languageName,
        localEditionVersion,
        remoteEditionVersion: remote?.versionNumber ?? localEditionVersion,
        editionDeleted: true,
        editionMetadataUpdated: false,
        newChapterIds: [],
        updatedChapterIds: [],
        deletedChapterIds: Object.keys(localChapterVersions),
        newUnitIds: [],
        updatedUnitIds: [],
        deletedUnitIds: Object.keys(localUnitVersions),
        needsSync: true,
      };
    }

    const newChapterIds: string[] = [];
    const updatedChapterIds: string[] = [];
    const deletedChapterIds: string[] = [];

    for (const ch of remote.chapters) {
      const localVer = localChapterVersions[ch.id];
      if (ch.isDeleted) {
        if (localVer !== undefined) {
          deletedChapterIds.push(ch.id);
        }
        continue;
      }
      if (localVer === undefined) {
        newChapterIds.push(ch.id);
      } else if (ch.versionNumber > localVer) {
        updatedChapterIds.push(ch.id);
      }
    }

    const newUnitIds: string[] = [];
    const updatedUnitIds: string[] = [];
    const deletedUnitIds: string[] = [];

    for (const unit of remote.units) {
      const localVer = localUnitVersions[unit.id];
      if (unit.isDeleted) {
        if (localVer !== undefined) {
          deletedUnitIds.push(unit.id);
        }
        continue;
      }
      if (localVer === undefined) {
        newUnitIds.push(unit.id);
      } else if (unit.versionNumber > localVer) {
        updatedUnitIds.push(unit.id);
      }
    }

    const editionMetadataUpdated = remote.versionNumber > localEditionVersion;
    const needsSync =
      editionMetadataUpdated ||
      newChapterIds.length > 0 ||
      updatedChapterIds.length > 0 ||
      deletedChapterIds.length > 0 ||
      newUnitIds.length > 0 ||
      updatedUnitIds.length > 0 ||
      deletedUnitIds.length > 0;

    return {
      editionId: pkg.editionId,
      editionTitle: remote.editionTitle || pkg.edition.title,
      languageName: remote.languageName || pkg.edition.languageName,
      localEditionVersion,
      remoteEditionVersion: remote.versionNumber,
      editionDeleted: false,
      editionMetadataUpdated,
      newChapterIds,
      updatedChapterIds,
      deletedChapterIds,
      newUnitIds,
      updatedUnitIds,
      deletedUnitIds,
      needsSync,
    };
  });
}

/**
 * Formats a concise, user-facing summary describing newly downloaded or updated
 * chapters, sections/articles, and audio files after a background sync completes.
 */
export function formatSyncReportSummary(report: OttDeltaSyncReport): string {
  if (!report.hasChanges) {
    if (report.checkedEditions === 0) {
      return 'No offline editions downloaded yet.';
    }
    return `All ${report.checkedEditions} offline edition${report.checkedEditions === 1 ? ' is' : 's are'} up to date.`;
  }

  const parts: string[] = [];
  if (report.addedChaptersCount > 0) {
    parts.push(
      `+${report.addedChaptersCount} new chapter${report.addedChaptersCount === 1 ? '' : 's'}`
    );
  }
  if (report.updatedChaptersCount > 0) {
    parts.push(
      `${report.updatedChaptersCount} updated chapter${report.updatedChaptersCount === 1 ? '' : 's'}`
    );
  }
  if (report.addedUnitsCount > 0) {
    parts.push(
      `+${report.addedUnitsCount} new section/article${report.addedUnitsCount === 1 ? '' : 's'}`
    );
  }
  if (report.updatedUnitsCount > 0) {
    parts.push(
      `${report.updatedUnitsCount} updated section/article${report.updatedUnitsCount === 1 ? '' : 's'}`
    );
  }
  if (report.deletedChaptersCount > 0 || report.deletedUnitsCount > 0) {
    const removedTotal = report.deletedChaptersCount + report.deletedUnitsCount;
    parts.push(`${removedTotal} removed`);
  }
  if (report.prefetchedAudioCount > 0) {
    parts.push(
      `${report.prefetchedAudioCount} audio clip${report.prefetchedAudioCount === 1 ? '' : 's'} cached`
    );
  }

  const prefix =
    report.trigger === 'online-return'
      ? 'Synced on reconnect'
      : report.trigger === 'visibility'
        ? 'Background sync complete'
        : 'Offline library updated';

  const titles =
    report.updatedEditionTitles.length > 0 ? report.updatedEditionTitles.join(', ') : 'Offline books';

  return `${prefix}: ${titles} (${parts.join(' · ') || 'version metadata refreshed'}).`;
}

async function defaultFetchVersionManifest(
  editionIds: string[],
  signal?: AbortSignal
): Promise<OttVersionManifestResponse> {
  const qs = encodeURIComponent(editionIds.join(','));
  const response = await fetch(`/api/books-structures/sync/manifest?editionIds=${qs}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Version manifest API failed with HTTP ${response.status}`);
  }
  return (await response.json()) as OttVersionManifestResponse;
}

async function defaultPostDeltaSync(
  request: OttDeltaSyncRequest,
  signal?: AbortSignal
): Promise<OttDeltaSyncResponse> {
  const response = await fetch('/api/books-structures/sync/delta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Delta-Sync API failed with HTTP ${response.status}`);
  }
  return (await response.json()) as OttDeltaSyncResponse;
}

/**
 * Automatic 2-Phase Background Sync Service for downloaded mobile offline books.
 *
 * Phase 1: Compares local version metadata (editionVersion, chapterVersions, unitVersions)
 *          against `/api/books-structures/sync/manifest` to identify stale editions without transferring
 *          heavy content payloads when everything is already up to date.
 * Phase 2: Calls `/api/books-structures/sync/delta` ONLY for editions with version differences, downloads
 *          new/updated chapters, sections/articles/topics, and their manual audio blobs into the private
 *          IndexedDB vault, prunes deleted audio blobs, and notifies the mobile UI.
 */
export function createOttDeltaSyncService(
  options?: OttDeltaSyncServiceOptions
): OttDeltaSyncService {
  const vault = options?.vault ?? getOttOfflineVaultStore();
  // Use 2-phase manifest comparison by default unless a custom postDeltaSync was injected without a manifest fetcher
  const shouldUseManifestPhase =
    options?.fetchVersionManifest !== undefined || options?.postDeltaSync === undefined;
  const fetchVersionManifest = options?.fetchVersionManifest ?? defaultFetchVersionManifest;
  const postDeltaSync = options?.postDeltaSync ?? defaultPostDeltaSync;

  const minSyncIntervalMs = options?.minSyncIntervalMs ?? 30_000;
  const maxRetries = options?.maxRetries ?? 2;
  const retryBaseDelayMs = options?.retryBaseDelayMs ?? 1_500;
  const now = options?.now ?? (() => Date.now());

  let online = options?.initialOnline ?? true;
  let status: OttSyncStatus = online ? 'idle' : 'offline';
  let inFlight: Promise<OttDeltaSyncReport | null> | null = null;
  let activeAbortController: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempts = 0;
  let lastAttemptMs = 0;
  let disposed = false;
  let detachFn: (() => void) | null = null;

  const setStatus = (nextStatus: OttSyncStatus, errorMessage: string | null = null) => {
    status = nextStatus;
    options?.onStatusChange?.(nextStatus, errorMessage);
  };

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const abortInFlight = () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  };

  const syncNow = async (trigger: OttSyncTrigger = 'manual'): Promise<OttDeltaSyncReport | null> => {
    if (disposed) return null;
    if (!online) {
      setStatus('offline', null);
      return null;
    }
    if (inFlight) return inFlight;

    clearRetryTimer();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeAbortController = controller;
    lastAttemptMs = now();
    setStatus('comparing', null);

    const run = (async (): Promise<OttDeltaSyncReport | null> => {
      try {
        const packages = await vault.listPackages();
        if (disposed || !online || controller?.signal.aborted) return null;

        if (packages.length === 0) {
          const emptyReport: OttDeltaSyncReport = {
            syncedAt: new Date(now()).toISOString(),
            trigger,
            checkedEditions: 0,
            skippedUpToDateEditions: 0,
            updatedEditionTitles: [],
            addedChaptersCount: 0,
            updatedChaptersCount: 0,
            deletedChaptersCount: 0,
            addedUnitsCount: 0,
            updatedUnitsCount: 0,
            deletedUnitsCount: 0,
            prefetchedAudioCount: 0,
            prunedAudioCount: 0,
            editionChanges: [],
            hasChanges: false,
          };
          retryAttempts = 0;
          setStatus('synced', null);
          options?.onSyncComplete?.(emptyReport, []);
          return emptyReport;
        }

        // Phase 1: Lightweight local-vs-backend version number comparison
        let stalePackages = packages;
        let skippedUpToDateEditions = 0;
        let manifestServerTime: string | null = null;

        if (shouldUseManifestPhase) {
          const manifestResponse = await fetchVersionManifest(
            packages.map((p) => p.editionId),
            controller?.signal
          );
          if (disposed || !online || controller?.signal.aborted) return null;
          manifestServerTime = manifestResponse.serverTime;

          const diffs = compareLocalWithRemoteManifest(packages, manifestResponse.editions);
          const staleIds = new Set(diffs.filter((d) => d.needsSync).map((d) => d.editionId));
          stalePackages = packages.filter((p) => staleIds.has(p.editionId));
          skippedUpToDateEditions = packages.length - stalePackages.length;

          if (stalePackages.length === 0) {
            // Update lastSyncedAt on local manifests without downloading any content
            const syncedAt = manifestServerTime || new Date(now()).toISOString();
            const refreshed: OfflineEditionPackage[] = [];
            for (const pkg of packages) {
              const touched: OfflineEditionPackage = {
                ...pkg,
                manifest: {
                  ...pkg.manifest,
                  lastSyncedAt: syncedAt,
                },
              };
              await vault.savePackage(touched);
              refreshed.push(touched);
            }

            const upToDateReport: OttDeltaSyncReport = {
              syncedAt,
              trigger,
              checkedEditions: packages.length,
              skippedUpToDateEditions: packages.length,
              updatedEditionTitles: [],
              addedChaptersCount: 0,
              updatedChaptersCount: 0,
              deletedChaptersCount: 0,
              addedUnitsCount: 0,
              updatedUnitsCount: 0,
              deletedUnitsCount: 0,
              prefetchedAudioCount: 0,
              prunedAudioCount: 0,
              editionChanges: [],
              hasChanges: false,
            };
            retryAttempts = 0;
            setStatus('synced', null);
            options?.onSyncComplete?.(upToDateReport, refreshed);
            return upToDateReport;
          }
        }

        // Phase 2: Fetch and apply incremental delta ONLY for stale editions
        setStatus('downloading', null);
        const packageById = new Map(packages.map((p) => [p.editionId, p]));

        const reqPayload: OttDeltaSyncRequest = {
          downloadedEditions: stalePackages.map((pkg) => ({
            editionId: pkg.editionId,
            editionVersion: pkg.manifest.editionVersion,
            chapterVersions: pkg.manifest.chapterVersions,
            unitVersions: pkg.manifest.unitVersions,
          })),
        };

        const response = await postDeltaSync(reqPayload, controller?.signal);
        if (disposed || !online || controller?.signal.aborted) return null;

        let prefetchedAudioCount = 0;
        let prunedAudioCount = 0;
        let deletedChaptersCount = 0;
        let deletedUnitsCount = 0;
        const updatedEditionTitles: string[] = [];
        const editionChanges: OttSyncEditionChangeSummary[] = [];

        for (const delta of response.results) {
          if (delta.upToDate) continue;
          const prevPkg = packageById.get(delta.editionId);
          const applied = await applyDeltaResultToOfflineVault({
            delta,
            vault,
            fetchAudioBlob: options?.fetchAudioBlob,
            signal: controller?.signal,
          });
          if (disposed || !online || controller?.signal.aborted) return null;

          prefetchedAudioCount += applied.prefetchedAudioCount;
          prunedAudioCount += applied.prunedAudioCount;
          deletedChaptersCount += delta.deletedChapterIds.length;
          deletedUnitsCount += delta.deletedUnitIds.length;

          if (delta.editionTitle) {
            updatedEditionTitles.push(
              delta.languageName
                ? `${delta.editionTitle} (${delta.languageName})`
                : delta.editionTitle
            );
          }

          editionChanges.push({
            editionId: delta.editionId,
            masterBookId: delta.masterBookId || prevPkg?.masterBook.id || '',
            editionTitle: delta.editionTitle || prevPkg?.edition.title || 'Edition',
            languageName: delta.languageName || prevPkg?.edition.languageName || '',
            previousEditionVersion: prevPkg?.manifest.editionVersion ?? 0,
            latestEditionVersion: delta.latestEditionVersion,
            editionDeleted: delta.editionDeleted,
            addedChapters: delta.addedChapters.map((c) => ({
              id: c.id,
              chapterNumber: c.chapterNumber,
              title: c.title,
              versionNumber: c.versionNumber,
            })),
            updatedChapters: delta.updatedChapters.map((c) => ({
              id: c.id,
              chapterNumber: c.chapterNumber,
              title: c.title,
              versionNumber: c.versionNumber,
            })),
            deletedChapterIds: delta.deletedChapterIds,
            addedUnits: delta.addedUnits.map((u) => ({
              id: u.id,
              chapterId: u.chapterId,
              unitNumber: u.unitNumber,
              title: u.title,
              versionNumber: u.versionNumber,
            })),
            updatedUnits: delta.updatedUnits.map((u) => ({
              id: u.id,
              chapterId: u.chapterId,
              unitNumber: u.unitNumber,
              title: u.title,
              versionNumber: u.versionNumber,
            })),
            deletedUnitIds: delta.deletedUnitIds,
            prefetchedAudioCount: applied.prefetchedAudioCount,
          });
        }

        const refreshedPackages = await vault.listPackages();
        const hasChanges =
          response.totalAddedChapters > 0 ||
          response.totalUpdatedChapters > 0 ||
          deletedChaptersCount > 0 ||
          response.totalAddedUnits > 0 ||
          response.totalUpdatedUnits > 0 ||
          deletedUnitsCount > 0 ||
          updatedEditionTitles.length > 0;

        const report: OttDeltaSyncReport = {
          syncedAt: response.serverTime || manifestServerTime || new Date(now()).toISOString(),
          trigger,
          checkedEditions: packages.length,
          skippedUpToDateEditions,
          updatedEditionTitles,
          addedChaptersCount: response.totalAddedChapters,
          updatedChaptersCount: response.totalUpdatedChapters,
          deletedChaptersCount,
          addedUnitsCount: response.totalAddedUnits,
          updatedUnitsCount: response.totalUpdatedUnits,
          deletedUnitsCount,
          prefetchedAudioCount,
          prunedAudioCount,
          editionChanges,
          hasChanges,
        };

        retryAttempts = 0;
        setStatus('synced', null);
        options?.onSyncComplete?.(report, refreshedPackages);
        return report;
      } catch (err) {
        if (disposed || !online || controller?.signal.aborted) {
          return null;
        }
        const msg = err instanceof Error ? err.message : 'Background Delta-Sync failed.';
        setStatus('error', msg);
        options?.onSyncError?.(msg);

        if (retryAttempts < maxRetries && retryBaseDelayMs > 0) {
          const delay = retryBaseDelayMs * Math.pow(2, retryAttempts);
          retryAttempts += 1;
          clearRetryTimer();
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (!disposed && online) {
              void syncNow(trigger);
            }
          }, delay);
        }
        return null;
      } finally {
        if (activeAbortController === controller) {
          activeAbortController = null;
        }
        inFlight = null;
      }
    })();

    inFlight = run;
    return run;
  };

  const handleOffline = () => {
    if (disposed) return;
    online = false;
    retryAttempts = 0;
    clearRetryTimer();
    abortInFlight();
    setStatus('offline', null);
  };

  const handleOnline = async () => {
    if (disposed) return null;
    const wasOffline = !online;
    online = true;
    retryAttempts = 0;
    clearRetryTimer();
    return syncNow(wasOffline ? 'online-return' : 'manual');
  };

  const handleVisibilityVisible = async () => {
    if (disposed || !online) return null;
    if (now() - lastAttemptMs < minSyncIntervalMs) return null;
    return syncNow('visibility');
  };

  const attachWindowListeners = (
    target?: EventTargetLike | null,
    documentTarget?: VisibilityDocumentLike | null
  ) => {
    detachFn?.();
    const onOnline = () => {
      void handleOnline();
    };
    const onOffline = () => {
      handleOffline();
    };
    const onVisibilityChange = () => {
      if (!documentTarget || documentTarget.visibilityState === 'visible') {
        void handleVisibilityVisible();
      }
    };
    target?.addEventListener('online', onOnline);
    target?.addEventListener('offline', onOffline);
    documentTarget?.addEventListener('visibilitychange', onVisibilityChange);

    const detach = () => {
      target?.removeEventListener('online', onOnline);
      target?.removeEventListener('offline', onOffline);
      documentTarget?.removeEventListener('visibilitychange', onVisibilityChange);
      if (detachFn === detach) detachFn = null;
    };
    detachFn = detach;
    return detach;
  };

  const dispose = () => {
    disposed = true;
    clearRetryTimer();
    abortInFlight();
    detachFn?.();
  };

  return {
    syncNow,
    handleOnline,
    handleOffline,
    handleVisibilityVisible,
    isOnline: () => online,
    getStatus: () => status,
    attachWindowListeners,
    dispose,
  };
}

