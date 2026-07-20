import { Module } from '@nestjs/common';
import { AuthService } from './application/auth.service.js';
import { RbacService } from './application/rbac.service.js';
import { IdentityRepository } from './application/ports/identity.repository.js';
import { MysqlIdentityRepository } from './infrastructure/mysql-identity.repository.js';
import { AuthController } from './presentation/http/auth.controller.js';
import { RbacController } from './presentation/http/rbac.controller.js';
import { AuthGuard } from './presentation/http/auth.guard.js';
@Module({
  controllers: [AuthController, RbacController],
  providers: [
    { provide: IdentityRepository, useClass: MysqlIdentityRepository },
    AuthService,
    RbacService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, IdentityRepository],
})
export class IdentityModule {}
