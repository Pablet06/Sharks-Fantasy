import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Sharks-Fantasy/',
  test: {
    // 'node' by default: the current suite is pure logic, and loading jsdom
    // from node_modules on OneDrive takes ~17s, blowing vitest's worker-start
    // timeout. A component/DOM test opts in per file with:
    //   // @vitest-environment jsdom
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    // Frontend tests only. The scraper has its own vitest project (node env,
    // file:// fixture loading) run via `cd scraper && npm test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})
