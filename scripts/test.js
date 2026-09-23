import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests')
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => `tests/${file}`);
if (!files.length) throw new Error('No hay pruebas: se cancela la validación.');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
