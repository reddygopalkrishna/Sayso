import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['scripts/simulate/run.simulate.ts'] },
});
