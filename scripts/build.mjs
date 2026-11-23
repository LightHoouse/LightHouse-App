import { rmSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
mkdirSync('dist/ui', { recursive: true });
cpSync('src/ui', 'dist/ui', { recursive: true });
await import('./build-native.mjs');
