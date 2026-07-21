import { IsIn } from 'class-validator';

export class UpdateAgentStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}
