module.exports = {
  root: true, env: { browser: true, es2022: true, node: true }, parser: '@typescript-eslint/parser',
  parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'], extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: { 'no-undef': 'off', 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
};
