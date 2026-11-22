import {
  CheckCircle2,
  Flag,
  LifeBuoy,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  AccountRole,
  AccountStatus,
  ModerationCommunityPost,
  StaffRole,
  SupportTicket,
  TicketPriority,
  TicketStatus,
  UserDirectoryRecord,
} from '../../types/backend';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  canManageSupportTickets,
  canManageUsersAndRoles,
  canModerateCommunity,
  canMonitorUsersAndSecurity,
  ROLE_LABELS,
} from '../../utils/rbacLogic';

interface AdminUsersSecurityPanelProps {
  mode: 'users-roles' | 'security-support' | 'community-mod';
  activeRole: StaffRole;
  actor: StaffActor;
  userDirectory: UserDirectoryRecord[];
  supportTickets: SupportTicket[];
  communityPosts: ModerationCommunityPost[];
  onAssignRole: (
    uid: string,
    email: string,
    displayName: string,
    role: AccountRole,
    actor: StaffActor
  ) => void;
  onUpdateUserStatus: (uid: string, status: AccountStatus, actor: StaffActor) => void;
  onUpdateTicket: (
    ticketId: string,
    updates: { status?: TicketStatus; priority?: TicketPriority; resolutionNote?: string },
    actor: StaffActor
  ) => void;
  onModeratePost: (postId: string, status: 'approved' | 'removed', actor: StaffActor) => void;
}

