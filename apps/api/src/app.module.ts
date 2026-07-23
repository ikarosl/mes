import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ProductModule } from './modules/product/product.module.js';
import { AuthGuard } from './modules/identity/presentation/http/auth.guard.js';
import { AuditInterceptor } from './modules/identity/presentation/http/audit.interceptor.js';
import { HttpExceptionFilter } from './presentation/http/http-exception.filter.js';
@Module({
  imports: [IdentityModule, ProductModule],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
