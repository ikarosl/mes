import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AuditInterceptor, AuthGuard, IdentityModule } from './modules/identity/public.js';
import { ProductModule } from './modules/product/public.js';
import { ProductionModule } from './modules/production/public.js';
import { HttpExceptionFilter } from './presentation/http/http-exception.filter.js';
@Module({
  imports: [IdentityModule, ProductModule, ProductionModule],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
