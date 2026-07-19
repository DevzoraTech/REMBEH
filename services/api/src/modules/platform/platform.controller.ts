import { Controller, Get } from '@nestjs/common';
import { PlatformService } from './platform.service';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('health')
  getHealth() {
    return this.platformService.getHealth();
  }

  @Get('modules')
  getModules() {
    return this.platformService.getModules();
  }

  @Get('workspace-blueprint')
  getWorkspaceBlueprint() {
    return this.platformService.getWorkspaceBlueprint();
  }
}
