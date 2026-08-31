import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

const propertyPath = (parent: string, property: string) => {
  if (!parent) return property;
  return /^\d+$/.test(property) ? `${parent}[${property}]` : `${parent}.${property}`;
};

const firstMessage = (errors: ValidationError[], parent = ''): string | undefined => {
  for (const error of errors) {
    const path = propertyPath(parent, error.property);
    if (error.constraints?.whitelistValidation) return `请求包含未允许的字段：${path}`;
    const [constraint, message] = error.constraints
      ? (Object.entries(error.constraints)[0] ?? [])
      : [];
    if (message) return `${path}: ${translateValidationMessage(constraint, message)}`;
    const childMessage = firstMessage(error.children ?? [], path);
    if (childMessage) return childMessage;
  }
  return undefined;
};

const translateValidationMessage = (constraint: string | undefined, message: string): string => {
  if (!containsEnglishValidationText(message)) return message;

  switch (constraint) {
    case 'isString':
      return '必须是字符串';
    case 'isNotEmpty':
      return '不能为空';
    case 'isInt':
      return '必须是整数';
    case 'isNumber':
      return '必须是有效数字';
    case 'isNumberString':
      return '必须是数字字符串';
    case 'isBoolean':
      return '必须是布尔值';
    case 'isArray':
      return '必须是数组';
    case 'isEmail':
      return '邮箱格式无效';
    case 'isDateString':
    case 'isISO8601':
      return '必须是有效的日期时间';
    case 'isDefined':
      return '不能为空';
    case 'isObject':
      return '必须是对象';
    case 'isUUID':
      return '必须是有效的 UUID';
    case 'maxLength':
      return `长度不能超过 ${extractLimit(message) ?? '指定'} 个字符`;
    case 'minLength':
      return `长度不能少于 ${extractLimit(message) ?? '指定'} 个字符`;
    case 'max':
      return `不能大于 ${extractLimit(message) ?? '指定值'}`;
    case 'min':
      return `不能小于 ${extractLimit(message) ?? '指定值'}`;
    case 'isIn':
    case 'isEnum': {
      const values = message.split(':').slice(1).join(':').trim();
      return values ? `取值必须是：${values}` : '取值无效';
    }
    default:
      return '参数格式不正确';
  }
};

const containsEnglishValidationText = (message: string): boolean =>
  /\b(must|should|be|not|empty|string|number|integer|boolean|array|email|valid|characters|less|greater|specified|values|property|defined|object)\b/i.test(
    message,
  );

const extractLimit = (message: string): string | undefined =>
  message.match(/(?:equal to|than|be)\s+(\d+)/i)?.[1] ?? message.match(/\b(\d+)\b/)?.[1];

/** HTTP 输入边界：在请求到达应用服务前拒绝格式错误的载荷。 */
export const createValidationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: firstMessage(errors) ?? '请求参数不符合要求',
      }),
  });
