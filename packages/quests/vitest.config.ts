import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'quests', include: ['test/**/*.test.ts'] },
});
