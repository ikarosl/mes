import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

export const page = (
  path: string,
  name: string,
  title: string,
  component: Component,
  permission: string | readonly string[] | undefined,
  keepAliveName: string,
): RouteRecordRaw => ({
  path,
  name,
  component,
  meta: { title, permission, tab: true, keepAliveName },
});
