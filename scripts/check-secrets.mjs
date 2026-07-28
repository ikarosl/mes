import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const patterns = [/AKIA[0-9A-Z]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const violations = [];
for (const file of files) {
  if (file.endsWith('.lock') || file.startsWith('infra/compose/secrets/')) continue;
  const source = await readFile(file, 'utf8');
  if (patterns.some((pattern) => pattern.test(source))) violations.push(file);
}
if (violations.length) {
  console.error(`Potential committed secrets: ${violations.join(', ')}`);
  process.exitCode = 1;
} else console.log('Secret scan passed.');
