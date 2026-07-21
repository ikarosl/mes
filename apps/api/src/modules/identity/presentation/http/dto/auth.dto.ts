import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString({ message: '用户名必须是字符串' })
  @Length(1, 64, { message: '用户名长度必须在 1 到 64 个字符之间' })
  username!: string;

  @IsString({ message: '密码必须是字符串' })
  @Length(1, 128, { message: '密码长度必须在 1 到 128 个字符之间' })
  password!: string;
}
