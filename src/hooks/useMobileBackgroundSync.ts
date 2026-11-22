import { useCallback, useEffect, useRef, useState } from 'react';
import type { OttEditionDetailTree } from '../types/ott';
import {
  createOttDeltaSyncService,
  formatSyncReportSummary,
  type OttDeltaSyncReport,
  type OttDeltaSyncService,
  type OttSyncStatus,
  type OttSyncTrigger,
} from '../utils/ottDeltaSyncService';
import {
  downloadEditionToOfflineVault,
  getOttOfflineVaultStore,
  removeEditionFromOfflineVault,
  type OfflineEditionPackage,
} from '../utils/ottOfflineVault';

export interface MobileSyncUpdateNotice {
  message: string;
  report: OttDeltaSyncReport;
  focusEditionId?: string;
  focusMasterBookId?: string;
}

export interface MobileBackgroundSyncController {
  offlinePackages: OfflineEditionPackage[];
  isOnline: boolean;
  isSyncing: boolean;
  syncStatus: OttSyncStatus;
  lastSyncReport: OttDeltaSyncReport | null;
  syncNotice: MobileSyncUpdateNotice | null;
  syncRevision: number;
  syncNow: (trigger?: OttSyncTrigger) => Promise<OttDeltaSyncReport | null>;
  downloadEdition: (
    tree: OttEditionDetailTree,
    chapterIds?: string[],
    onProgress?: (completed: number, total: number) => void
  ) => Promise<OfflineEditionPackage>;
  removeOfflineEdition: (editionId: string) => Promise<void>;
  refreshOfflinePackages: () => Promise<OfflineEditionPackage[]>;
  dismissSyncNotice: () => void;
}

export function useMobileBackgroundSync(options?: {
  enabled?: boolean;
  onUpdatesDownloaded?: (report: OttDeltaSyncReport, summaryText: string) => void;
}): MobileBackgroundSyncController {
  const enabled = options?.enabled ?? true;
  const onUpdatesDownloadedRef = useRef(options?.onUpdatesDownloaded);
  onUpdatesDownloadedRef.current = options?.onUpdatesDownloaded;

  const [offlinePackages, setOfflinePackages] = useState<OfflineEditionPackage[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<OttSyncStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle'
  );
  const [lastSyncReport, setLastSyncReport] = useState<OttDeltaSyncReport | null>(null);
  const [syncNotice, setSyncNotice] = useState<MobileSyncUpdateNotice | null>(null);
  const [syncRevision, setSyncRevision] = useState<number>(0);

  const serviceRef = useRef<OttDeltaSyncService | null>(null);

  const refreshOfflinePackages = useCallback(async () => {
    try {
      const pkgs = await getOttOfflineVaultStore().listPackages();
      setOfflinePackages(pkgs);
      return pkgs;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    const initialOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOnline(initialOnline);

    const service = createOttDeltaSyncService({
      initialOnline,
      minSyncIntervalMs: 30_000,
      maxRetries: 2,
      retryBaseDelayMs: 1_500,
      onStatusChange: (nextStatus) => {
        if (!mounted) return;
        setSyncStatus(nextStatus);
      },
      onSyncComplete: (report, updatedPackages) => {
        if (!mounted) return;
        setOfflinePackages(updatedPackages);
        setLastSyncReport(report);

        if (report.hasChanges) {
          setSyncRevision((prev) => prev + 1);
          const summaryText = formatSyncReportSummary(report);
          const firstChanged = report.editionChanges.find((c) => !c.editionDeleted);
          setSyncNotice({
            message: summaryText,
            report,
            focusEditionId: firstChanged?.editionId,
            focusMasterBookId: firstChanged?.masterBookId,
          });
          onUpdatesDownloadedRef.current?.(report, summaryText);
        } else if (report.trigger === 'manual' && report.checkedEditions > 0) {
          setSyncNotice({
            message: formatSyncReportSummary(report),
            report,
          });
        }
      },
      onSyncError: () => {
        if (!mounted) return;
        setSyncStatus('error');
      },
    });

    serviceRef.current = service;

    const handleOnlineUi = () => {
      if (mounted) setIsOnline(true);
    };
    const handleOfflineUi = () => {
      if (mounted) setIsOnline(false);
    };

    const detach = service.attachWindowListeners(
      typeof window !== 'undefined' ? window : null,
      typeof document !== 'undefined' ? document : null
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnlineUi);
      window.addEventListener('offline', handleOfflineUi);
    }

    // Hydrate local offline packages on mount and run a silent startup version check if online
    void (async () => {
      const pkgs = await refreshOfflinePackages();
      if (mounted && initialOnline && pkgs.length > 0) {
        await service.syncNow('startup');
      }
    })();

    return () => {
      mounted = false;
      detach();
      service.dispose();
      serviceRef.current = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnlineUi);
        window.removeEventListener('offline', handleOfflineUi);
      }
    };
  }, [enabled, refreshOfflinePackages]);

  const syncNow = useCallback(async (trigger: OttSyncTrigger = 'manual') => {
    const svc = serviceRef.current;
    if (!svc) return null;
    return svc.syncNow(trigger);
  }, []);

  const downloadEdition = useCallback(
    async (
      tree: OttEditionDetailTree,
      chapterIds?: string[],
      onProgress?: (completed: number, total: number) => void
    ) => {
      const pkg = await downloadEditionToOfflineVault({
        tree,
        chapterIds,
        onProgress,
      });
      await refreshOfflinePackages();
      return pkg;
    },
    [refreshOfflinePackages]
  );

  const removeOfflineEdition = useCallback(
    async (editionId: string) => {
      await removeEditionFromOfflineVault(editionId);
      await refreshOfflinePackages();
    },
    [refreshOfflinePackages]
  );

  const dismissSyncNotice = useCallback(() => {
    setSyncNotice(null);
  }, []);

  const isSyncing = syncStatus === 'comparing' || syncStatus === 'downloading';

  return {
    offlinePackages,
    isOnline,
    isSyncing,
    syncStatus,
    lastSyncReport,
    syncNotice,
    syncRevision,
    syncNow,
    downloadEdition,
    removeOfflineEdition,
    refreshOfflinePackages,
    dismissSyncNotice,
  };
}
