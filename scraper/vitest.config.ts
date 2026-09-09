import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The scraper dir holds a OneDrive cloud-only `.env` that can't be read here;
  // Vite's loadEnv chokes on it at startup. Tests mock fetch and need no env,
  // so point env loading at the (env-free) test dir.
  envDir: 'test',
  test: {
    include: ['test/**/*.test.ts'],
  },
})
