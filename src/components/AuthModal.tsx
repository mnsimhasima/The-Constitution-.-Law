import type { User } from 'firebase/auth';
import { Cloud, LogOut, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { CloudSyncState } from '../hooks/useLibraryStorage';

interface AuthModalProps {
  isOpen: boolean;
  user: User | null;
  authBusy: boolean;
  authError: string | null;
  cloudSyncState: CloudSyncState;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onClearError: () => void;
  onClose: () => void;
}

export function AuthModal({
  isOpen,
  user,
  authBusy,
  authError,
  cloudSyncState,
  onSignInGoogle,
  onSignOut,
  onClearError,
  onClose,
}: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/70 p-4 backdrop-blur-md">
      <div
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Top visual accent strip */}
        <div className="relative bg-gradient-to-br from-[#0E172A] via-[#172554] to-[#2563EB] px-6 py-6 text-white">
          <button
            type="button"
            onClick={() => {
              onClearError();
              onClose();
            }}
            aria-label="Close account dialog"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200">
            Civic Account & Cloud Vault
          </p>
          <h2 id="auth-modal-title" className="mt-1 font-display text-2xl font-bold tracking-tight">
            {user ? 'Your Study Account' : 'Sign in to Sync Everything'}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-blue-100/90">
            {user
              ? 'Your Telugu & English notes, highlights, bookmarks, and custom law books sync across devices.'
              : 'Save highlights, study notes, audio streaks, and custom books securely with Google Sign-In.'}
          </p>
        </div>

        <div className="space-y-5 p-6">
          {authError && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200"
            >
              {authError}
            </div>
          )}

          {user ? (
            <>
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0D111A]">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? 'User avatar'}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-2xl object-cover ring-2 ring-blue-500/30"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 font-display text-xl font-bold text-white">
                    {(user.displayName ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
                    {user.displayName ?? 'Legal Scholar'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <Cloud className="h-3.5 w-3.5" />
                    {cloudSyncState === 'synced'
                      ? 'Cloud vault synced'
                      : cloudSyncState === 'syncing'
                        ? 'Syncing library…'
                        : 'Private account active'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer"
                >
                  Continue Reading
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void onSignOut()}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-[#0D111A]">
                <div className="flex items-start gap-3">
                  <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Cross-device study vault
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Notes, color highlights, bookmarks, and custom law books stay backed up in Supabase PostgreSQL.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Telugu + 5 language preferences saved
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Pick up Dr. Ambedkar’s biography or any Constitution right where you paused.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Private by default
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Only your verified account can read or edit your saved legal notes and custom books.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={authBusy}
                onClick={() => void onSignInGoogle()}
                className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-[#2563EB] px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#1D4ED8] disabled:opacity-60 cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.69 4.34-5.27 4.34-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.1 14.69 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.5s4.01 9.3 8.97 9.3c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.31-.17-1.93z"
                  />
                </svg>
                {authBusy ? 'Connecting to Google…' : 'Continue with Google'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Continue as Guest (Local Device Only)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
