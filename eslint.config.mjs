// eslint.config.mjs — flat config for ESLint 9 + Next 15.
//
// The legacy .eslintrc.json was lost from the repo at some point; CI
// began reporting "ESLint couldn't find a configuration file" on
// every push. This file restores the rule set used by `next lint`
// for the App Router (next/core-web-vitals + TypeScript) plus a
// minimal ignore set so the audit + scan scripts (which are .py +
// node_modules) don't get linted.

import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
      "scripts/**/*.py",
      "scripts/**/*.sh",
      "*.config.js",
      "*.config.mjs",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Allow {} type — Next router params often use it.
      "@typescript-eslint/no-empty-object-type": "off",
      // We use any in jest mocks frequently; spec'd via inline disable.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
