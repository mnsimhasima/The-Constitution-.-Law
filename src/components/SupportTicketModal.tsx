import type { User } from 'firebase/auth';
import { CheckCircle2, LifeBuoy, LogIn, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { SupportTicket, TicketCategory, TicketPriority } from '../types/backend';

interface SupportTicketModalProps {
  isOpen: boolean;
  user: User | null;
  tickets: SupportTicket[];
  onSubmitTicket: (
    input: { category: TicketCategory; subject: string; description: string; priority: TicketPriority },
    author: { uid: string; email: string; displayName: string }
  ) => SupportTicket;
  onOpenAuthModal: () => void;
  onClose: () => void;
}

export function SupportTicketModal({
  isOpen,
  user,
  tickets,
  onSubmitTicket,
  onOpenAuthModal,
  onClose,
}: SupportTicketModalProps) {
  const [category, setCategory] = useState<TicketCategory>('audio');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const userTickets = user
    ? tickets.filter(
        (t) => t.userId === user.uid || t.userEmail.toLowerCase() === (user.email ?? '').toLowerCase()
      )
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || subject.trim().length < 4 || description.trim().length < 10) return;
    const created = onSubmitTicket(
      { category, subject: subject.trim(), description: description.trim(), priority },
      {
        uid: user.uid,
        email: user.email ?? 'reader@constitutionlaw.org',
        displayName: user.displayName ?? 'Civic Reader',
      }
    );
    setSubject('');
    setDescription('');
    setSubmittedMsg(
      `Ticket #${created.id} sent to our Security & Support team. You will see their reply right here.`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Technical Support"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[26px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#121620]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Technical Support Desk
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Report audio, sync, or app issues directly to our backend support team.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close support dialog"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submittedMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{submittedMsg}</span>
          </div>
        )}

        {!user ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-800 dark:bg-[#0D111A]">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Sign in with Google to Raise a Support Ticket
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Signing in connects your ticket to your account so our Security &amp; Support team can resolve it and reply directly to you.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAuthModal();
              }}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-xs font-bold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              Sign In with Google
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  Issue Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
                >
                  <option value="audio">Audio Playback</option>
                  <option value="auth">Google Login / Account</option>
                  <option value="sync">Notes &amp; Cloud Sync</option>
                  <option value="content">Book / Translation Issue</option>
                  <option value="bug">App Bug</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Subject *
              </label>
              <input
                required
                minLength={4}
                maxLength={160}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the technical issue"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Details *
              </label>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened, which book or language you were using, and your device…"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white shadow-md transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              <Send className="h-4 w-4" />
              Submit Support Ticket
            </button>
          </form>
        )}

        {/* User's Recent Support Tickets & Replies */}
        {user && userTickets.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Your Recent Tickets ({userTickets.length})
            </h3>
            <div className="mt-3 space-y-2.5">
              {userTickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-slate-800 dark:bg-[#0D111A]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-950 dark:text-white">{t.subject}</span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  {t.resolutionNote && (
                    <p className="mt-2 rounded-xl bg-white p-2.5 text-[11px] text-emerald-800 dark:bg-[#121620] dark:text-emerald-300">
                      <strong>Support Reply:</strong> {t.resolutionNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
