import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

// Answers go through ui/reply.ts, posts and DMs through client.ts, and embeds are
// built in ui/posts.ts, so no message pings anyone by accident.
const HELPERS_ONLY = [
  'CallExpression[callee.property.name=/^(reply|editReply|followUp|deferReply|deferUpdate|update|send)$/]',
  "NewExpression[callee.name='EmbedBuilder']",
].map((selector) => ({ selector, message: 'Answer through ui/reply.ts; post and DM through client.ts.' }));

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettier.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: ['test', 'describe', 'it'], package: 'node:test' },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/ui/reply.ts', 'src/ui/posts.ts', 'src/client.ts'],
    rules: { 'no-restricted-syntax': ['error', ...HELPERS_ONLY] },
  },
];
