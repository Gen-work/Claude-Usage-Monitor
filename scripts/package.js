'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
for (const command of candidates) {
  const probe = spawnSync(command, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)']);
  if (probe.status !== 0) continue;
  const result = spawnSync(command, [path.join(__dirname, 'package.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
console.error('Packaging requires Python 3.8+ (installation helpers do not).');
process.exit(1);
