import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ControlCenterAdminContext } from './control-center-admin';

type ControlCenterRequest = Request & {
  controlCenterAdmin?: ControlCenterAdminContext;
};

export const CurrentControlCenterAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<ControlCenterRequest>();
    return request.controlCenterAdmin;
  },
);
