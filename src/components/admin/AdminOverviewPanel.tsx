import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileAudio,
  LifeBuoy,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import type {
  AdminSectionId,
  AudioTrackRecord,
  AuditLogEntry,
  CmsBook,
  ModerationCommunityPost,
  StaffRole,
  StaffRoleRecord,
  SupportTicket,
  UserDirectoryRecord,
} from '../../types/backend';
import { canAccessSection, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/rbacLogic';

interface AdminOverviewPanelProps {
  activeRole: StaffRole;
  cmsBooks: CmsBook[];
  audioTracks: AudioTrackRecord[];
  staffRoles: StaffRoleRecord[];
  userDirectory: UserDirectoryRecord[];
  supportTickets: SupportTicket[];
  communityPosts: ModerationCommunityPost[];
  auditLogs: AuditLogEntry[];
  onNavigate: (section: AdminSectionId) => void;
}

export function AdminOverviewPanel({
  activeRole,
  cmsBooks,
  audioTracks,
  staffRoles,
  userDirectory,
  supportTickets,
  communityPosts,
  auditLogs,
  onNavigate,
}: AdminOverviewPanelProps) {
  const publishedBooks = cmsBooks.filter((b) => b.status === 'published');
  const pendingBooks = cmsBooks.filter((b) => b.status === 'pending_review');
  const openTickets = supportTickets.filter((t) => t.status !== 'resolved');
  const totalClauses = cmsBooks.reduce(
    (sum, book) => sum + book.chapters.reduce((cSum, ch) => cSum + ch.clauses.length, 0),
    0
  );

  const roleCounts = {
    admin: staffRoles.filter((s) => s.active && s.role === 'admin').length,
    editor: staffRoles.filter((s) => s.active && s.role === 'editor').length,
    reviewer: staffRoles.filter((s) => s.active && s.role === 'reviewer').length,
    security: staffRoles.filter((s) => s.active && s.role === 'security').length,
    readers: userDirectory.filter((u) => u.role === 'user').length,
  };

  return (
    <div className="space-y-6">
      {/* Role Scope Banner */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
            Active Role · {ROLE_LABELS[activeRole]}
          </p>
          <h1 className="mt-1 font-display text-xl font-bold text-slate-950">
            The Constitution &amp; Law — Backend Command Overview
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {ROLE_DESCRIPTIONS[activeRole]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAccessSection(activeRole, 'bulk-import') && (
            <button
              type="button"
              onClick={() => onNavigate('bulk-import')}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              Bulk Import Books
            </button>
          )}
          {canAccessSection(activeRole, 'review-queue') && (
            <button
              type="button"
              onClick={() => onNavigate('review-queue')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Review Queue ({pendingBooks.length})
            </button>
          )}
          {canAccessSection(activeRole, 'security-support') && (
            <button
              type="button"
              onClick={() => onNavigate('security-support')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
            >
              <LifeBuoy className="h-4 w-4 text-amber-600" />
              Open Tickets ({openTickets.length})
            </button>
          )}
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Published Books</span>
            <BookOpen className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-950">
            {publishedBooks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {totalClauses} indexed clauses · {pendingBooks.length} pending review
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Audio Tracks</span>
            <FileAudio className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-950">
            {audioTracks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {audioTracks.filter((a) => a.status === 'published').length} live in mobile audio player
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Google Accounts</span>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-950">
            {userDirectory.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {staffRoles.filter((s) => s.active).length} staff · {roleCounts.readers} mobile readers
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Support &amp; Community</span>
            <ShieldCheck className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-950">
            {openTickets.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Open tickets · {communityPosts.filter((p) => p.moderationStatus === 'approved').length} approved posts
          </p>
        </div>
      </section>

      {/* Two-Column Operations Grid: Published Content Table + Role Distribution & Edit Log */}
      <section className="grid gap-5 lg:grid-cols-12">
        {/* Published & Pending Books Snapshot */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-950">
                Publish Control &amp; Catalog Status
              </h2>
              <p className="text-xs text-slate-500">
                Live sync with the Mobile Reader Library
              </p>
            </div>
            {canAccessSection(activeRole, 'books') && (
              <button
                type="button"
                onClick={() => onNavigate('books')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Manage All
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  <th className="px-5 py-3">Book</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3 text-right">Chapters</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cmsBooks.slice(0, 6).map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-950">{book.shortTitle}</p>
                      <p className="truncate text-[11px] text-slate-500">{book.jurisdiction} · {book.year}</p>
                    </td>
                    <td className="px-3 py-3.5 capitalize text-slate-600">{book.category}</td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-700">
                      {book.chapters.length}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          book.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : book.status === 'pending_review'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : book.status === 'changes_requested'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {book.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Role Breakdown + Recent Edit Log */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-950">
                Users &amp; Role Distribution
              </h2>
              {canAccessSection(activeRole, 'users-roles') && (
                <button
                  type="button"
                  onClick={() => onNavigate('users-roles')}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Assign Roles
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2.5 text-xs">
              {[
                { label: 'Admin (Multi-role full control)', count: roleCounts.admin },
                { label: 'Content Editor (Upload & Bulk Import)', count: roleCounts.editor },
                { label: 'Content Reviewer (Read, Listen & Approve)', count: roleCounts.reviewer },
                { label: 'Security & Support Desk', count: roleCounts.security },
                { label: 'Registered Mobile Readers', count: roleCounts.readers },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-slate-600">{row.label}</span>
                  <span className="font-mono font-bold tabular-nums text-slate-950">{row.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-950">
                Recent Edit Log
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('edit-log')}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Full Audit Log
              </button>
            </div>
            <div className="mt-3.5 space-y-3">
              {auditLogs.slice(0, 4).map((entry) => (
                <div key={entry.id} className="border-l-2 border-blue-200 pl-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-900">
                      {entry.action}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {entry.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-600">{entry.summary}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {entry.actorEmail} ({entry.actorRole})
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
