import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthService } from './application/auth.service.js';
import { IdentityDirectoryService } from './application/identity-directory.service.js';
import { RbacService } from './application/rbac.service.js';
import { UserCandidateConfigService } from './application/user-candidate-config.service.js';
import { UserCandidateService } from './application/user-candidate.service.js';
import { AuthRepository } from './application/ports/auth.repository.js';
import { PasswordHasher } from './application/ports/password-hasher.js';
import { TokenService } from './application/ports/token.service.js';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher.js';
import { JwtTokenService } from './infrastructure/jwt-token.service.js';
import { AuditRepository } from './application/ports/audit.repository.js';
import { RbacRepository } from './application/ports/rbac.repository.js';
import { UserCandidateRepository } from './application/ports/user-candidate.repository.js';
import { MysqlAuditRepository } from './infrastructure/mysql-audit.repository.js';
import { MysqlAuthRepository } from './infrastructure/mysql-auth.repository.js';
import { MysqlRbacRepository } from './infrastructure/mysql-rbac.repository.js';
import { MysqlUserCandidateRepository } from './infrastructure/mysql-user-candidate.repository.js';
import { AuthController } from './presentation/http/auth.controller.js';
import { RbacController } from './presentation/http/rbac.controller.js';
import { UserCandidateConfigController } from './presentation/http/user-candidate-config.controller.js';
import { AuthGuard } from './presentation/http/auth.guard.js';
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, RbacController, UserCandidateConfigController],
  providers: [
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    MysqlAuthRepository,
    MysqlRbacRepository,
    MysqlUserCandidateRepository,
    MysqlAuditRepository,
    { provide: AuthRepository, useExisting: MysqlAuthRepository },
    { provide: RbacRepository, useExisting: MysqlRbacRepository },
    { provide: UserCandidateRepository, useExisting: MysqlUserCandidateRepository },
    { provide: AuditRepository, useExisting: MysqlAuditRepository },
    AuthService,
    IdentityDirectoryService,
    RbacService,
    UserCandidateConfigService,
    UserCandidateService,
    AuthGuard,
  ],
  exports: [AuthGuard, AuditRepository, IdentityDirectoryService, UserCandidateService],
})
export class IdentityModule {}
