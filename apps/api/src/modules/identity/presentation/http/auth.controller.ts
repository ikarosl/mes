import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { LoginRequest, UserProfile } from '@company/contracts';
import { loadAppConfig } from '../../../../config/env.js';
import { AuthService } from '../../application/auth.service.js';
import { CurrentUser, Public } from './auth.decorators.js';

const COOKIE = 'company_refresh_token';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
@Controller('auth')
export class AuthController {
  private readonly config = loadAppConfig();
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.auth.login({
      username: String(body?.username ?? ''),
      password: String(body?.password ?? ''),
    });
    this.setCookie(response, result.refreshToken);
    return result.response;
  }
  @Public() @Post('refresh') async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const token = readCookie(request.headers.cookie, COOKIE);
    const result = await this.auth.refresh(token ?? '');
    this.setCookie(response, result.refreshToken);
    return result.response;
  }
  @Public() @Post('logout') async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(readCookie(request.headers.cookie, COOKIE) ?? null);
    response.clearCookie(COOKIE, this.cookieOptions());
    return { success: true };
  }
  @Get('me') me(@CurrentUser() user: UserProfile) {
    return user;
  }
  private setCookie(response: CookieResponse, value: string) {
    response.cookie(COOKIE, value, { ...this.cookieOptions(), maxAge: MAX_AGE });
  }
  private cookieOptions() {
    return {
      httpOnly: true as const,
      sameSite: 'lax' as const,
      secure: this.config.refreshCookieSecure,
      path: this.config.refreshCookiePath,
    };
  }
}
interface CookieRequest {
  headers: { cookie?: string };
}
interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}
const readCookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((item) => item.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');
