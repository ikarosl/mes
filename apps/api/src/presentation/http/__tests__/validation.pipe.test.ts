import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from '../../../modules/identity/presentation/http/dto/rbac.dto.js';
import { ProductDto } from '../../../modules/product/presentation/http/dto/product.dto.js';
import { createValidationPipe } from '../validation.pipe.js';

describe('HTTP validation pipe', () => {
  it('returns the standard validation error for malformed DTO input', async () => {
    const pipe = createValidationPipe();

    await expect(
      pipe.transform(
        {
          username: null,
          password: 'short',
          displayName: {},
          roleIds: '1',
        },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('removes no declared fields and rejects unknown fields', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform(
        {
          username: 'operator',
          password: '123456',
          displayName: '操作员',
          roleIds: ['1'],
          isAdmin: true,
        },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: '提交内容格式不正确，请重新打开页面后重试' },
    });
  });

  // TODO(product-json-table-http-validation): 验证规格参数表格输入的 HTTP 校验及中文错误映射；高重要性，旧嵌套数组 DTO 已移除且正式测试暂缓；获正式测试授权后按 DTO 对象校验与应用层表格规范化边界恢复。

  it('translates class-validator default messages to Chinese', async () => {
    const pipe = createValidationPipe();

    try {
      await pipe.transform({ itemCode: 123 }, { type: 'body', metatype: ProductDto });
      throw new Error('预期校验应失败');
    } catch (error) {
      const response = (
        error as { getResponse: () => { code: string; message: string } }
      ).getResponse();
      expect(response).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.message).toBe('输入值长度不能超过 100 个字符');
      expect(response.message).not.toMatch(/\b(must|should|be|characters|property)\b/i);
    }
  });
});
