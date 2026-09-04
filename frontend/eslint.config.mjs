import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * MedLoop AI frontend — ESLint flat config.
 *
 * `eslint-config-next` is still eslintrc-shaped, so it is bridged with FlatCompat. The
 * project-specific rules below are the ones CLAUDE.md §11.2 states as hard requirements:
 * no `any`, no non-null `!`, and no clickable `<div>`. They are errors, not warnings —
 * a warning that never fails the build is a preference, not a rule.
 *
 * Note (verified previously): `next build` runs ESLint *before* the type check, in one
 * phase, so a single lint error hides every type error behind it. Run `npm run typecheck`
 * separately before concluding the types are clean.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
    },
  },
  {
    // The demo modules exist to be obviously fake (CLAUDE.md §10); their long literal
    // tables are the point, and they are the one place `isDemo` objects may be declared.
    files: ['lib/demo/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
