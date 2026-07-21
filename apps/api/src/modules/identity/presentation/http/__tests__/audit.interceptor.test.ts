import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { auditFailureRemark } from '../audit.interceptor.js';

describe('audit failure remarks', () => {
  it('does not persist raw exception messages', () => {
    expect(auditFailureRemark(new Error('SELECT password_hash FROM users'))).toBe(
      'Unhandled request failure',
    );
  });

  it('retains the safe status of expected HTTP errors', () => {
    expect(auditFailureRemark(new BadRequestException('password=secret'))).toBe('HTTP 400');
  });
});
