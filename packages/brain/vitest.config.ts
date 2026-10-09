import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'brain', include: ['test/**/*.test.ts'] },
});
