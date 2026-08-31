import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

// Flat config (ESLint 9). Deliberately a sensible, not-maximalist rule set:
// the recommended presets plus React 18 / hooks / a11y, with the noisiest
// stylistic rules dialled down so the linter surfaces real issues (bad list
// keys, hook-dependency bugs, unused vars, a11y gaps) rather than a wall of
// preference noise. Not wired into CI yet - see package.json / the PR.
export default [
  // Build artefacts and generated/minified output - never our source. The
  // .netlify/ serve bundles in particular are huge minified telemetry files
  // that otherwise drown the real findings in tens of thousands of errors.
  { ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'node_modules/**', 'public/**', '.netlify/**', '**/*.min.js'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    // The codebase carries a few pre-existing `eslint-disable` comments from
    // before a config existed; don't flag them as "unused directive" noise.
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, Buffer: 'readonly' }
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...(react.configs.flat?.recommended?.rules ?? {}),
      ...(jsxA11y.flatConfigs?.recommended?.rules ?? {}),
      'react-hooks/rules-of-hooks': 'error', // genuine bug class - keep as error
      'react-hooks/exhaustive-deps': 'warn',
      // The JSX transform means React need not be in scope, and this app
      // deliberately doesn't use prop-types (it's plain JS, typed via a few
      // opt-in @ts-check files instead) - so these two would be pure noise.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Cosmetic only: raw apostrophes/quotes in JSX text render perfectly
      // fine. This fired 156 times across real copy and is pure preference
      // noise, so it's off rather than forcing &apos; everywhere.
      'react/no-unescaped-entities': 'off',
      // Real a11y signal, but numerous and needing case-by-case judgement
      // (a clickable div that also needs a key handler / role) - surfaced as
      // warnings to work through, not as blocking errors.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/media-has-caption': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      // Allow intentional unused args/vars prefixed with _ (e.g. caught errors).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  },
  // Node runtime for the serverless functions and build/config scripts
  // (incl. .mjs, which the src glob above doesn't match).
  {
    files: ['netlify/functions/**/*.js', '**/*.config.js', 'scripts/**/*.{js,mjs}', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  // Test files: node:test globals are imported, but allow node env.
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
