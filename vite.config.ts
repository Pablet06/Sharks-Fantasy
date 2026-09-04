import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Sharks-Fantasy/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Frontend tests only. The scraper has its own vitest project (node env,
    // file:// fixture loading) run via `cd scraper && npm test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
