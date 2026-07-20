import type {
  PermissionListItem,
  RoleListItem,
  UserListItem,
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
export type IdentityUser = UserListItem;
export type IdentityRole = RoleListItem;
export type IdentityPermission = PermissionListItem;
