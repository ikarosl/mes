import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

const firstMessage = (errors: ValidationError[]): string | undefined => {
  for (const error of errors) {
    if (error.constraints?.whitelistValidation) return `请求包含未允许的字段：${error.property}`;
    const message = error.constraints ? Object.values(error.constraints)[0] : undefined;
    if (message) return message;
    const childMessage = firstMessage(error.children ?? []);
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
