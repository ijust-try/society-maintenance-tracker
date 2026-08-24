import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceRoot = path.resolve(__dirname, '..', 'frontend', 'src');
const source = fs.readFileSync(path.join(sourceRoot, 'main.jsx'), 'utf8');
const css = fs.readFileSync(path.join(sourceRoot, 'styles.css'), 'utf8');
const required = [
  '/society/uploads/photo',
  '/society/complaints',
  '/society/complaints/${id}/history',
  '/society/admin/dashboard',
  '/society/notices',
  'user.role===\'admin\'',
  'OVERDUE',
  'Loading',
  'ErrorState',
  'Empty',
  '@media(max-width:640px)',
];
for (const token of required) {
  if (!(source.includes(token) || css.includes(token))) throw new Error(`Missing frontend contract: ${token}`);
}
console.log(`Frontend contract smoke test: ${required.length} checks passed`);
