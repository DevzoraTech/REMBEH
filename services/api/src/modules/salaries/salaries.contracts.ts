import type { EmployeeStatus, SalaryPaymentMethod } from '@prisma/client';

export type SalaryCycleContract = {
  start: string;
  end: string;
  label: string;
  paymentWindowStart: string;
  paymentWindowEnd: string;
  nextStart: string;
  nextEnd: string;
};

export type SalaryPaymentContract = {
  id: string;
  amount: number;
  method: SalaryPaymentMethod;
  paidAt: string;
  operationDate: string | null;
  paidFromCash: boolean;
  canReverse: boolean;
  referenceNote: string | null;
  recordedByName: string;
  reversedAt: string | null;
};

export type SalaryOpenCashDayContract = {
  operationDate: string;
  branchCashRemaining: number;
};

export type SalaryEmployeeContract = {
  id: string;
  userId: string | null;
  branchId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  ninNumber: string | null;
  roleName: string | null;
  status: EmployeeStatus;
  photoUrl: string | null;
  monthlySalary: number;
  salaryDue: number;
  paid: number;
  outstanding: number;
  shortageOutstanding: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  isProrated: boolean;
  cycleDays: number;
  eligibleDays: number;
  dateJoined: string;
  paymentMethod: SalaryPaymentMethod | null;
  paymentProvider: string | null;
  paymentAccountName: string | null;
  paymentAccountNumber: string | null;
  notes: string | null;
  payments: SalaryPaymentContract[];
  createdAt: string;
  updatedAt: string;
};

export type PayrollSummaryContract = {
  totalPayrollDue: number;
  employeeCount: number;
  paid: number;
  outstanding: number;
  paidPercent: number;
  outstandingPercent: number;
  employeeShortages: number;
  shortageEmployeeCount: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
};

export type SalaryAgentCandidateContract = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  roleName: string | null;
  branchId: string | null;
  photoUrl: string | null;
};

export type SalariesDashboardContract = {
  cycle: SalaryCycleContract;
  summary: PayrollSummaryContract;
  employees: SalaryEmployeeContract[];
  openCashDay: SalaryOpenCashDayContract | null;
};

export type SalaryHistoryCycleContract = {
  start: string;
  end: string;
  label: string;
  salaryDue: number;
  paid: number;
  outstanding: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  payments: SalaryPaymentContract[];
};