export function AdminUsersSecurityPanel({
  mode,
  activeRole,
  actor,
  userDirectory,
  supportTickets,
  communityPosts,
  onAssignRole,
  onUpdateUserStatus,
  onUpdateTicket,
  onModeratePost,
}: AdminUsersSecurityPanelProps) {
  const canManageRoles = canManageUsersAndRoles(activeRole);
  const canMonitor = canMonitorUsersAndSecurity(activeRole);
  const canResolveTickets = canManageSupportTickets(activeRole);
  const canModerate = canModerateCommunity(activeRole);

  // Add staff form
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('editor');
  const [banner, setBanner] = useState<string | null>(null);

  // Selected support ticket
  const [selectedTicketId, setSelectedTicketId] = useState<string>(supportTickets[0]?.id ?? '');
  const selectedTicket =
    supportTickets.find((t) => t.id === selectedTicketId) ?? supportTickets[0];
  const [resolutionDraft, setResolutionDraft] = useState('');

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRoles || !newStaffEmail.trim()) return;
    const uid = `staff-${Date.now().toString(36)}`;
    onAssignRole(
      uid,
      newStaffEmail.trim().toLowerCase(),
      newStaffName.trim() || newStaffEmail.split('@')[0],
      newStaffRole,
      actor
    );
    setBanner(`Assigned ${ROLE_LABELS[newStaffRole]} access to ${newStaffEmail.trim()}.`);
    setNewStaffEmail('');
    setNewStaffName('');
  };

  // =========================================================================
  // VIEW 1: USERS & ROLES
  // =========================================================================
  if (mode === 'users-roles') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-950">Users &amp; Role-Based Access</h1>
          <p className="text-xs text-slate-500">
            Monitor registered Google accounts and manage Admin, Content Editor, Content Reviewer, and Security staff permissions.
          </p>
        </div>

        {banner && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {banner}
          </div>
        )}

        {canManageRoles && (
          <form
            onSubmit={handleAddStaff}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Google Email *</label>
              <input
                required
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                placeholder="editor.name@gmail.com"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Display Name</label>
              <input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="Adv. Name"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Assign Role</label>
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as StaffRole)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-600"
              >
                <option value="editor">Content Editor</option>
                <option value="reviewer">Content Reviewer</option>
                <option value="security">Security &amp; Support</option>
                <option value="admin">Admin (Full Control)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                Grant Role
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th className="px-5 py-3">User (Google Account)</th>
                <th className="px-3 py-3">Provider</th>
                <th className="px-3 py-3">Last Login</th>
                <th className="px-3 py-3">Account Status</th>
                <th className="px-5 py-3 text-right">Assigned Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userDirectory.map((entry) => {
                const isBootstrap = entry.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                return (
                  <tr key={entry.uid} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-950">{entry.displayName}</p>
                      <p className="font-mono text-[11px] text-slate-500">{entry.email}</p>
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">{entry.provider}</td>
                    <td className="px-3 py-3.5 font-mono text-[11px] tabular-nums text-slate-600">
                      {entry.lastLoginAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          entry.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : entry.status === 'flagged'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {canManageRoles && !isBootstrap ? (
                        <select
                          aria-label={`Change role for ${entry.email}`}
                          value={entry.role}
                          onChange={(e) => {
                            onAssignRole(
                              entry.uid,
                              entry.email,
                              entry.displayName,
                              e.target.value as AccountRole,
                              actor
                            );
                            setBanner(`Updated ${entry.email} to ${e.target.value}.`);
                          }}
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                        >
                          <option value="user">Mobile Reader</option>
                          <option value="editor">Content Editor</option>
                          <option value="reviewer">Content Reviewer</option>
                          <option value="security">Security &amp; Support</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {ROLE_LABELS[entry.role]} {isBootstrap ? '(Owner)' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: SECURITY MONITOR & USER SUPPORT TICKETS
  // =========================================================================
  if (mode === 'security-support') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-950">
            Security Monitor &amp; User Technical Support Desk
          </h1>
          <p className="text-xs text-slate-500">
            Monitor Google account logins, flag/suspend suspicious users, and resolve technical tickets raised from the mobile app.
          </p>
        </div>

        {/* Support Ticket Resolution Workspace */}
        <section className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <LifeBuoy className="h-3.5 w-3.5 text-amber-600" />
              User Technical Tickets ({supportTickets.length})
            </h2>

            {supportTickets.map((ticket) => {
              const isSelected = selectedTicket?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => {
                    setSelectedTicketId(ticket.id);
                    setResolutionDraft(ticket.resolutionNote);
                  }}
                  className={`block w-full rounded-xl border p-4 text-left transition cursor-pointer ${
                    isSelected
                      ? 'border-[#2563EB] bg-blue-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase text-slate-500">
                      {ticket.category} · {ticket.priority}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        ticket.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : ticket.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 font-display text-sm font-bold text-slate-950">{ticket.subject}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {ticket.userName} ({ticket.userEmail})
                  </p>
                </button>
              );
            })}
          </div>

          {selectedTicket && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <div className="border-b border-slate-200 pb-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-blue-600">
                  Ticket #{selectedTicket.id} · {selectedTicket.category}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                  {selectedTicket.subject}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Raised by {selectedTicket.userName} ({selectedTicket.userEmail}) ·{' '}
                  {selectedTicket.createdAt.slice(0, 16).replace('T', ' ')}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-800">
                {selectedTicket.description}
              </div>

              {selectedTicket.resolutionNote && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                  <p className="font-semibold">Latest Resolution Reply:</p>
                  <p className="mt-1">{selectedTicket.resolutionNote}</p>
                </div>
              )}

              {canResolveTickets && (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Support Reply / Resolution Note (visible to user in Mobile App)
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionDraft}
                    onChange={(e) => setResolutionDraft(e.target.value)}
                    placeholder="Write clear troubleshooting steps or resolution confirmation…"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-600"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTicket(
                          selectedTicket.id,
                          { status: 'in_progress', resolutionNote: resolutionDraft.trim() },
                          actor
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                    >
                      Mark In Progress
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTicket(
                          selectedTicket.id,
                          {
                            status: 'resolved',
                            resolutionNote:
                              resolutionDraft.trim() ||
                              'Issue investigated and resolved by Security & Support team.',
                          },
                          actor
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Send Reply &amp; Resolve Ticket
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Google Account Login Monitor */}
        {canMonitor && (
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-bold text-slate-950">
                Google Account Security Monitor
              </h2>
              <p className="text-xs text-slate-500">
                Track active Google sessions and flag or suspend abusive accounts.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-5 py-3">Account</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Last Google Sign-In</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Security Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userDirectory.map((u) => {
                    const isOwner = u.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-950">{u.displayName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{u.email}</p>
                        </td>
                        <td className="px-3 py-3 capitalize text-slate-700">{u.role}</td>
                        <td className="px-3 py-3 font-mono text-[11px] tabular-nums text-slate-600">
                          {u.lastLoginAt.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              u.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : u.status === 'flagged'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {!isOwner && (
                            <div className="inline-flex items-center gap-1.5">
                              {u.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateUserStatus(u.uid, 'active', actor)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 cursor-pointer"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Restore
                                </button>
                              )}
                              {u.status !== 'flagged' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateUserStatus(u.uid, 'flagged', actor)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 cursor-pointer"
                                >
                                  <Flag className="h-3.5 w-3.5" />
                                  Flag
                                </button>
                              )}
                              {u.status !== 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateUserStatus(u.uid, 'suspended', actor)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 cursor-pointer"
                                >
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                  Suspend
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: COMMUNITY MODERATION
  // =========================================================================
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-950">Community Moderation</h1>
        <p className="text-xs text-slate-500">
          All mobile Studio Community posts pass automated text-only, profanity, and legal-relevance AI filtering before publishing. Remove or restore posts here.
        </p>
      </div>

      <div className="space-y-3">
        {communityPosts.map((post) => (
          <article
            key={post.id}
            className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-950">{post.authorName}</span>
                <span className="font-mono text-xs text-slate-400">{post.authorHandle}</span>
                <span className="text-xs text-slate-500">· {post.tag}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    post.moderationStatus === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {post.moderationStatus}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{post.content}</p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">
                Likes: {post.likesCount} · Posted {post.createdAt.slice(0, 16).replace('T', ' ')}
              </p>
            </div>

            {canModerate && (
              <div className="shrink-0">
                {post.moderationStatus === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => onModeratePost(post.id, 'removed', actor)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    <MessageSquareWarning className="h-4 w-4" />
                    Remove Post
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onModeratePost(post.id, 'approved', actor)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Restore Post
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
