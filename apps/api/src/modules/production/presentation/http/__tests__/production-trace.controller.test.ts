import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import { REQUIRED_PERMISSION } from '../../../../../common/security/auth.decorators.js';
import { ProductionTraceController } from '../production-trace.controller.js';

describe('ProductionTraceController', () => {
  it('protects both read projections with the trace permission', () => {
    const prototype = ProductionTraceController.prototype;
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.search)).toBe(
      PERMISSIONS.production.trace.view,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.detail)).toBe(
      PERMISSIONS.production.trace.view,
    );
    expect(Reflect.getMetadata(PATH_METADATA, prototype.detail)).toBe('batches/:batchId');
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.detail)).toBe(RequestMethod.GET);
  });
});
