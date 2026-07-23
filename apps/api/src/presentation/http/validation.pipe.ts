import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

const propertyPath = (parent: string, property: string) => {
  if (!parent) return property;
  return /^\d+$/.test(property) ? `${parent}[${property}]` : `${parent}.${property}`;
};

const firstMessage = (errors: ValidationError[], parent = ''): string | undefined => {
  for (const error of errors) {
    const path = propertyPath(parent, error.property);
    if (error.constraints?.whitelistValidation) return `请求包含未允许的字段：${path}`;
    const message = error.constraints ? Object.values(error.constraints)[0] : undefined;
    if (message) return `${path}: ${message}`;
    const childMessage = firstMessage(error.children ?? [], path);
    if (childMessage) return childMessage;
  }
  return undefined;
};

/** HTTP input boundary: reject malformed payloads before they reach application services. */
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
