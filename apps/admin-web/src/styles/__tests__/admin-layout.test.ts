import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin layout styles', () => {
  const stylesheetPath = [
    resolve(process.cwd(), 'src/styles/index.css'),
    resolve(process.cwd(), 'apps/admin-web/src/styles/index.css'),
  ].find(existsSync);

  expect(stylesheetPath).toBeDefined();
  const stylesheet = readFileSync(stylesheetPath!, 'utf8');

  it('keeps the application shell within the viewport', () => {
    expect(stylesheet).toMatch(
      /\.shell\s*\{[^}]*height: 100vh;[^}]*height: 100dvh;[^}]*overflow: hidden;/s,
    );
  });

  it('keeps an expanded menu scrolling inside the viewport-height sidebar', () => {
    expect(stylesheet).toContain('position: sticky');
    expect(stylesheet).toContain('height: 100vh');
    expect(stylesheet).toContain('height: 100dvh');
    expect(stylesheet).toContain('overflow: hidden');
    expect(stylesheet).toContain('flex: 0 0 60px');
    expect(stylesheet).toContain('flex: 1');
    expect(stylesheet).toContain('min-height: 0');
    expect(stylesheet).toContain('overflow-y: auto');
  });

  it('scrolls overflowing route content inside its allocated height', () => {
    expect(stylesheet).toMatch(
      /\.main\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;[^}]*overflow: hidden;/s,
    );
    expect(stylesheet).toMatch(
      /\.content\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: auto;/s,
    );
  });
});
