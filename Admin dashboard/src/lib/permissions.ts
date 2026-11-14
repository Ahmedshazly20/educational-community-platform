import type { StaffRole } from '../data/types';

export type Permission =
  | 'dashboard:view'
  | 'reference:read'
  | 'reference:write'
  | 'plans:write'
  | 'domains:write'
  | 'content:read'
  | 'content:write'
  | 'media:upload'
  | 'exams:read'
  | 'exams:write'
  | 'students:read'
  | 'students:manage'
  | 'students:location'
  | 'students:track'
  | 'students:reset_session'
  | 'subscriptions:read'
  | 'subscriptions:grant'
  | 'payments:read'
  | 'payments:review'
  | 'announcements:manage'
  | 'grading:export_import'
  | 'grading:read_batches'
  | 'grading:read_essay_grades'
  | 'grading:approve'
  | 'grading:adjust_essay'
  | 'results:read'
  | 'reports:read'
  | 'staff:manage'
  | 'audit:read'
  | 'settings:manage'
  | 'year_end:manage';

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlyArray<Permission>> = {
  admin: [
    'dashboard:view',
    'reference:read',
    'reference:write',
    'plans:write',
    'domains:write',
    'content:read',
    'content:write',
    'media:upload',
    'exams:read',
    'exams:write',
    'students:read',
    'students:manage',
    'students:location',
    'students:track',
    'students:reset_session',
    'subscriptions:read',
    'subscriptions:grant',
    'payments:read',
    'payments:review',
    'announcements:manage',
    'grading:export_import',
    'grading:read_batches',
    'grading:read_essay_grades',
    'grading:approve',
    'grading:adjust_essay',
    'results:read',
    'reports:read',
    'staff:manage',
    'audit:read',
    'settings:manage',
    'year_end:manage',
  ],
  content: [
    'dashboard:view',
    'reference:read',
    'content:read',
    'content:write',
    'media:upload',
    'reports:read',
  ],
  exams: [
    'dashboard:view',
    'reference:read',
    'media:upload',
    'exams:read',
    'exams:write',
    'grading:read_batches',
    'grading:read_essay_grades',
    'results:read',
    'reports:read',
  ],
  grader: [
    'dashboard:view',
    'reference:read',
    'grading:export_import',
    'grading:read_batches',
  ],
  payments_reviewer: [
    'dashboard:view',
    'reference:read',
    'students:read',
    'subscriptions:read',
    'payments:read',
    'payments:review',
    'reports:read',
  ],
  students_manager: [
    'dashboard:view',
    'reference:read',
    'students:read',
    'students:manage',
    'students:location',
    'students:track',
    'subscriptions:read',
    'subscriptions:grant',
    'payments:read',
    'announcements:manage',
    'results:read',
    'reports:read',
  ],
  support: [
    'dashboard:view',
    'reference:read',
    'students:read',
    'students:location',
    'students:track',
    'students:reset_session',
    'subscriptions:read',
    'payments:read',
  ],
};

export function hasPermission(roles: ReadonlyArray<StaffRole>, permission: Permission): boolean {
  if (roles.includes('admin')) return true;
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
}

export function hasAnyPermission(
  roles: ReadonlyArray<StaffRole>,
  permissions: ReadonlyArray<Permission>
): boolean {
  return permissions.some((p) => hasPermission(roles, p));
}

export function requiresMfa(roles: ReadonlyArray<StaffRole>): boolean {
  return roles.includes('admin') || roles.includes('payments_reviewer');
}

export type NavModuleId =
  | 'dashboard'
  | 'content'
  | 'academic'
  | 'students'
  | 'pricing'
  | 'subscriptions'
  | 'payments'
  | 'exams'
  | 'grading'
  | 'results'
  | 'announcements'
  | 'reports'
  | 'staff'
  | 'audit'
  | 'settings'
  | 'yearEnd';

export interface NavItemConfig {
  id: NavModuleId;
  path: string;
  requiredPermissions: ReadonlyArray<Permission>;
}

export const NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  { id: 'dashboard', path: '/', requiredPermissions: ['dashboard:view'] },
  { id: 'content', path: '/content', requiredPermissions: ['content:read'] },
  { id: 'academic', path: '/academic', requiredPermissions: ['reference:write'] },
  { id: 'students', path: '/students', requiredPermissions: ['students:read'] },
  { id: 'pricing', path: '/pricing', requiredPermissions: ['plans:write'] },
  { id: 'subscriptions', path: '/subscriptions', requiredPermissions: ['subscriptions:read'] },
  { id: 'payments', path: '/payments', requiredPermissions: ['payments:review'] },
  { id: 'exams', path: '/exams', requiredPermissions: ['exams:read'] },
  {
    id: 'grading',
    path: '/grading',
    requiredPermissions: ['grading:export_import', 'grading:read_batches', 'grading:approve'],
  },
  { id: 'results', path: '/results', requiredPermissions: ['results:read'] },
  { id: 'announcements', path: '/announcements', requiredPermissions: ['announcements:manage'] },
  { id: 'reports', path: '/reports', requiredPermissions: ['reports:read'] },
  { id: 'staff', path: '/staff', requiredPermissions: ['staff:manage'] },
  { id: 'audit', path: '/audit', requiredPermissions: ['audit:read'] },
  { id: 'settings', path: '/settings', requiredPermissions: ['settings:manage'] },
  { id: 'yearEnd', path: '/year-end', requiredPermissions: ['year_end:manage'] },
];

export function getVisibleNavItems(roles: ReadonlyArray<StaffRole>): NavItemConfig[] {
  if (roles.length === 0) return [];
  return NAV_ITEMS.filter((item) => hasAnyPermission(roles, item.requiredPermissions));
}

export function canAccessPath(roles: ReadonlyArray<StaffRole>, pathname: string): boolean {
  if (roles.length === 0) return false;
  if (pathname === '/' || pathname === '') return hasPermission(roles, 'dashboard:view');
  const matched = NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path));
  if (!matched) return true;
  return hasAnyPermission(roles, matched.requiredPermissions);
}
