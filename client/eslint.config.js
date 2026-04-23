import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Flags raw hex literals in string/template contexts so they can be
// replaced with CSS vars (see TOKEN-001/002). Warn-level so legacy
// fallbacks like var(--color-bg, #fff) don't break the build — authors
// can opt out on a specific line with eslint-disable-next-line.
const NO_RAW_HEX_MESSAGE =
  'Raw hex color detected. Use var(--brand-*) or var(--color-*) tokens instead. See client/src/index.css @theme tokens.';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // TOKEN-006 — forbid raw hex literals in page/component files.
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/lib/theme.ts', // token definition file
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: NO_RAW_HEX_MESSAGE,
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
          message: NO_RAW_HEX_MESSAGE,
        },
      ],
    },
  },
])
