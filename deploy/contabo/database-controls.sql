SELECT json_build_object(
  'users', (SELECT count(*) FROM users),
  'branches', (SELECT count(*) FROM branches),
  'customers', (SELECT count(*) FROM customers),
  'loans', (SELECT count(*) FROM loans),
  'loan_principal', (SELECT coalesce(sum(principal), 0)::text FROM loans),
  'loan_balance', (SELECT coalesce(sum(balance), 0)::text FROM loans),
  'loan_applications', (SELECT count(*) FROM loan_applications),
  'loan_disbursements', (SELECT count(*) FROM loan_disbursements),
  'disbursed_amount', (SELECT coalesce(sum(amount), 0)::text FROM loan_disbursements),
  'repayments', (SELECT count(*) FROM repayments),
  'repayment_amount', (SELECT coalesce(sum(amount), 0)::text FROM repayments),
  'repayment_principal', (SELECT coalesce(sum(principal_allocated), 0)::text FROM repayments),
  'repayment_interest', (SELECT coalesce(sum(interest_allocated), 0)::text FROM repayments),
  'app_releases', (SELECT count(*) FROM app_releases),
  'migrations', (SELECT count(*) FROM _prisma_migrations)
);
