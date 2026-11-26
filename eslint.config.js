import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Camada dsp/: funções puras, sem DOM/React. O lint garante a regra.
    files: ['src/dsp/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-*', '../ui/*', '../state/*', '../audio/*', '../workers/*'] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator'],
    },
  },
  {
    files: ['src/audio/worklets/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.audioWorklet,
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
      },
    },
  },
  { files: ['scripts/**/*.mjs', '*.config.{js,ts}'], languageOptions: { globals: { ...globals.node } } },
  prettier,
);
