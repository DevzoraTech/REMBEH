import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      name: 'REMBEH API',
      status: 'online',
      architecture: 'modular-monolith',
      tenantIsolation: 'tenant_id required for tenant-owned data',
      timestamp: new Date().toISOString(),
    };
  }
}
