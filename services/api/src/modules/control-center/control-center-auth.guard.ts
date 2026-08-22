import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ControlCenterAdminContext } from './control-center-admin';
import { ControlCenterService } from './control-center.service';

type ControlCenterRequest = Request & {
  controlCenterAdmin?: ControlCenterAdminContext;
};

@Injectable()
export class ControlCenterAuthGuard implements CanActivate {
  constructor(private readonly controlCenterService: ControlCenterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ControlCenterRequest>();
    const authorization = request.header('authorization') ?? '';
    const [scheme, token] = authorization.split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Control center login required.');
    }

    request.controlCenterAdmin =
      await this.controlCenterService.verifyAdminToken(token);
    return true;
  }
}
