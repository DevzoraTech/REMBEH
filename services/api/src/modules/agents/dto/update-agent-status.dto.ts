import { IsIn, IsOptional, IsString } from 'class-validator';

const SUSPEND_REASONS = [
  'Temporary leave',
  'Account security concern',
  'Performance issue',
  'Misconduct',
  'No longer working with branch',
] as const;

export class UpdateAgentStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @IsIn([...SUSPEND_REASONS])
  reason?: (typeof SUSPEND_REASONS)[number];
}
