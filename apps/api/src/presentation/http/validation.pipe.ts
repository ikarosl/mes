import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

interface InputValidationDiagnostic {
  path: string;
  constraint: string;
}

export class InputValidationException extends BadRequestException {
  constructor(
    message: string,
    readonly diagnostic: InputValidationDiagnostic,
  ) {
    super({ code: 'VALIDATION_ERROR', message });
  }
}

const invalidFormatMessage = '提交内容格式不正确，请重新打开页面后重试';
// 仅映射已核对的共用 DTO 字段；其他字段保留约束含义，技术路径只用于诊断。
const fieldLabels: Record<string, string> = {
  username: '用户名',
  password: '密码',
  quantity: '数量',
  page: '页码',
  pageSize: '每页条数',
  keyword: '搜索内容',
  reason: '原因',
  remark: '备注',
  version: '记录版本',
};

const propertyPath = (parent: string, property: string) => {
  if (!parent) return property;
  return /^\d+$/.test(property) ? `${parent}[${property}]` : `${parent}.${property}`;
};

const firstFailure = (
  errors: ValidationError[],
  parent = '',
): { message: string; diagnostic: InputValidationDiagnostic } | undefined => {
  for (const error of errors) {
    const path = propertyPath(parent, error.property);
    if (error.constraints?.whitelistValidation)
      return {
        message: invalidFormatMessage,
        diagnostic: { path, constraint: 'whitelistValidation' },
      };
    const [constraint, message] = error.constraints
      ? (Object.entries(error.constraints)[0] ?? [])
      : [];
    if (message)
      return {
        message: userValidationMessage(error.property, constraint, message),
        diagnostic: { path, constraint: constraint ?? 'unknown' },
      };
    const childMessage = firstFailure(error.children ?? [], path);
    if (childMessage) return childMessage;
  }
  return undefined;
};

const userValidationMessage = (
  property: string,
  constraint: string | undefined,
  message: string,
): string => {
  if (!containsEnglishValidationText(message)) return message;
  const label = fieldLabels[property];
  if (
    [
      'isString',
      'isNumberString',
      'isBoolean',
      'isArray',
      'isObject',
      'isUUID',
      'nestedValidation',
      'unknownValue',
    ].includes(constraint ?? '')
  )
    return label ? `${label}格式不正确，请重新填写` : invalidFormatMessage;
  if (constraint === 'isIn' || constraint === 'isEnum')
    return label ? `${label}无效，请重新选择` : '所选内容无效，请重新选择';
  if (constraint === 'isEmail') return '请输入有效的邮箱地址';
  const translated = translateValidationMessage(constraint, message);
  return translated === '参数格式不正确'
    ? invalidFormatMessage
    : `${label ?? '输入值'}${translated}`;
};

const translateValidationMessage = (constraint: string | undefined, message: string): string => {
  switch (constraint) {
    case 'isNotEmpty':
      return '不能为空';
    case 'isInt':
      return '必须是整数';
    case 'isNumber':
      return '必须是有效数字';
    case 'isDateString':
    case 'isISO8601':
      return '必须是有效的日期时间';
    case 'isDefined':
      return '不能为空';
    case 'maxLength':
      return `长度不能超过 ${extractLimit(message) ?? '指定'} 个字符`;
    case 'minLength':
      return `长度不能少于 ${extractLimit(message) ?? '指定'} 个字符`;
    case 'max':
      return `不能大于 ${extractLimit(message) ?? '指定值'}`;
    case 'min':
      return `不能小于 ${extractLimit(message) ?? '指定值'}`;
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
    exceptionFactory: (errors) => {
      const failure = firstFailure(errors);
      return new InputValidationException(
        failure?.message ?? invalidFormatMessage,
        failure?.diagnostic ?? { path: 'unknown', constraint: 'unknown' },
      );
    },
  });
