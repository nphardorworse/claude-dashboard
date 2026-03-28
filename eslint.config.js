import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import promise from "eslint-plugin-promise";

export default [
  { ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.ts"] },

  {
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint,
      promise,
    },
    settings: {
      react: { version: "detect" },
    },
  },

  // TypeScript parser for client files
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // TypeScript parser for server files (separate tsconfig)
  {
    files: ["src/server/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.server.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // TypeScript parser for shared files
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Core rules for all source files
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Code quality
      "no-restricted-syntax": [
        "error",
        {
          selector: "ClassDeclaration",
          message:
            "No classes. Use functional components and plain objects/functions.",
        },
        {
          selector: "ClassExpression",
          message:
            "No class expressions. Use functional components and plain objects/functions.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message:
                "Use the built-in fetch API instead. Axios adds unnecessary bundle size.",
            },
          ],
        },
      ],
      "no-restricted-exports": [
        "warn",
        {
          restrictDefaultExports: {
            direct: false,
            named: true,
            defaultFrom: true,
            namedFrom: true,
          },
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-shadow": "error",
      "no-unsafe-optional-chaining": "error",
      "prefer-template": "warn",

      // TypeScript
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-return-await": "off",
      "@typescript-eslint/return-await": "warn",
      "@typescript-eslint/no-explicit-any": "warn",

      // React
      "react/jsx-no-bind": [
        "warn",
        {
          ignoreDOMComponents: true,
          ignoreRefs: true,
          allowArrowFunctions: true,
          allowFunctions: false,
          allowBind: false,
        },
      ],
      "react/no-unstable-nested-components": ["error", { allowAsProps: false }],
      "react/self-closing-comp": "warn",
      "react/jsx-boolean-value": "error",
      "react/jsx-curly-brace-presence": "warn",
      "react/jsx-no-constructed-context-values": "warn",

      // React Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Promises
      "promise/catch-or-return": "error",
      "promise/no-return-wrap": "error",
      "promise/always-return": "warn",
      "promise/no-nesting": "warn",
    },
  },

  // Accessibility rules (client components only)
  {
    files: ["src/client/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
    },
  },

  // React Refresh — catches components that break Vite HMR
  {
    files: ["src/client/**/*.{ts,tsx}"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
