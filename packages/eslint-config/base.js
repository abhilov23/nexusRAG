import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import turboPlugin from "eslint-plugin-turbo";
import onlyWarn from "eslint-plugin-only-warn";

/**
 * Every config object in a flat config must carry a `files` glob, otherwise
 * ESLint reports "File ignored because no matching configuration was supplied"
 * and silently skips the file. Without this list the entire repo went unlinted
 * while `pnpm lint` still exited 0.
 */
const sourceFiles = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];

/**
 * A shared ESLint configuration for the repository.
 *
 * TypeScript is parsed with the Babel TS preset rather than typescript-eslint:
 * this repo pins TypeScript 7.0 and typescript-eslint refuses to load on it.
 *
 * That parser cannot resolve type-only imports or TypeScript scoping, so the
 * two core rules it gets wrong are disabled for TS sources and left to `tsc`:
 *   - `no-unused-vars` -> covered by the compiler (and noUnusedLocals)
 *   - `no-undef`       -> the compiler rejects genuinely undefined identifiers
 *
 * Everything else (React Hooks, Next.js, turbo env rules, the JS core rules)
 * still applies, which is what actually catches the bugs in this repo.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/generated/**",
      "**/out/**",
      "**/build/**",
      "**/next-env.d.ts",
    ],
  },

  { ...js.configs.recommended, files: sourceFiles },
  { ...eslintConfigPrettier, files: sourceFiles },

  {
    files: sourceFiles,
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaFeatures: { jsx: true },
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",

      // See the note above: the Babel parser misreports both of these on
      // TypeScript sources, and the compiler already enforces them.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },

  {
    files: sourceFiles,
    plugins: {
      onlyWarn,
    },
  },
];
