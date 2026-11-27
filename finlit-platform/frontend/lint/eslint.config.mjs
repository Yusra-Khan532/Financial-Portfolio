// ESLint for the website (frontend/src): the React hooks rules only, the two the code's own suppressions already name.
//   react-hooks/rules-of-hooks   error: a hook called conditionally, in a loop or outside a component breaks React's state order; never allowed.
//   react-hooks/exhaustive-deps  warning: an effect, memo or callback that reads a value it does not list runs with a stale copy of it. The warnings
//                                that exist today are counted in frontend/lint/baseline.json; CI fails when the count grows (as the UI check does).
// The parser is typescript-eslint on TypeScript 5.9, installed here apart from the app (typescript-eslint cannot use the app's TypeScript 7).
// Types are not needed: no rule here reads them, so no project is loaded and linting stays fast.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "lint/**", "public/**", "e2e/**", "scripts/**"] },
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
