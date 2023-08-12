module.exports = {
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
    plugins: [
        '@typescript-eslint',
    ],
    env: {
      browser: true,
      es6: true,
      node: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
      // Indentation
      'indent': ['error', 2, { 'SwitchCase': 1 }],
  
      // Maximum line length
      'max-len': ['warn', { code: 120, tabWidth: 2, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true }],
  
      // Quotes
      'quotes': ['error', 'single', { avoidEscape: true }],
  
      // Semi colons
      'semi': ['error', 'always'],
  
      // No trailing spaces
      'no-trailing-spaces': 'error',
  
      // Comma dangle
      'comma-dangle': ['error', 'never'],
  
      // Object curly spacing: { foo: bar }
      'object-curly-spacing': ['error', 'always'],
  
      // Always space around arrow functions
      'arrow-spacing': ['error', { before: true, after: true }],
  
      // No var
      'no-var': 'error',
  
      // Prefer const over let
      'prefer-const': 'error',
  
      // No unused vars
      'no-unused-vars': 'warn',      
  
      // Space before function parenthesis
      'space-before-function-paren': ['error', 'never'],
  
      // No multiple empty lines
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 1 }],

      '@typescript-eslint/prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/space-before-function-paren': ['error', 'never'],
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 1 }],
    },
  };
  