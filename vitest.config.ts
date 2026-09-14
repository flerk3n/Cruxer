import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@cruxer/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["packages/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/domain/src/**/*.ts"]
    }
  }
});
