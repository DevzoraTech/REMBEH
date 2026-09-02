import { IsBoolean } from 'class-validator';

export class UpdateBranchSettingsDto {
  @IsBoolean()
  agentFieldExpensesEnabled!: boolean;
}
