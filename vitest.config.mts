import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Metro/babel defines __DEV__ globally in the actual app (true in a debug/dev-client
  // build, false in any release build -- see src/services/dev-mode.ts). Vitest has no
  // such define by default, so it's set here to match the "normal" (debug-like) case;
  // individual tests that need to exercise the release-build (__DEV__ === false) path
  // use vi.stubGlobal to override it locally.
  define: {
    __DEV__: 'true',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
  },
});
