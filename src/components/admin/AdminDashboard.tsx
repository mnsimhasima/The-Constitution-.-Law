import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileAudio,
  FileCheck2,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Menu,
  MessageSquareWarning,
  Scale,
  Settings,
  Shield,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StaffActor, useBackendStore } from '../../hooks/useBackendStore';
import type { AdminSectionId, StaffRole } from '../../types/backend';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  canAccessSection,
  ROLE_LABELS,
} from '../../utils/rbacLogic';
import { AdminBulkImportPanel } from './AdminBulkImportPanel';
import { AdminContentPanel } from './AdminContentPanel';
import { AdminGovernancePanel } from './AdminGovernancePanel';
import { AdminOverviewPanel } from './AdminOverviewPanel';
import { AdminReviewPanel } from './AdminReviewPanel';
import { AdminUsersSecurityPanel } from './AdminUsersSecurityPanel';
import { BooksAndStructuresPanel } from './BooksAndStructuresPanel';

type BackendStore = ReturnType<typeof useBackendStore>;

interface AdminDashboardProps {
  user: User | null;
  authBusy: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  store: BackendStore;
  onExitToMobileApp: () => void;
}

interface SidebarNavGroup {
  label: string;
  items: {
    id: AdminSectionId;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }[];
}

export function AdminDashboard({
  user,
  authBusy,
  onSignInGoogle,
  onSignOut,
  store,
  onExitToMobileApp,
}: AdminDashboardProps) {
  // Determine effective staff role:
  // If signed in as a staff user, use their real role; if owner/admin or previewing locally, allow role preview switching so the user can test Admin, Editor, Reviewer, and Security workflows immediately!
  const realRole = store.currentAccountRole;
  const canSwitchPreviewRole = !user || realRole === 'admin';
  const [previewRole, setPreviewRole] = useState<StaffRole>('admin');
  const activeRole: StaffRole = canSwitchPreviewRole
    ? previewRole
    : realRole !== 'user'
      ? realRole
      : 'editor';

  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If role switches to one that cannot access current section, gracefully return to overview
  useEffect(() => {
    if (!canAccessSection(activeRole, activeSection)) {
      setActiveSection('overview');
    }
  }, [activeRole, activeSection]);

  const actor: StaffActor = useMemo(
    () => ({
      uid: user?.uid ?? `preview-${activeRole}`,
      email:
        user?.email ??
        (activeRole === 'admin'
          ? BOOTSTRAPPED_ADMIN_EMAIL
          : `${activeRole}@constitutionlaw.org`),
      role: activeRole,
    }),
    [user?.uid, user?.email, activeRole]
  );

  const pendingReviewsCount = store.cmsBooks.filter((b) => b.status === 'pending_review').length;
  const openTicketsCount = store.supportTickets.filter((t) => t.status !== 'resolved').length;

  const navGroups: SidebarNavGroup[] = [
    {
      label: 'Dashboard',
      items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
    },
    {
      label: 'Content',
      items: [
        { id: 'books', label: 'Books & Structures', icon: BookOpen },
        { id: 'verses', label: 'Verses & Meaning', icon: FileText },
        { id: 'audio', label: 'Audio Library', icon: FileAudio },
        { id: 'bulk-import', label: 'Bulk Imports', icon: Upload },
        {
          id: 'review-queue',
          label: 'Review & Publish',
          icon: CheckCircle2,
          badge: pendingReviewsCount,
        },
      ],
    },
    {
      label: 'Users & Operations',
      items: [
        { id: 'users-roles', label: 'Users & Roles', icon: Users },
        {
          id: 'security-support',
          label: 'Security & Support',
          icon: LifeBuoy,
          badge: openTicketsCount,
        },
        { id: 'community-mod', label: 'Community Moderation', icon: MessageSquareWarning },
      ],
    },
    {
      label: 'Governance',
      items: [
        { id: 'edit-log', label: 'Edit Log', icon: History },
        { id: 'sources-rights', label: 'Sources & Rights', icon: FileCheck2 },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const activeSectionLabel =
    navGroups.flatMap((g) => g.items).find((i) => i.id === activeSection)?.label ?? 'Overview';

  // If a non-staff logged-in mobile reader visits /admin, show clear Access Restricted gate
  const isUnauthorizedSignedInReader = Boolean(user && realRole === 'user');

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-white">
      {/* Brand Lockup */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F172A] text-white">
            <Scale className="h-4 w-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold text-slate-950">
              Constitution &amp; Law
            </p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-600">
              Backend CMS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close sidebar"
          className="text-slate-500 hover:text-slate-900 lg:hidden cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Grouped RBAC-Filtered Navigation */}
      <nav aria-label="Backend dashboard navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => canAccessSection(activeRole, item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {group.label}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex h-10 w-full items-center justify-between rounded-lg px-3 text-xs font-semibold transition cursor-pointer ${
                        active
                          ? 'bg-blue-50 text-[#2563EB]'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom Return to Mobile App CTA */}
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={onExitToMobileApp}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Mobile App
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC] text-[#0F172A]">
      {/* Fixed 260px Desktop Left Sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 lg:block">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-[260px] max-w-[82vw] border-r border-slate-200 shadow-2xl">
            {renderSidebarContent()}
          </div>
          <div
            className="flex-1 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Main Fluid Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 1-Row Sticky Top Breadcrumb & RBAC Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="hidden font-medium text-slate-400 sm:inline">Backend CMS</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-display text-sm font-bold text-slate-950">
                {activeSectionLabel}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* Role Perspective Switcher (for Owner Admin or local RBAC inspection) */}
            {canSwitchPreviewRole && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                <Shield className="h-3.5 w-3.5 text-blue-600" />
                <label htmlFor="admin-role-switcher" className="hidden text-[11px] font-semibold text-slate-500 sm:inline">
                  Role:
                </label>
                <select
                  id="admin-role-switcher"
                  value={activeRole}
                  onChange={(e) => setPreviewRole(e.target.value as StaffRole)}
                  className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer"
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Content Editor</option>
                  <option value="reviewer">Content Reviewer</option>
                  <option value="security">Security &amp; Support</option>
                </select>
              </div>
            )}

            {/* Google Auth Button */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[160px] truncate font-mono text-[11px] text-slate-600 md:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void onSignInGoogle()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0F172A] px-3.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Staff Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Content Canvas */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-7">
          {isUnauthorizedSignedInReader ? (
            <div className="mx-auto mt-12 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center">
              <Shield className="mx-auto h-10 w-10 text-amber-500" />
              <h1 className="mt-3 font-display text-xl font-bold text-slate-950">
                Staff Role Required
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                You are signed in as <strong>{user?.email}</strong> ({ROLE_LABELS[realRole]}). Ask an Admin to grant you Editor, Reviewer, Security, or Admin access in Users &amp; Roles.
              </p>
              <button
                type="button"
                onClick={onExitToMobileApp}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Return to Mobile App
              </button>
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <AdminOverviewPanel
                  activeRole={activeRole}
                  cmsBooks={store.cmsBooks}
                  audioTracks={store.audioTracks}
                  staffRoles={store.staffRoles}
                  userDirectory={store.userDirectory}
                  supportTickets={store.supportTickets}
                  communityPosts={store.communityPosts}
                  auditLogs={store.auditLogs}
                  onNavigate={setActiveSection}
                />
              )}

              {activeSection === 'books' && (
                <BooksAndStructuresPanel
                  activeRole={activeRole}
                  actor={actor}
                  isFirebaseSignedIn={Boolean(user)}
                  contentAudioMetadata={store.contentAudioMetadata}
                  onUpsertContentAudio={store.upsertContentAudioMetadata}
                />
              )}

              {(activeSection === 'verses' || activeSection === 'audio') && (
                <AdminContentPanel
                  mode={activeSection}
                  activeRole={activeRole}
                  actor={actor}
                  isFirebaseSignedIn={Boolean(user)}
                  cmsBooks={store.cmsBooks}
                  audioTracks={store.audioTracks}
                  contentAudioMetadata={store.contentAudioMetadata}
                  onUpsertBook={store.upsertCmsBook}
                  onReviewBook={store.reviewCmsBook}
                  onDeleteBook={store.deleteCmsBook}
                  onAddChapter={store.addChapterToBook}
                  onUpsertClause={store.upsertClauseInBook}
                  onDeleteClause={store.deleteClauseInBook}
                  onUpsertContentAudio={store.upsertContentAudioMetadata}
                  onDeleteContentAudio={store.deleteContentAudioMetadata}
                  onUpdateContentAudioStatus={store.updateContentAudioStatus}
                  onUpsertAudioTrack={store.upsertAudioTrack}
                  onUpdateAudioStatus={store.updateAudioTrackStatus}
                />
              )}

              {activeSection === 'bulk-import' && (
                <AdminBulkImportPanel
                  activeRole={activeRole}
                  actor={actor}
                  settings={store.systemSettings}
                  onImportBooks={store.bulkImportBooks}
                />
              )}

              {activeSection === 'review-queue' && (
                <AdminReviewPanel
                  activeRole={activeRole}
                  actor={actor}
                  cmsBooks={store.cmsBooks}
                  onReviewBook={store.reviewCmsBook}
                />
              )}

              {(activeSection === 'users-roles' ||
                activeSection === 'security-support' ||
                activeSection === 'community-mod') && (
                <AdminUsersSecurityPanel
                  mode={activeSection}
                  activeRole={activeRole}
                  actor={actor}
                  userDirectory={store.userDirectory}
                  supportTickets={store.supportTickets}
                  communityPosts={store.communityPosts}
                  onAssignRole={store.assignUserRole}
                  onUpdateUserStatus={store.updateUserAccountStatus}
                  onUpdateTicket={store.updateSupportTicket}
                  onModeratePost={store.moderateCommunityPost}
                />
              )}

              {(activeSection === 'edit-log' ||
                activeSection === 'sources-rights' ||
                activeSection === 'settings') && (
                <AdminGovernancePanel
                  mode={activeSection}
                  activeRole={activeRole}
                  actor={actor}
                  cmsBooks={store.cmsBooks}
                  auditLogs={store.auditLogs}
                  sourcesRights={store.sourcesRights}
                  systemSettings={store.systemSettings}
                  onUpsertSourceRight={store.upsertSourceRight}
                  onUpdateSettings={store.updateSystemSettings}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
