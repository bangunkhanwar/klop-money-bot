import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2024, globals: globals.browser, parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, sourceType: 'module' } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    settings: { react: { version: 'detect' } },
    rules: { ...js.configs.recommended.rules, ...reactHooks.configs.flat.recommended.rules, ...reactRefresh.configs.vite.rules, 'react/jsx-uses-vars': 'error', 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] }
  }
];
