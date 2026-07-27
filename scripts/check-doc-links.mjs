import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const root = process.cwd();
const ignored = new Set(['.git', '.pnpm-store', '.turbo', 'coverage', 'dist', 'node_modules']);

const markdownFiles = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(target);
  }
};

await walk(root);
const failures = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (!raw || /^(?:https?:|mailto:|#)/i.test(raw)) continue;
    const targetPart = decodeURIComponent(raw.split('#', 1)[0]);
    if (!targetPart) continue;
    const target = path.resolve(path.dirname(file), targetPart);
    try {
      await access(target);
    } catch {
      failures.push(`${path.relative(root, file)} -> ${raw}`);
    }
  }
}

if (failures.length) {
  throw new Error(`发现失效的本地 Markdown 链接：\n${failures.join('\n')}`);
}

console.log(`Checked ${markdownFiles.length} Markdown files.`);
