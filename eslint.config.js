import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  // 忽略构建产物与 .claude/worktrees/**（并发会话的 git worktree 副本含独立 tsconfig/eslint 配置，
  // 会导致 tsconfigRootDir 多候选解析失败；worktree 属于临时工作区，不应参与本仓库门禁）。
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.claude/worktrees/**'] },
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
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['apps/api/src/modules/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        {
          type: 'api-module',
          pattern: 'apps/api/src/modules/*',
          capture: ['moduleName'],
        },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'api-module' } },
              disallow: {
                to: {
                  element: { type: 'api-module', fileInternalPath: '!public.ts' },
                },
              },
              message: '跨业务模块只能通过目标模块的 public.ts 导入',
            },
          ],
        },
      ],
    },
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
  // Nest 的构造器注入和 DTO 校验依赖运行时类型元数据，不能自动改成 type-only import。
  {
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
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
                '@aws-sdk/*',
                'typeorm',
                'knex',
                'prisma',
                'sequelize',
                '**/infrastructure/**',
                '**/presentation/**',
              ],
              message: 'application 层只能通过端口访问基础设施',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // @nestjs/common 的所有 *Exception 命名导入（BadRequest/NotFound/UnprocessableEntity/InternalServerError
          // 等当前及未来新增的 Nest HTTP 异常类）一律禁止，避免枚举遗漏导致门禁假通过。
          selector:
            "ImportDeclaration[source.value='@nestjs/common'] ImportSpecifier[imported.name=/Exception$/]",
          message:
            'application 层不得引入 Nest HTTP 异常；业务失败应抛出协议无关的模块错误，由 presentation 映射 HTTP',
        },
        {
          selector: 'Literal[value=/^ER_[A-Z_]+$/]',
          message:
            'application 层不得识别数据库驱动错误码；实现错误由 infrastructure 映射为模块错误',
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
  {
    files: ['apps/api/src/modules/*/infrastructure/**/*.ts'],
    rules: {
      // 聚合内聚警示线，不是机械上限：超过 500 行按聚合根、变化原因和事务边界拆窄 Port 适配器，
      // 禁止为了压行数搬移代码。见 docs/coding-standards.md §4。
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['apps/admin-web/src/views/**/*.vue'],
    rules: {
      // 视图内聚警示线：超过 1000 行优先把列表状态/分页/副作用提取为 useXxx composable，
      // 模板与样式不是拆分对象，禁止机械拆行数。见 docs/coding-standards.md §5。
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
  // ⚠ 债务隔离：已知的迁移占位区，待接通真实 API 后逐步解除
  //   已重构完成的模块（完成文件拆分 + 类型修复）不再需要豁免：
  //   - apps/admin-web/src/views/system/**/*.{ts,vue}   ✓ 已重构
  //   - apps/admin-web/src/views/product/**/*.{ts,vue}   ✓ 已重构
  //   TODO(api-integration): 以下目录接入 API 时，改为对应的严格类型并删除对应 override
  {
    files: [
      'apps/admin-web/src/views/warehouse/**/*.{ts,vue}',
      'apps/admin-web/src/views/production/**/*.{ts,vue}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'vue/no-unused-vars': 'warn',
    },
  },
);
