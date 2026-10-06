import {
  defineConfig 
} from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.js'],
    // Only this checkout's own tests. Git worktrees created under .claude/ are excluded from the
    // repository, but vitest still walked into them and ran another branch's tests against this
    // branch's setup file, so `npm run check` and the pre-push hook failed on work that was not
    // in the commit.
    include: ['tests/**/*.test.js'],
    // A first import of the system's graph inside a hook (beforeAll of the storage sheet, the imports a test
    // leaves pending that afterEach awaits) took from 10 s to more than 60 s on a loaded machine, measured on
    // 2026-10-06 with some thirty sessions running: the default 10 s, and 60 s, both failed now and then
    hookTimeout: 180000,
    coverage: {
      provider: 'v8',
      include: ['modules/**/*.js'],
      exclude: ['modules/sr5.js', 'modules/hooks/**'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
})
