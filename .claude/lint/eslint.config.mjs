import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintPluginTypescript from "@typescript-eslint/eslint-plugin";
import eslintParserTypescript from "@typescript-eslint/parser";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import prettierConfig from "./prettier.config.mjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base
  js.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      "prettier/prettier": ["error", prettierConfig],
      curly: "error",
      "padding-line-between-statements": [
        "error",
        // Blank line before return
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "any", prev: ["block-like", "case", "default"], next: "return" },
        // Blank line before/after block-like (if, for, while, switch, try)
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "any", prev: "block-like", next: "block-like" },
        // Blank line between declarations and expressions (and vice versa)
        { blankLine: "always", prev: ["const", "let", "var"], next: "expression" },
        { blankLine: "always", prev: "expression", next: ["const", "let", "var"] },
        // Allow consecutive declarations without blank lines
        { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        // Allow consecutive expressions without blank lines
        { blankLine: "any", prev: "expression", next: "expression" },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.d.ts", "**/out/**", "**/.turbo/**"],
  },

  // TypeScript
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: eslintParserTypescript,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": eslintPluginTypescript,
    },
    rules: {
      ...eslintPluginTypescript.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "none",
          caughtErrors: "all",
          ignoreRestSiblings: true,
          ignoreUsingDeclarations: false,
          reportUsedIgnorePattern: false,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: true },
      ],
    },
  },

  // UI: enforce @/ alias instead of relative imports
  {
    files: ["**/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message: "Use @/ alias instead of relative parent imports (e.g. @/lib/utils).",
            },
          ],
        },
      ],
    },
  },

  // React
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
];
