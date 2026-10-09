import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'net', include: ['test/**/*.test.ts'] },
});
