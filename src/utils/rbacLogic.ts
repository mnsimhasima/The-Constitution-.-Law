import type { AccountRole, AdminSectionId, StaffRole, StaffRoleRecord } from '../types/backend';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'mnsimhasima@gmail.com';

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: 'Admin',
  editor: 'Content Editor',
  reviewer: 'Content Reviewer',
  security: 'Security & Support',
  user: 'Mobile Reader',
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: 'Full multi-role control: upload, edit, approve/publish books, manage user roles, security, support tickets, and system settings.',
  editor: 'Upload and edit books, chapters, verses & meanings, audio tracks, bulk JSON/CSV/Excel imports, and submit for review.',
  reviewer: 'Inspect all submitted & published books, listen to every audio track, approve & publish, or request editorial revisions.',
  security: 'Monitor logged-in Google accounts, flag/suspend suspicious access, moderate community posts, and resolve user technical support tickets.',
};

const ROLE_SECTION_ACCESS: Record<StaffRole, AdminSectionId[]> = {
  admin: [
    'overview',
    'books',
    'verses',
    'audio',
    'bulk-import',
    'review-queue',
    'users-roles',
    'security-support',
    'community-mod',
    'edit-log',
    'sources-rights',
    'settings',
  ],
  editor: [
    'overview',
    'books',
    'verses',
    'audio',
    'bulk-import',
    'sources-rights',
    'edit-log',
  ],
  reviewer: [
    'overview',
    'review-queue',
    'books',
    'verses',
    'audio',
    'sources-rights',
    'edit-log',
  ],
  security: [
    'overview',
    'security-support',
    'community-mod',
    'users-roles',
    'edit-log',
  ],
};

export function resolveUserRole(
  email: string | null | undefined,
  uid: string | null | undefined,
  staffRoles: StaffRoleRecord[]
): AccountRole {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  if (normalizedEmail && normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
    return 'admin';
  }
  const match = staffRoles.find(
    (entry) =>
      entry.active &&
      ((uid && entry.uid === uid) ||
        (normalizedEmail && entry.email.trim().toLowerCase() === normalizedEmail))
  );
  return match ? match.role : 'user';
}

export function getAccessibleSections(role: StaffRole): AdminSectionId[] {
  return ROLE_SECTION_ACCESS[role];
}

export function canAccessSection(role: StaffRole, section: AdminSectionId): boolean {
  return ROLE_SECTION_ACCESS[role].includes(section);
}

export function canCreateOrEditBook(role: StaffRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canRunBulkImport(role: StaffRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canPublishOrReviewBook(role: StaffRole): boolean {
  return role === 'admin' || role === 'reviewer';
}

export function canUnpublishOrDeleteBook(role: StaffRole): boolean {
  return role === 'admin';
}

export function canManageUsersAndRoles(role: StaffRole): boolean {
  return role === 'admin';
}

export function canMonitorUsersAndSecurity(role: StaffRole): boolean {
  return role === 'admin' || role === 'security';
}

export function canManageSupportTickets(role: StaffRole): boolean {
  return role === 'admin' || role === 'security';
}

export function canModerateCommunity(role: StaffRole): boolean {
  return role === 'admin' || role === 'security';
}

export function canManageSettings(role: StaffRole): boolean {
  return role === 'admin';
}

export function canEditSourcesRights(role: StaffRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canVerifySourcesRights(role: StaffRole): boolean {
  return role === 'admin' || role === 'reviewer';
}
