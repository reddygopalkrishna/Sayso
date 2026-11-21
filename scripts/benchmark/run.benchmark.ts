// Entry point used by bench.sh: vitest is the TypeScript runner (it handles the app's code and the
// workspace packages). The folder and flags come from the environment. Not part of `pnpm test`.
import { it } from 'vitest';
import { main } from './run.ts';

it('benchmark', { timeout: 3_600_000 }, async () => {
  const folder = process.env['BENCH_DIR'];
  if (!folder) throw new Error('set BENCH_DIR (use scripts/benchmark/bench.sh)');
  const extra = (process.env['BENCH_ARGS'] ?? '').split(' ').filter(Boolean);
  const report = await main([folder, ...extra]);
  process.stdout.write(`\n${report}\n`);
});
