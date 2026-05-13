import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Default environment is node. Component tests opt-in via:
    //   // @vitest-environment happy-dom
    // at the top of the file.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/out/**", "**/e2e/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
