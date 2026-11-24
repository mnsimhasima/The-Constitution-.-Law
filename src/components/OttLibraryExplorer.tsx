import {
  CheckCircle2,
  CloudOff,
  Download,
  Globe,
  HardDrive,
  Headphones,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MobileBackgroundSyncController } from '../hooks/useMobileBackgroundSync';
import type {
  OttEditionDetailTree,
  OttMasterBookWithEditions,
} from '../types/ott';
import {
  downloadEditionToOfflineVault,
  getOttOfflineVaultStore,
  removeEditionFromOfflineVault,
  type OfflineEditionPackage,
} from '../utils/ottOfflineVault';

export interface OttFocusTarget {
  masterBookId?: string;
  editionId?: string;
  token: number;
}

interface OttLibraryExplorerProps {
  syncController?: MobileBackgroundSyncController;
  focusTarget?: OttFocusTarget | null;
}

interface ActiveTrack {
  audioUrl: string;
  label: string;
  sublabel: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildTreeFromOfflinePackage(
  pkg: OfflineEditionPackage,
  allPackages: OfflineEditionPackage[]
): OttEditionDetailTree {
  const siblingPackages = allPackages.filter(
    (item) => item.masterBook.id === pkg.masterBook.id
  );
  return {
    masterBook: pkg.masterBook,
    edition: pkg.edition,
    siblingEditions: siblingPackages.map((item) => ({
      ...item.edition,
      chapterCount: item.chapters.length,
      unitCount: item.units.length,
    })),
    chapters: [...pkg.chapters]
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((ch) => ({
        ...ch,
        units: pkg.units
          .filter((u) => u.chapterId === ch.id)
          .sort((a, b) => a.unitOrder - b.unitOrder),
      })),
  };
}

export function OttLibraryExplorer({
  syncController,
  focusTarget = null,
}: OttLibraryExplorerProps = {}) {
  const [masterBooks, setMasterBooks] = useState<OttMasterBookWithEditions[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<string>(
    () => focusTarget?.masterBookId ?? ''
  );
  const [selectedEditionId, setSelectedEditionId] = useState<string>(
    () => focusTarget?.editionId ?? ''
  );
  const [editionTree, setEditionTree] = useState<OttEditionDetailTree | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const focusTargetRef = useRef<OttFocusTarget | null>(focusTarget);
  focusTargetRef.current = focusTarget;

  const [localOfflinePackages, setLocalOfflinePackages] = useState<OfflineEditionPackage[]>([]);
  const [localIsOnline, setLocalIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [loading, setLoading] = useState(true);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [localSyncBanner, setLocalSyncBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [audioSourceMode, setAudioSourceMode] = useState<'offline-vault' | 'stream'>('stream');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const offlinePackages = syncController ? syncController.offlinePackages : localOfflinePackages;
  const isOnline = syncController ? syncController.isOnline : localIsOnline;
  const syncing = syncController ? syncController.isSyncing : false;
  const syncBanner = localSyncBanner ?? syncController?.syncNotice?.message ?? null;

  const refreshOfflinePackages = useCallback(async () => {
    if (syncController) {
      return syncController.refreshOfflinePackages();
    }
    try {
      const vault = getOttOfflineVaultStore();
      const pkgs = await vault.listPackages();
      setLocalOfflinePackages(pkgs);
      return pkgs;
    } catch {
      return [];
    }
  }, [syncController]);

  const loadCatalog = useCallback(
    async (preferMasterId?: string, preferEditionId?: string) => {
      setLoading(true);
      setErrorMsg(null);
      const localPkgs = await refreshOfflinePackages();

      try {
        const resp = await fetch('/api/books-structures/master-books');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { masterBooks: OttMasterBookWithEditions[] };
        setMasterBooks(data.masterBooks);

        const activeFocus = focusTargetRef.current;
        const desiredMasterId =
          preferMasterId ||
          (activeFocus && activeFocus.token > 0 ? activeFocus.masterBookId : undefined) ||
          selectedMasterId;
        const desiredEditionId =
          preferEditionId ||
          (activeFocus && activeFocus.token > 0 ? activeFocus.editionId : undefined) ||
          selectedEditionId;

        const nextMaster =
          data.masterBooks.find((m) => m.id === desiredMasterId) ??
          (desiredEditionId
            ? data.masterBooks.find((m) => m.editions.some((e) => e.id === desiredEditionId))
            : undefined) ??
          data.masterBooks[0];
        if (nextMaster) {
          setSelectedMasterId(nextMaster.id);
          const nextEdition =
            nextMaster.editions.find((e) => e.id === desiredEditionId) ??
            nextMaster.editions[0];
          if (nextEdition) {
            setSelectedEditionId(nextEdition.id);
          }
        }
      } catch {
        // Offline fallback: reconstruct catalog from private in-app IndexedDB vault
        if (localPkgs.length > 0) {
          const grouped = new Map<string, OttMasterBookWithEditions>();
          for (const pkg of localPkgs) {
            const existing = grouped.get(pkg.masterBook.id);
            const summary = {
              ...pkg.edition,
              chapterCount: pkg.chapters.length,
              unitCount: pkg.units.length,
            };
            if (existing) {
              existing.editions.push(summary);
            } else {
              grouped.set(pkg.masterBook.id, {
                ...pkg.masterBook,
                editions: [summary],
              });
            }
          }
          const offlineMasters = Array.from(grouped.values());
          setMasterBooks(offlineMasters);
          const activeFocus = focusTargetRef.current;
          const desiredMasterId =
            preferMasterId ||
            (activeFocus && activeFocus.token > 0 ? activeFocus.masterBookId : undefined) ||
            selectedMasterId;
          const desiredEditionId =
            preferEditionId ||
            (activeFocus && activeFocus.token > 0 ? activeFocus.editionId : undefined) ||
            selectedEditionId;
          const nextMaster =
            offlineMasters.find((m) => m.id === desiredMasterId) ??
            (desiredEditionId
              ? offlineMasters.find((m) => m.editions.some((e) => e.id === desiredEditionId))
              : undefined) ??
            offlineMasters[0];
          if (nextMaster) {
            setSelectedMasterId(nextMaster.id);
            const nextEdition =
              nextMaster.editions.find((e) => e.id === desiredEditionId) ??
              nextMaster.editions[0];
            setSelectedEditionId(nextEdition?.id ?? '');
          }
        } else {
          setErrorMsg(
            'You are offline and have not downloaded any books into in-app storage yet.'
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [refreshOfflinePackages, selectedEditionId, selectedMasterId]
  );

  const loadEdition = useCallback(
    async (editionId: string) => {
      if (!editionId) return;
      try {
        const resp = await fetch(`/api/books-structures/editions/${encodeURIComponent(editionId)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const tree = (await resp.json()) as OttEditionDetailTree;
        setEditionTree(tree);
        setSelectedChapterId((prev) =>
          tree.chapters.some((c) => c.id === prev) ? prev : (tree.chapters[0]?.id ?? '')
        );
      } catch {
        // Transparent offline fallback from internal IndexedDB vault
        const vault = getOttOfflineVaultStore();
        const pkg = await vault.getPackage(editionId);
        const allPkgs = await vault.listPackages();
        if (pkg) {
          const tree = buildTreeFromOfflinePackage(pkg, allPkgs);
          setEditionTree(tree);
          setSelectedChapterId((prev) =>
            tree.chapters.some((c) => c.id === prev) ? prev : (tree.chapters[0]?.id ?? '')
          );
        }
      }
    },
    []
  );

  // Initial load (respecting any deep-linked edition focusTarget)
  useEffect(() => {
    void loadCatalog(focusTarget?.masterBookId, focusTarget?.editionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load selected edition when editionId changes
  useEffect(() => {
    if (selectedEditionId) {
      void loadEdition(selectedEditionId);
    }
  }, [selectedEditionId, loadEdition]);

  // Keep online state tracked even if rendered standalone without syncController
  useEffect(() => {
    if (syncController) return;
    const onOnline = () => setLocalIsOnline(true);
    const onOffline = () => setLocalIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncController]);

  // Reactively refresh the active edition tree whenever app-wide background sync applies updates
  const syncRevision = syncController?.syncRevision ?? 0;
  useEffect(() => {
    if (syncRevision > 0 && selectedEditionId) {
      void loadCatalog(selectedMasterId, selectedEditionId);
      void loadEdition(selectedEditionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncRevision]);

  // Focus a specific updated edition when the user clicks "View Updates" from another tab
  useEffect(() => {
    if (!focusTarget || focusTarget.token <= 0) return;
    if (focusTarget.masterBookId) {
      setSelectedMasterId(focusTarget.masterBookId);
    }
    if (focusTarget.editionId) {
      setSelectedEditionId(focusTarget.editionId);
      setSelectedChapterId('');
    }
  }, [focusTarget]);

  // Clean up Blob object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Keep HTMLAudioElement playbackRate in sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const activeMaster = useMemo(
    () => masterBooks.find((m) => m.id === selectedMasterId) ?? null,
    [masterBooks, selectedMasterId]
  );

  const activeOfflinePkg = useMemo(
    () => offlinePackages.find((p) => p.editionId === selectedEditionId) ?? null,
    [offlinePackages, selectedEditionId]
  );

  const activeChapter = useMemo(
    () => editionTree?.chapters.find((c) => c.id === selectedChapterId) ?? editionTree?.chapters[0] ?? null,
    [editionTree, selectedChapterId]
  );

  const handleDownloadEdition = async (chapterIds?: string[]) => {
    if (!editionTree) return;
    const key = chapterIds?.length ? `ch-${chapterIds[0]}` : `ed-${editionTree.edition.id}`;
    setDownloadingKey(key);
    setDownloadProgress({ done: 0, total: 1 });
    setLocalSyncBanner(null);

    try {
      const pkg = syncController
        ? await syncController.downloadEdition(editionTree, chapterIds, (done, total) =>
            setDownloadProgress({ done, total })
          )
        : await downloadEditionToOfflineVault({
            tree: editionTree,
            chapterIds,
            onProgress: (done, total) => setDownloadProgress({ done, total }),
          });
      if (!syncController) {
        await refreshOfflinePackages();
      }
      setLocalSyncBanner(
        chapterIds?.length
          ? `Saved chapter privately inside app offline storage (${formatBytes(pkg.manifest.totalAudioBytes)}).`
          : `Downloaded "${editionTree.edition.title}" (${editionTree.chapters.length} chapters, ${formatBytes(pkg.manifest.totalAudioBytes)}) to private app storage.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Offline download failed.');
    } finally {
      setDownloadingKey(null);
      setDownloadProgress(null);
    }
  };

  const handleRemoveOfflineEdition = async (editionId: string) => {
    if (syncController) {
      await syncController.removeOfflineEdition(editionId);
    } else {
      await removeEditionFromOfflineVault(editionId);
      await refreshOfflinePackages();
    }
    setLocalSyncBanner('Removed offline edition and audio cache from private in-app storage.');
  };

  const handleManualDeltaSync = async () => {
    setLocalSyncBanner(null);
    if (syncController) {
      await syncController.syncNow('manual');
    }
  };

  const handlePlayAudioBlock = async (audioUrl: string | undefined, label: string, sublabel: string) => {
    if (!audioUrl) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    // Toggle play/pause if same track
    if (activeTrack?.audioUrl === audioUrl) {
      if (isPlaying) {
        audioEl.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioEl.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      }
      return;
    }

    // Revoke previous offline blob URL if any
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    // Prefer private in-app IndexedDB audio blob when downloaded (100% offline playback!)
    let resolvedSrc = audioUrl;
    let sourceMode: 'offline-vault' | 'stream' = 'stream';
    try {
      const cached = await getOttOfflineVaultStore().getAudioBlob(audioUrl);
      if (cached?.blob) {
        const blobUrl = URL.createObjectURL(cached.blob);
        objectUrlRef.current = blobUrl;
        resolvedSrc = blobUrl;
        sourceMode = 'offline-vault';
      }
    } catch {
      // Fall back to direct streaming
    }

    setActiveTrack({ audioUrl, label, sublabel });
    setAudioSourceMode(sourceMode);
    audioEl.src = resolvedSrc;
    audioEl.playbackRate = playbackRate;
    setCurrentTime(0);

    try {
      await audioEl.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const activeBookType = editionTree?.masterBook.bookType ?? 'constitutional';
  const unitLabel =
    activeBookType === 'general_law'
      ? 'Section'
      : activeBookType === 'biography'
        ? 'Topic'
        : 'Article';

  return (
    <div className="min-w-0 space-y-5">
      {/* Hidden native audio engine with background MediaSession metadata support */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />

      {/* Offline / Auto Delta-Sync Notification Banner */}
      {syncBanner && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{syncBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalSyncBanner(null);
              syncController?.dismissSyncNotice();
            }}
            aria-label="Dismiss sync notice"
            className="text-emerald-700 hover:text-emerald-950 dark:text-emerald-300 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span>
            Offline mode active. Reading and playing audio directly from private in-app storage — automatic Delta-Sync will run when your connection returns.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Master Book Selector Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loading ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-400">
            Loading Books &amp; Structures catalog…
          </div>
        ) : (
          masterBooks.map((mb) => {
            const selected = mb.id === selectedMasterId;
            const bookTypeLabel =
              mb.bookType === 'constitutional'
                ? 'Constitutional Law'
                : mb.bookType === 'general_law'
                  ? 'General Law'
                  : 'Biography / General';
            return (
              <button
                key={mb.id}
                type="button"
                onClick={() => {
                  setSelectedMasterId(mb.id);
                  const nextEd = mb.editions[0];
                  if (nextEd) {
                    setSelectedEditionId(nextEd.id);
                    setSelectedChapterId('');
                  }
                }}
                className={`flex min-w-0 flex-col justify-between rounded-2xl border p-4 text-left transition cursor-pointer ${
                  selected
                    ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-[#121620] dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400">
                    {bookTypeLabel} · {mb.jurisdiction} · {mb.enactmentYear}
                  </p>
                  <h2 className="mt-1 font-display text-base font-bold text-slate-950 dark:text-white">
                    {mb.canonicalTitle}
                  </h2>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  {mb.editions.length} native language edition{mb.editions.length === 1 ? '' : 's'} ·{' '}
                  {mb.editions.map((e) => e.nativeLanguageName).join(' · ')}
                </p>
              </button>
            );
          })
        )}
      </div>

      {/* Language Edition Switcher & Offline Download Control Strip */}
      {activeMaster && editionTree && (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620] sm:p-5">
          {/* Instant Language Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Edition Language (Manual Native Text &amp; Audio)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select book language edition">
              {activeMaster.editions.map((ed) => {
                const active = ed.id === selectedEditionId;
                return (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => {
                      setSelectedEditionId(ed.id);
                      setSelectedChapterId('');
                    }}
                    className={`min-h-[38px] rounded-xl px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {ed.nativeLanguageName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Edition Overview + Offline Vault Actions */}
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {editionTree.edition.languageName} Edition · v{editionTree.edition.versionNumber} ·{' '}
                {editionTree.chapters.length} chapters · Narrator: {editionTree.edition.narratorName}
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-950 dark:text-white sm:text-2xl">
                {editionTree.edition.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {editionTree.edition.description}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {editionTree.edition.descriptionAudioUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      void handlePlayAudioBlock(
                        editionTree.edition.descriptionAudioUrl,
                        editionTree.edition.title,
                        'Book Introduction Audio'
                      )
                    }
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-blue-700 cursor-pointer whitespace-nowrap"
                  >
                    {activeTrack?.audioUrl === editionTree.edition.descriptionAudioUrl && isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Listen to Book Intro
                  </button>
                )}

                <button
                  type="button"
                  disabled={downloadingKey !== null}
                  onClick={() => void handleDownloadEdition()}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-900 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingKey === `ed-${editionTree.edition.id}` && downloadProgress
                    ? `Saving ${downloadProgress.done}/${downloadProgress.total}...`
                    : activeOfflinePkg
                      ? 'Update Offline Download'
                      : 'Download Book Offline'}
                </button>

                {activeOfflinePkg && (
                  <>
                    <button
                      type="button"
                      disabled={syncing || !isOnline}
                      onClick={() => void handleManualDeltaSync()}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync Delta Updates'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveOfflineEdition(editionTree.edition.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove Offline
                    </button>
                  </>
                )}
              </div>

              {activeOfflinePkg && (
                <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                  <HardDrive className="h-3.5 w-3.5 shrink-0" />
                  Saved privately in app vault · v{activeOfflinePkg.manifest.editionVersion} ·{' '}
                  {activeOfflinePkg.chapters.length} chapter
                  {activeOfflinePkg.chapters.length === 1 ? '' : 's'} offline ·{' '}
                  {formatBytes(activeOfflinePkg.manifest.totalAudioBytes)}
                </p>
              )}
            </div>
          </div>

          {/* Inline OTT Audio Player Bar */}
          {activeTrack && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-slate-950 p-4 text-white dark:border-blue-500/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      void handlePlayAudioBlock(
                        activeTrack.audioUrl,
                        activeTrack.label,
                        activeTrack.sublabel
                      )
                    }
                    aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{activeTrack.label}</p>
                    <p className="truncate font-mono text-[11px] text-slate-400">
                      {activeTrack.sublabel} ·{' '}
                      {audioSourceMode === 'offline-vault' ? 'Private Offline Vault' : 'Live Audio Stream'}
                    </p>
                  </div>
                </div>

                {/* Granular Speed Controls */}
                <div className="flex items-center gap-1">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      className={`min-h-[32px] rounded-lg px-2 font-mono text-[11px] font-bold transition cursor-pointer ${
                        playbackRate === rate
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Seek Bar */}
              <div className="mt-3 flex items-center gap-3">
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {formatSeconds(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={Math.min(currentTime, duration || 1)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setCurrentTime(next);
                    if (audioRef.current) audioRef.current.currentTime = next;
                  }}
                  aria-label="Seek audio position"
                  className="h-1.5 flex-1 cursor-pointer accent-blue-500"
                />
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {formatSeconds(duration)}
                </span>
              </div>
            </div>
          )}

          {/* Chapter Navigation Tabs */}
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Chapters &amp; Parts ({editionTree.chapters.length})
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {editionTree.chapters.map((ch) => {
                const selected = ch.id === activeChapter?.id;
                const isChapterCached = Boolean(activeOfflinePkg?.manifest.chapterVersions[ch.id]);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChapterId(ch.id)}
                    className={`min-h-[40px] rounded-xl border px-3.5 py-1.5 text-left text-xs transition cursor-pointer ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    <span className="font-bold">{ch.chapterNumber}</span>
                    <span className={`ml-1.5 ${selected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {ch.title} {isChapterCached ? '· Offline' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Chapter Overview & Articles / Sections */}
          {activeChapter && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                      {activeChapter.chapterNumber} · v{activeChapter.versionNumber} ·{' '}
                      {activeChapter.estimatedMinutes} min listen · {activeChapter.units.length}{' '}
                      {unitLabel.toLowerCase()}s
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-950 dark:text-white">
                      {activeChapter.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {activeChapter.overviewDefinition}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeChapter.overviewAudioUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          void handlePlayAudioBlock(
                            activeChapter.overviewAudioUrl,
                            `${activeChapter.chapterNumber}: ${activeChapter.title}`,
                            'Chapter Overview Audio'
                          )
                        }
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-blue-600 dark:bg-white dark:text-slate-950 cursor-pointer whitespace-nowrap"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        Play Overview
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={downloadingKey !== null}
                      onClick={() => void handleDownloadEdition([activeChapter.id])}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {activeOfflinePkg?.manifest.chapterVersions[activeChapter.id]
                        ? 'Chapter Saved Offline'
                        : 'Save Chapter Offline'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Articles / Sections Cards */}
              <div className="space-y-4">
                {activeChapter.units.map((unit) => (
                  <article
                    key={unit.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0F131D] sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400 tabular-nums">
                          {unit.unitNumber} · v{unit.versionNumber}
                        </p>
                        <h4 className="mt-0.5 font-display text-base font-bold text-slate-950 dark:text-white sm:text-lg">
                          {unit.title}
                        </h4>
                      </div>
                      {unit.fullUnitAudioUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            void handlePlayAudioBlock(
                              unit.fullUnitAudioUrl,
                              `${unit.unitNumber}: ${unit.title}`,
                              `Full ${unitLabel} Audio`
                            )
                          }
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-600 hover:text-white dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white cursor-pointer whitespace-nowrap"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          Play Full {unitLabel}
                        </button>
                      )}
                    </div>

                    {/* Structured Content Blocks with Individual 1-to-1 Manual Audio Controls */}
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            {activeBookType === 'biography' ? 'Main Content' : 'Definition'}
                          </p>
                          {unit.definitionAudioUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePlayAudioBlock(
                                  unit.definitionAudioUrl,
                                  `${unit.unitNumber} · ${activeBookType === 'biography' ? 'Main Content' : 'Definition'}`,
                                  unit.title
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              Play
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                          {unit.definition}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            {activeBookType === 'biography'
                              ? 'Historical Context'
                              : 'Why It Was Introduced'}
                          </p>
                          {unit.purposeAudioUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePlayAudioBlock(
                                  unit.purposeAudioUrl,
                                  `${unit.unitNumber} · ${activeBookType === 'biography' ? 'Historical Context' : 'Purpose & Background'}`,
                                  unit.title
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              Play
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {unit.purposeBackground}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            {activeBookType === 'biography' ? 'Study Notes' : 'Deep Explanation'}
                          </p>
                          {unit.explanationAudioUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePlayAudioBlock(
                                  unit.explanationAudioUrl,
                                  `${unit.unitNumber} · ${activeBookType === 'biography' ? 'Study Notes' : 'Deep Explanation'}`,
                                  unit.title
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              Play
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {unit.deepExplanation}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            {activeBookType === 'biography'
                              ? 'Key Milestones & Highlights'
                              : unitLabel === 'Article'
                                ? 'Practical Examples'
                                : 'Case Examples'}
                          </p>
                          {unit.examplesAudioUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePlayAudioBlock(
                                  unit.examplesAudioUrl,
                                  `${unit.unitNumber} · ${activeBookType === 'biography' ? 'Milestones' : 'Examples'}`,
                                  unit.title
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              Play
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {unit.practicalExamples}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* In-App Offline Downloads Vault Summary */}
      {offlinePackages.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121620]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                In-App Offline Downloads ({offlinePackages.length})
              </h3>
            </div>
            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Private sandboxed IndexedDB vault · Auto Delta-Sync enabled
            </p>
          </div>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {offlinePackages.map((pkg) => (
              <div
                key={pkg.editionId}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {pkg.edition.title}{' '}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      ({pkg.edition.nativeLanguageName})
                    </span>
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    v{pkg.manifest.editionVersion} · {pkg.chapters.length} chapters ·{' '}
                    {pkg.units.length} units · {formatBytes(pkg.manifest.totalAudioBytes)} · Synced{' '}
                    {new Date(pkg.manifest.lastSyncedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMasterId(pkg.masterBook.id);
                      setSelectedEditionId(pkg.editionId);
                    }}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveOfflineEdition(pkg.editionId)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
