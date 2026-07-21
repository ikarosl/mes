import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  prettier,
  // 全局：underscore 前缀的函数参数是约定，不视为未使用
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'mysql2',
                'mysql2/*',
                '@company/database',
                '**/application/**',
                '**/infrastructure/**',
                '**/presentation/**',
              ],
              message: 'domain 层必须保持框架与基础设施无关',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'mysql2',
                'mysql2/*',
                '@company/database',
                '**/infrastructure/**',
                '**/presentation/**',
              ],
              message: 'application 层只能通过端口访问基础设施',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['mysql2', 'mysql2/*', '@company/database', '**/infrastructure/**'],
              message: 'presentation 层不得直接访问数据库或基础设施实现',
            },
          ],
        },
      ],
    },
  },
  // ⚠ 债务隔离：已知的迁移占位区，待接通真实 API 后逐步解除
  //   TODO(api-integration): 以下目录接入 API 时，改为对应的严格类型并删除对应 override
  {
    files: [
      'apps/admin-web/src/views/warehouse/**/*.{ts,vue}',
      'apps/admin-web/src/views/product/**/*.{ts,vue}',
      'apps/admin-web/src/views/production/**/*.{ts,vue}',
      'apps/admin-web/src/views/system/**/*.{ts,vue}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'vue/no-unused-vars': 'warn',
    },
  },
);
