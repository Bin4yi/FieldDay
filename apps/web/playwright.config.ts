import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'] },
  webServer: [
    {
      command: 'pnpm build && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @fieldday/server start',
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: '8787',
        ALLOWED_ORIGINS: 'http://localhost:4173',
        DATABASE_FILE: ':memory:',
        // Boost Mode against a local fake of the OpenAI API.
        OPENAI_API_KEY: 'sk-fake',
        OPENAI_DESIGN_MODEL: 'fake-design',
        OPENAI_VISION_MODEL: 'fake-vision',
        OPENAI_REALTIME_MODEL: 'fake-realtime',
        OPENAI_BASE_URL: 'http://localhost:8799/v1',
      },
    },
    {
      command: 'node e2e/fake-openai.mjs',
      port: 8799,
      reuseExistingServer: !process.env.CI,
      env: { PORT: '8799' },
    },
  ],
});
