import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
  },
});
