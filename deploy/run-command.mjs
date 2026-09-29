// Node parses env files without executing shell syntax or printing their contents.
import { spawnSync } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Command required');
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
