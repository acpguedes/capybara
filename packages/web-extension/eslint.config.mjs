import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname
});

const typeCheckedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      project: "./tsconfig.json",
      tsconfigRootDir: __dirname,
      ecmaFeatures: {
        ...(config.languageOptions?.parserOptions?.ecmaFeatures ?? {}),
        jsx: true
      }
    }
  }
}));

const reactConfigs = compat
  .extends(
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended"
  )
  .map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx}"]
  }));

export default tseslint.config(
  {
    ignores: ["dist/**", "scripts/**"]
  },
  {
    ...js.configs.recommended,
    files: ["src/**/*.{ts,tsx}"]
  },
  ...typeCheckedConfigs,
  ...reactConfigs,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true }
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    globals: {
      chrome: "readonly",
      browser: "readonly"
    }
  }
);
