import { IsUUID } from 'class-validator';

export class CreateLoanApplicationFromCustomerDto {
  @IsUUID()
  customerId!: string;
}
