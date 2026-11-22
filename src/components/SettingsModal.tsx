import type { User } from 'firebase/auth';
import {
  BookOpen,
  Cloud,
  Globe,
  HardDrive,
  LogIn,
  LogOut,
  Moon,
  Palette,
  Settings2,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../data/booksData';
import type { CloudSyncState } from '../hooks/useLibraryStorage';
import type {
  AudioMode,
  GeneralSettings,
  LanguageCode,
  ReaderFontFace,
  ReaderFontSize,
  ReaderPreferences,
  ReaderTheme,
  SettingsSection,
} from '../types/library';
import { formatBytes } from '../utils/offlineAudioCache';

interface SettingsModalProps {
  isOpen: boolean;
  activeSection: SettingsSection;
  onChangeSection: (section: SettingsSection) => void;
  user: User | null;
  cloudSyncState: CloudSyncState;
  preferences: ReaderPreferences;
  generalSettings: GeneralSettings;
  cachedChaptersCount?: number;
  cachedAudioTotalBytes?: number;
  onClearOfflineAudio?: () => Promise<void>;
  onUpdatePreferences: (patch: Partial<ReaderPreferences>) => void;
  onUpdateGeneralSettings: (patch: Partial<GeneralSettings>) => void;
  onOpenAuthModal: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

const SECTIONS: { id: SettingsSection; label: string; icon: typeof UserCog }[] = [
  { id: 'account', label: 'Account Settings', icon: UserCog },
  { id: 'general', label: 'General Settings', icon: Settings2 },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'read', label: 'Read Settings', icon: BookOpen },
  { id: 'colors', label: 'Colors & Theme', icon: Palette },
];

export function SettingsModal({
  isOpen,
  activeSection,
  onChangeSection,
  user,
  cloudSyncState,
  preferences,
  generalSettings,
  cachedChaptersCount = 0,
  cachedAudioTotalBytes = 0,
  onClearOfflineAudio,
  onUpdatePreferences,
  onUpdateGeneralSettings,
  onOpenAuthModal,
  onSignOut,
  onClose,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/70 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Settings & Studio Controls
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Account, language, reading experience, and Light / Dark theme colors
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200/80 px-5 py-3 dark:border-slate-800">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = sec.id === activeSection;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onChangeSection(sec.id)}
                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* 1. Account Settings */}
          {activeSection === 'account' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0D111A]">
                <div className="flex items-center gap-3.5">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName ?? 'User'}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 font-display text-lg font-bold text-white">
                      {user ? (user.displayName ?? 'U').slice(0, 1).toUpperCase() : 'G'}
                    </div>
                  )}
                  <div>
                    <p className="font-display text-base font-bold text-slate-950 dark:text-white">
                      {user ? user.displayName ?? 'Legal Scholar' : 'Guest Reader'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user ? user.email : 'Local device storage · Sign in to sync across devices'}
                    </p>
                  </div>
                </div>

                {user ? (
                  <button
                    type="button"
                    onClick={() => void onSignOut()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuthModal();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#1D4ED8] cursor-pointer"
                  >
                    <LogIn className="h-4 w-4" />
                    Login with Google
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                <p className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Cloud Vault Status
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {user
                    ? `Connected to Firestore (${cloudSyncState}). Your highlights, notes, bookmarks, and custom books sync automatically.`
                    : 'Currently running offline-first on this browser. Sign in with Google to back up your study vault.'}
                </p>
              </div>
            </div>
          )}

          {/* 2. General Settings */}
          {activeSection === 'general' && (
            <div className="space-y-3">
              {(
                [
                  {
                    key: 'dailyReminders',
                    title: 'Daily Study Reminders',
                    desc: 'Receive a daily prompt to keep your reading & audio streak active.',
                  },
                  {
                    key: 'audioAutoAdvance',
                    title: 'Auto-Advance Audio Clauses',
                    desc: 'Automatically continue to the next article or commentary segment.',
                  },
                  {
                    key: 'friendActivityAlerts',
                    title: 'Friend & Followed Book Alerts',
                    desc: 'Show notifications when followed books or study friends share updates.',
                  },
                  {
                    key: 'offlineAudioCache',
                    title: 'Auto-Cache Played Audio in IndexedDB',
                    desc: 'Automatically store narrated chapter audio clips locally for offline playback.',
                  },
                ] as const
              ).map((item) => {
                const enabled = generalSettings[item.key];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A]"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-950 dark:text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => onUpdateGeneralSettings({ [item.key]: !enabled })}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition cursor-pointer ${
                        enabled ? 'bg-[#2563EB]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}

              {/* Offline Audio IndexedDB Storage Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#0D111A]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-950 dark:text-white">
                      Offline Audio Storage (IndexedDB)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {cachedChaptersCount} saved chapter{cachedChaptersCount === 1 ? '' : 's'} ·{' '}
                      {formatBytes(cachedAudioTotalBytes)} cached on device
                    </p>
                  </div>
                </div>
                {cachedAudioTotalBytes > 0 && onClearOfflineAudio && (
                  <button
                    type="button"
                    onClick={() => void onClearOfflineAudio()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear Cache</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 3. Language */}
          {activeSection === 'language' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose your primary reading and audio narration language. The header Globe icon displays its compact code (e.g., EN for English, T for Telugu).
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SUPPORTED_LANGUAGES.map((opt) => {
                  const active = preferences.language === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => onUpdatePreferences({ language: opt.code as LanguageCode })}
                      className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-blue-50/80 dark:border-blue-500 dark:bg-blue-500/15'
                          : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-[#0D111A]'
                      }`}
                    >
                      <div>
                        <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                          {opt.nativeName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {opt.label} · {opt.speechLang}
                        </p>
                      </div>
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl font-mono text-xs font-bold ${
                          active
                            ? 'bg-[#2563EB] text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {opt.shortCode}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Read Settings */}
          {activeSection === 'read' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Font Size</p>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {(['sm', 'md', 'lg', 'xl'] as ReaderFontSize[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdatePreferences({ fontSize: sz })}
                        className={`h-10 rounded-xl text-xs font-bold uppercase cursor-pointer ${
                          preferences.fontSize === sz
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Typeface</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(['sans', 'display'] as ReaderFontFace[]).map((face) => (
                      <button
                        key={face}
                        type="button"
                        onClick={() => onUpdatePreferences({ fontFace: face })}
                        className={`h-10 rounded-xl text-xs font-bold cursor-pointer ${
                          preferences.fontFace === face
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                        }`}
                      >
                        {face === 'sans' ? 'Modern Sans' : 'Editorial'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Audio Mode</p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(['text', 'explanation', 'both'] as AudioMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onUpdatePreferences({ audioMode: m })}
                        className={`h-10 rounded-xl text-xs font-bold capitalize cursor-pointer ${
                          preferences.audioMode === m
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Reading Surface</p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(['light', 'warm', 'dark'] as ReaderTheme[]).map((rt) => (
                      <button
                        key={rt}
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({
                            readerTheme: rt,
                            appDarkMode: rt === 'dark',
                          })
                        }
                        className={`h-10 rounded-xl text-xs font-bold capitalize cursor-pointer ${
                          preferences.readerTheme === rt
                            ? 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                        }`}
                      >
                        {rt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({ showInlineExplanations: !preferences.showInlineExplanations })
                  }
                  className={`rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                    preferences.showInlineExplanations
                      ? 'border-amber-400 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/15'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-950 dark:text-white">
                    Inline Explanations: {preferences.showInlineExplanations ? 'On' : 'Off'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Show plain-language commentary beneath each legal section
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({ showParallelLanguage: !preferences.showParallelLanguage })
                  }
                  className={`rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                    preferences.showParallelLanguage
                      ? 'border-blue-400 bg-blue-50/70 dark:border-blue-500/40 dark:bg-blue-500/15'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-950 dark:text-white">
                    Parallel Bilingual Mode: {preferences.showParallelLanguage ? 'On' : 'Off'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Compare two languages side-by-side (e.g., EN & T)
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* 5. Colors (Light Mode / Dark Mode) */}
          {activeSection === 'colors' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Switch the entire app between crisp Alabaster Light Mode and Obsidian Dark Mode.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({
                      appDarkMode: false,
                      readerTheme: preferences.readerTheme === 'dark' ? 'light' : preferences.readerTheme,
                    })
                  }
                  className={`rounded-[24px] border-2 p-5 text-left transition cursor-pointer ${
                    !preferences.appDarkMode
                      ? 'border-[#2563EB] bg-[#F4F6FA] shadow-md'
                      : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-[#161B26]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                      <Sun className="h-5 w-5" />
                    </span>
                    {!preferences.appDarkMode && (
                      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#2563EB]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-display text-base font-bold text-slate-950 dark:text-white">
                    Light Mode
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Cool alabaster canvas, crisp white Bento surfaces, and electric cobalt accents.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({
                      appDarkMode: true,
                      readerTheme: 'dark',
                    })
                  }
                  className={`rounded-[24px] border-2 p-5 text-left transition cursor-pointer ${
                    preferences.appDarkMode
                      ? 'border-[#3B82F6] bg-[#0B101B] text-white shadow-md'
                      : 'border-slate-200 bg-[#0F131C] text-white hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
                      <Moon className="h-5 w-5" />
                    </span>
                    {preferences.appDarkMode && (
                      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-blue-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-display text-base font-bold text-white">Dark Mode</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Deep obsidian studio canvas designed for late-night reading and audio sessions.
                  </p>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
