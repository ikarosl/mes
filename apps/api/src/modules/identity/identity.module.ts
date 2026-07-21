import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthService } from './application/auth.service.js';
import { RbacService } from './application/rbac.service.js';
import { AuditRepository } from './application/ports/audit.repository.js';
import { IdentityRepository } from './application/ports/identity.repository.js';
import { MysqlIdentityRepository } from './infrastructure/mysql-identity.repository.js';
import { AuthController } from './presentation/http/auth.controller.js';
import { RbacController } from './presentation/http/rbac.controller.js';
import { AuthGuard } from './presentation/http/auth.guard.js';
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, RbacController],
  providers: [
    MysqlIdentityRepository,
    { provide: IdentityRepository, useExisting: MysqlIdentityRepository },
    { provide: AuditRepository, useExisting: MysqlIdentityRepository },
    AuthService,
    RbacService,
    AuthGuard,
  ],
  exports: [AuthGuard, AuditRepository],
})
export class IdentityModule {}
