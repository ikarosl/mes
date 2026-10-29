import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
    permission?: string | readonly string[];
    tab?: boolean;
    tabName?: string;
    menuPath?: string;
    keepAliveName?: string;
  }
}
