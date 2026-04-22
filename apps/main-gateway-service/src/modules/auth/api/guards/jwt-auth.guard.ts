import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { IJwtService } from '../../application/interfaces/jwt.service.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: IJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.split(' ')[1];
    const payload = await this.jwtService.getPayload(token);

    if (!payload) throw new UnauthorizedException();

    // Прикрепляем userId к запросу для декоратора
    request.user = { id: payload.userId, deviceId: payload.deviceId };
    return true;
  }
}
