import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'] as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('缺少登录凭证');
    try {
      req.user = this.jwt.verify(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效');
    }
  }
}
