import type { User } from 'firebase/auth';
import {
  Bell,
  BookMarked,
  BookOpen,
  Check,
  Compass,
  Globe,
  Headphones,
  Layers,
  Library,
  LifeBuoy,
  LogIn,
  LogOut,
  Moon,
  MoreVertical,
  Palette,
  Printer,
  QrCode,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Type,
  UserCircle2,
  UserCog,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORTED_LANGUAGES } from '../data/booksData';
import type {
  AppTab,
  LanguageCode,
  LawBook,
  NotificationItem,
  SettingsSection,
  StudioSubTab,
} from '../types/library';
import type { LibraryQuickMatch } from '../utils/librarySearchOverlay';
import { LibrarySearchOverlay } from './LibrarySearchOverlay';

export type ReadMenuAction = 'related' | 'font' | 'audio' | 'glossary' | 'export';

interface NavigationShellProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  studioSubTab: StudioSubTab;
  onSelectStudioSubTab: (sub: StudioSubTab) => void;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  appDarkMode: boolean;
  onToggleDarkMode: () => void;
  hasActiveAudio: boolean;
  isAudioPlaying: boolean;
  user: User | null;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenAuthModal: () => void;
  onSignOut: () => Promise<void>;
  onOpenQrModal: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenSupportModal: () => void;
  onOpenAdminDashboard: () => void;
  // Contextual Search state (Library, Plans, Read)
  librarySearch: string;
  onLibrarySearchChange: (q: string) => void;
  libraryBooks?: LawBook[];
  libraryRecentSearches?: string[];
  onCommitLibrarySearch?: (q: string) => void;
  onRemoveRecentSearch?: (q: string) => void;
  onClearRecentSearches?: () => void;
  onOpenLibrarySearchMatch?: (match: LibraryQuickMatch) => void;
  plansSearch: string;
  onPlansSearchChange: (q: string) => void;
  // Read header controls
  readBookTitle: string;
  readSearchOpen: boolean;
  onToggleReadSearch: () => void;
  onTriggerReadAudio: () => void;
  onTriggerReadMenuAction: (action: ReadMenuAction) => void;
  isChromeHidden?: boolean;
  onChromeLockChange?: (locked: boolean) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Headphones }[] = [
  { id: 'home', label: 'Studio', icon: Headphones },
  { id: 'read', label: 'Read', icon: BookOpen },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'plans', label: 'Plans', icon: Compass },
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
];

type OpenPopover = 'none' | 'lang' | 'notifications' | 'profileMore' | 'readMore';

