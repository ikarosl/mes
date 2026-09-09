import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PasswordHasher } from '../application/ports/password-hasher.js';

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
