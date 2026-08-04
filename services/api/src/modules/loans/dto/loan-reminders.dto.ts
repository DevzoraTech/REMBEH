import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const LOAN_REMINDER_FILTERS = [
  'overdue',
  'due_today',
  'repayment:2-3',
  'repayment:4-7',
  'repayment:8+',
  'active',
  'single',
] as const;

export type LoanReminderFilter = (typeof LOAN_REMINDER_FILTERS)[number];

export class SendLoanReminderDto {
  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}

export class BulkLoanRemindersDto {
  @IsString()
  @IsIn([
    'overdue',
    'due_today',
    'repayment:2-3',
    'repayment:4-7',
    'repayment:8+',
    'active',
  ])
  filter!: Exclude<LoanReminderFilter, 'single'>;
}
