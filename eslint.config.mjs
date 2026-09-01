import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // The CCI connector is an independent Node 20/CommonJS package and runs its
  // own TypeScript checks/tests; the Next.js ESLint rules do not apply to it.
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "connectors/cci/**"]),
]);
