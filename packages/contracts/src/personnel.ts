import type { PageQuery } from './common.js';

export type PersonnelGroup = 'production' | 'quality';
export type PersonnelStatus = 'active' | 'inactive';

export interface PersonnelOption {
  id: string;
  code: string;
  name: string;
  group: PersonnelGroup;
}

export interface PersonnelItem extends PersonnelOption {
  status: PersonnelStatus;
  version: number;
}

export interface PersonnelListQuery extends PageQuery {
  keyword?: string;
  group?: PersonnelGroup;
  status?: PersonnelStatus;
}

export interface SavePersonnelInput {
  code: string;
  name: string;
  group: PersonnelGroup;
  status: PersonnelStatus;
}

export interface UpdatePersonnelInput extends SavePersonnelInput {
  version: number;
}
