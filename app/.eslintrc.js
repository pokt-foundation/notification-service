module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-types': [
      'error',
      {
        types: {
          object: false,
          Function: false,
          '{}': false,
        },
        extendDefaults: true,
      },
    ],
  },
}