export function NavigationShell({
  activeTab,
  onSelectTab,
  studioSubTab,
  onSelectStudioSubTab,
  language,
  onChangeLanguage,
  appDarkMode,
  onToggleDarkMode,
  hasActiveAudio,
  isAudioPlaying,
  user,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenAuthModal,
  onSignOut,
  onOpenQrModal,
  onOpenSettings,
  onOpenSupportModal,
  onOpenAdminDashboard,
  librarySearch,
  onLibrarySearchChange,
  libraryBooks = [],
  libraryRecentSearches = [],
  onCommitLibrarySearch,
  onRemoveRecentSearch,
  onClearRecentSearches,
  onOpenLibrarySearchMatch,
  plansSearch,
  onPlansSearchChange,
  readBookTitle,
  readSearchOpen,
  onToggleReadSearch,
  onTriggerReadAudio,
  onTriggerReadMenuAction,
  isChromeHidden = false,
  onChromeLockChange,
  children,
}: NavigationShellProps) {
  const [openPopover, setOpenPopover] = useState<OpenPopover>('none');
  const [isHeaderSearchFocused, setIsHeaderSearchFocused] = useState(false);
  const [isLibrarySearchOpen, setIsLibrarySearchOpen] = useState(false);

  const activeLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    setOpenPopover('none');
    setIsHeaderSearchFocused(false);
    setIsLibrarySearchOpen(false);
  }, [activeTab]);

  useEffect(() => {
    onChromeLockChange?.(openPopover !== 'none' || isHeaderSearchFocused || isLibrarySearchOpen);
  }, [openPopover, isHeaderSearchFocused, isLibrarySearchOpen, onChromeLockChange]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPopover('none');
        setIsLibrarySearchOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  const togglePopover = (target: OpenPopover) => {
    setOpenPopover((prev) => (prev === target ? 'none' : target));
  };

  // Context-specific right-side / full header controls shared cleanly across mobile & desktop
  const renderContextualHeaderControls = (isDesktop: boolean) => {
    // 1. STUDIO TAB: Today | Community tabs (left) + Globe (EN/T) + Notification Bell ONLY (no logo/app name!)
    if (activeTab === 'home') {
      return (
        <div className="flex w-full items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Studio sections"
            className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-[#0D111A]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={studioSubTab === 'today'}
              onClick={() => onSelectStudioSubTab('today')}
              className={`min-h-[34px] rounded-lg px-3.5 text-xs font-bold transition cursor-pointer ${
                studioSubTab === 'today'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioSubTab === 'community'}
              onClick={() => onSelectStudioSubTab('community')}
              className={`min-h-[34px] rounded-lg px-3.5 text-xs font-bold transition cursor-pointer ${
                studioSubTab === 'community'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Community
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => togglePopover('lang')}
              aria-label={`Change language (${activeLangMeta.label})`}
              aria-expanded={openPopover === 'lang'}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs font-bold text-slate-800 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5 text-[#2563EB] dark:text-blue-400" />
              <span>{activeLangMeta.shortCode}</span>
            </button>

            <button
              type="button"
              onClick={() => togglePopover('notifications')}
              aria-label="Open notifications"
              aria-expanded={openPopover === 'notifications'}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2563EB] px-1 font-mono text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      );
    }

    // 2. READ TAB: Audio + Search + Language (Globe EN/T) + 3-dot Menu (Related Content, Font Settings, Select Audio)
    if (activeTab === 'read') {
      return (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="min-w-0 truncate font-display text-sm font-bold text-slate-950 dark:text-white lg:hidden">
            {readBookTitle}
          </span>
          {isDesktop && <span className="hidden lg:block" />}

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onTriggerReadAudio}
              aria-label={isAudioPlaying ? 'Pause audio narration' : 'Play audio narration'}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${
                isAudioPlaying
                  ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
              }`}
            >
              <Volume2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onToggleReadSearch}
              aria-label="Search in chapter"
              aria-pressed={readSearchOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${
                readSearchOpen
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => togglePopover('lang')}
              aria-label={`Change language (${activeLangMeta.label})`}
              aria-expanded={openPopover === 'lang'}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs font-bold text-slate-800 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5 text-[#2563EB] dark:text-blue-400" />
              <span>{activeLangMeta.shortCode}</span>
            </button>

            <button
              type="button"
              onClick={() => togglePopover('readMore')}
              aria-label="Read options menu"
              aria-expanded={openPopover === 'readMore'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    // 3. LIBRARY TAB: ONLY the Search bar (no notifications, QR, settings, or logo)
    if (activeTab === 'library') {
      return (
        <div className="relative flex w-full items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            role="searchbox"
            value={librarySearch}
            onChange={(e) => {
              onLibrarySearchChange(e.target.value);
              if (!isLibrarySearchOpen) setIsLibrarySearchOpen(true);
            }}
            onFocus={() => {
              setIsHeaderSearchFocused(true);
              setIsLibrarySearchOpen(true);
            }}
            onClick={() => setIsLibrarySearchOpen(true)}
            onBlur={() => setIsHeaderSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (librarySearch.trim()) {
                  onCommitLibrarySearch?.(librarySearch);
                }
                setIsLibrarySearchOpen(false);
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setIsLibrarySearchOpen(false);
                e.currentTarget.blur();
              }
            }}
            placeholder="Search library books, articles, or తెలుగు…"
            aria-label="Search library"
            aria-expanded={isLibrarySearchOpen}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-xs font-medium text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
          />
          {librarySearch && (
            <button
              type="button"
              onClick={() => onLibrarySearchChange('')}
              aria-label="Clear library search"
              className="absolute right-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }

    // 4. PLANS TAB: ONLY the Search bar (no notifications, QR, settings, or logo)
    if (activeTab === 'plans') {
      return (
        <div className="relative flex w-full items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={plansSearch}
            onChange={(e) => onPlansSearchChange(e.target.value)}
            onFocus={() => setIsHeaderSearchFocused(true)}
            onBlur={() => setIsHeaderSearchFocused(false)}
            placeholder="Search study plans & daily tracks…"
            aria-label="Search plans"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-xs font-medium text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
          />
          {plansSearch && (
            <button
              type="button"
              onClick={() => onPlansSearchChange('')}
              aria-label="Clear plans search"
              className="absolute right-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }

    // 5. PROFILE TAB: Logo & App Name HIDDEN — ONLY QR Code, Settings, and More Menu!
    return (
      <div className="flex w-full items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setOpenPopover('none');
            onOpenQrModal();
          }}
          aria-label="My Profile QR code"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
        >
          <QrCode className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setOpenPopover('none');
            onOpenSettings('general');
          }}
          aria-label="Open Settings"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => togglePopover('profileMore')}
          aria-label="Open More Menu"
          aria-expanded={openPopover === 'profileMore'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#F4F6FA] text-[#0C1018] transition-colors duration-200 dark:bg-[#090B10] dark:text-[#F4F7FC]">
      {/* Desktop Floating Top Command Bar */}
      <header
        data-chrome-hidden={isChromeHidden ? 'true' : 'false'}
        className={`sticky top-0 hidden pt-3 transition-all duration-300 ease-out will-change-transform lg:block ${
          activeTab === 'library' && isLibrarySearchOpen ? 'z-50' : 'z-30'
        } ${
          isChromeHidden
            ? 'pointer-events-none -translate-y-[120%] opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex h-16 items-center justify-between gap-4 rounded-[22px] border border-slate-200/80 bg-white/92 px-4 shadow-[0_8px_30px_rgba(12,16,24,0.06)] backdrop-blur-xl dark:border-slate-800/90 dark:bg-[#121620]/92 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            {/* Primary Navigation Tabs */}
            <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-[#0C1018] text-white shadow-sm dark:bg-[#2563EB] dark:text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right Contextual Header Controls for Active Tab */}
            <div className="flex min-w-0 flex-1 items-center justify-end">
              <div className="w-full max-w-md">{renderContextualHeaderControls(true)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Contextual Top Header (56px — 100% responsive, per-tab exact controls, auto-hides on scroll) */}
      <header
        data-chrome-hidden={isChromeHidden ? 'true' : 'false'}
        className={`sticky top-0 flex h-14 w-full items-center border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-xl transition-all duration-300 ease-out will-change-transform dark:border-slate-800/80 dark:bg-[#0D111A]/95 lg:hidden ${
          activeTab === 'library' && isLibrarySearchOpen ? 'z-50' : 'z-30'
        } ${
          isChromeHidden
            ? 'pointer-events-none -translate-y-full opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        {renderContextualHeaderControls(false)}
      </header>

      {/* Library Search Overlay (Recent Searches + Trending Legal Topics + Instant Matches) */}
      {activeTab === 'library' && (
        <LibrarySearchOverlay
          isOpen={isLibrarySearchOpen}
          query={librarySearch}
          language={language}
          books={libraryBooks}
          recentSearches={libraryRecentSearches}
          onSelectQuery={(selectedQuery) => {
            onLibrarySearchChange(selectedQuery);
            onCommitLibrarySearch?.(selectedQuery);
            setIsLibrarySearchOpen(false);
          }}
          onRemoveRecent={(term) => onRemoveRecentSearch?.(term)}
          onClearRecent={() => onClearRecentSearches?.()}
          onOpenMatch={(match) => {
            if (librarySearch.trim()) {
              onCommitLibrarySearch?.(librarySearch);
            }
            setIsLibrarySearchOpen(false);
            onOpenLibrarySearchMatch?.(match);
          }}
          onClose={() => setIsLibrarySearchOpen(false)}
        />
      )}

      {/* Viewport-Safe Popover Backdrop + Sheets (NEVER clips left or right on any phone!) */}
      {openPopover !== 'none' && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={() => setOpenPopover('none')}
          aria-hidden="true"
        />
      )}

      {/* 1. Language Switcher Popover (EN, T, HI, ES, FR, AR) */}
      {openPopover === 'lang' && (
        <div
          role="menu"
          aria-label="Choose language"
          className="fixed right-3 top-16 z-50 w-56 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-[#121620] lg:right-8 lg:top-20"
        >
          {SUPPORTED_LANGUAGES.map((opt) => {
            const active = opt.code === language;
            return (
              <button
                key={opt.code}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChangeLanguage(opt.code);
                  setOpenPopover('none');
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex h-6 w-7 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {opt.shortCode}
                  </span>
                  <span>{opt.nativeName}</span>
                </span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Responsive Notification Bar Sheet (fixed inset-x-3 on mobile so it NEVER cuts on the left!) */}
      {openPopover === 'notifications' && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-50 mx-auto max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620] lg:left-auto lg:right-8 lg:top-20 lg:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
              Notifications
            </p>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenPopover('none')}
                aria-label="Close notifications"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/80">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onMarkNotificationRead(item.id);
                  if (item.targetTab) onSelectTab(item.targetTab);
                  setOpenPopover('none');
                }}
                className={`block w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${
                  item.unread ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-950 dark:text-white">{item.title}</p>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {item.timeLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.body}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Read Tab 3-Dot More Menu (Related Content, Font Settings, Select Audio) */}
      {openPopover === 'readMore' && (
        <div
          role="menu"
          aria-label="Read options"
          className="fixed right-3 top-16 z-50 w-60 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-[#121620] lg:right-8 lg:top-20"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onTriggerReadMenuAction('related');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Related Content</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onTriggerReadMenuAction('font');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Type className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Font Settings</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onTriggerReadMenuAction('audio');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Select Audio</span>
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onTriggerReadMenuAction('glossary');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Legal Glossary</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onTriggerReadMenuAction('export');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Print / Export PDF</span>
          </button>
        </div>
      )}

      {/* 4. Profile Tab More Menu (Login/Logout, Account, General, Language, Read Settings, Colors) */}
      {openPopover === 'profileMore' && (
        <div
          role="menu"
          aria-label="Profile more menu"
          className="fixed right-3 top-16 z-50 w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-[#121620] lg:right-8 lg:top-20"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              if (user) {
                void onSignOut();
              } else {
                onOpenAuthModal();
              }
            }}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-900 transition hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              {user ? (
                <LogOut className="h-4 w-4 text-rose-500" />
              ) : (
                <LogIn className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <span>{user ? 'Logout' : 'Login'}</span>
            </span>
            <span className="max-w-[96px] truncate font-mono text-[10px] text-slate-400">
              {user ? (user.displayName ?? 'Signed in').split(' ')[0] : 'Google'}
            </span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenSettings('account');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <UserCog className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Account Settings</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenSettings('general');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Settings2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>General Settings</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenSettings('language');
            }}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Language</span>
            </span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {activeLangMeta.shortCode}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenSettings('read');
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Read Settings</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenSupportModal();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LifeBuoy className="h-4 w-4 text-amber-500" />
            <span>Technical Support</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover('none');
              onOpenAdminDashboard();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/15 cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Backend Admin CMS</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <div className="rounded-xl bg-slate-50 p-2 dark:bg-[#0D111A]">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenPopover('none');
                onOpenSettings('colors');
              }}
              className="flex w-full items-center justify-between px-1 pb-2 text-left text-[11px] font-bold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-amber-500" />
                <span>Colors</span>
              </span>
              <span className="font-mono text-[10px] uppercase text-blue-600 dark:text-blue-400">
                {appDarkMode ? 'Dark' : 'Light'}
              </span>
            </button>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  if (appDarkMode) onToggleDarkMode();
                }}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  !appDarkMode
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                Light
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!appDarkMode) onToggleDarkMode();
                }}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  appDarkMode
                    ? 'bg-[#2563EB] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Stage */}
      <main
        className={`mx-auto w-full max-w-6xl px-3.5 pt-4 sm:px-5 lg:pt-6 ${
          activeTab === 'read'
            ? 'pb-40 lg:pb-32'
            : hasActiveAudio
              ? 'pb-44 lg:pb-32'
              : 'pb-24 lg:pb-16'
        }`}
      >
        {children}
      </main>

      {/* Mobile Floating Glass Bottom Pill-Dock (60px height — auto-hides smoothly on scroll) */}
      <nav
        aria-label="Mobile navigation"
        data-chrome-hidden={isChromeHidden ? 'true' : 'false'}
        className={`fixed inset-x-3 bottom-2.5 z-30 transition-all duration-300 ease-out will-change-transform lg:hidden ${
          isChromeHidden
            ? 'pointer-events-none translate-y-[150%] opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="mx-auto grid h-[60px] max-w-md grid-cols-5 items-center rounded-[22px] border border-slate-200/80 bg-white/94 px-1.5 shadow-[0_12px_36px_rgba(12,16,24,0.16)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#121620]/96 dark:shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
