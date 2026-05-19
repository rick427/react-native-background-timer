module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Allow unused vars if prefixed with _
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Warn on any — we use it intentionally in a few bridge types
    '@typescript-eslint/no-explicit-any': 'warn',
    // Native bridge objects are typed as plain Object in codegen
    '@typescript-eslint/no-empty-object-type': 'off',
  },
};
