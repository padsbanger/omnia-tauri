import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Retained HeroUI workflows perform several complete DOM interactions.
    // Allow slower Linux/CI hosts without changing assertions or coverage scope.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/main.tsx"],
      reporter: ["json", "text", "html"],
    },
  },
});
