import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import UsersPage from '../../views/system/UsersPage.vue';
import RolesPage from '../../views/system/RolesPage.vue';
import SystemUserCandidates from '../../views/system/SystemUserCandidates.vue';
import PermissionsPage from '../../views/system/PermissionsPage.vue';
import LogsPage from '../../views/system/LogsPage.vue';
import { page } from '../page';

export const systemRoutes: RouteRecordRaw[] = [
  page(
    'system/users',
    'system-users',
    '用户管理',
    UsersPage,
    PERMISSIONS.system.users.view,
    'UsersPage',
  ),
  page(
    'system/roles',
    'system-roles',
    '角色管理',
    RolesPage,
    PERMISSIONS.system.roles.view,
    'RolesPage',
  ),
  page(
    'system/user-candidates',
    'system-user-candidates',
    '业务人员配置',
    SystemUserCandidates,
    PERMISSIONS.system.userCandidates.view,
    'SystemUserCandidates',
  ),
  page(
    'system/permissions',
    'system-permissions',
    '权限管理',
    PermissionsPage,
    PERMISSIONS.system.permissions.view,
    'PermissionsPage',
  ),
  page(
    'system/logs',
    'system-logs',
    '操作日志',
    LogsPage,
    PERMISSIONS.system.logs.view,
    'LogsPage',
  ),
];
