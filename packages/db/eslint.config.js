import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  globalIgnores(["dist", "convex/_generated", ".agents", ".claude"]),
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["convex/**/*.ts"],
  })),
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      // Type-aware rules (explicit-table-ids, no-collect-in-query) need the TS program.
      parserOptions: { project: "./convex/tsconfig.json" },
    },
  },
  ...convexPlugin.configs.recommended,
]);
