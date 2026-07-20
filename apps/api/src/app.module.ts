import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AuthGuard } from './modules/identity/presentation/http/auth.guard.js';
import { AuditInterceptor } from './modules/identity/presentation/http/audit.interceptor.js';
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
