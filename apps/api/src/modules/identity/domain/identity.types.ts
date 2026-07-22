import type {
  SystemDepartmentOption,
  SystemPermissionListItem,
  SystemRoleListItem,
  SystemRoleOption,
  SystemUserListItem,
  UserProfile,
} from '@company/contracts';

export interface CredentialUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
}
export interface RefreshTokenRecord {
  userId: string;
  jti: string;
  expiresAt: Date;
}
export type IdentityProfile = UserProfile;
export type IdentityUser = SystemUserListItem;
export type IdentityRole = SystemRoleListItem;
export type IdentityPermission = SystemPermissionListItem;
export type IdentityDepartmentOption = SystemDepartmentOption;
export type IdentityRoleOption = SystemRoleOption;
