# REMBEH Branch Borrower Onboarding Checklist

This checklist covers information currently stored in REMBEH that may be useful when a branch brings its existing borrowers and loans into the app. A branch can indicate which information it has available. The minimum fields needed to create a usable record will be confirmed during implementation.

## Borrower information

- [ ] Full name
- [ ] Surname
- [ ] Given names
- [ ] Phone number
- [ ] National identification number (NIN)
- [ ] Email address
- [ ] Gender
- [ ] Date of birth
- [ ] District
- [ ] Sub-county
- [ ] Parish
- [ ] Village

## Existing loan

- [ ] Loan amount or principal issued
- [ ] Current outstanding balance
- [ ] Currency
- [ ] Loan status, such as current, in arrears, closed or written off
- [ ] Date approved
- [ ] Date issued or disbursed
- [ ] Repayment start date
- [ ] Assigned loan officer
- [ ] Loan product
- [ ] Loan purpose
- [ ] Collateral type
- [ ] Whether the loan has fines
- [ ] Total fines

## Loan terms

- [ ] Interest rate percentage
- [ ] Interest type
- [ ] Loan duration in days
- [ ] Loan term value and unit
- [ ] Repayment frequency: daily, weekly, fortnightly, monthly or lump sum
- [ ] Processing fee amount
- [ ] Processing fee type
- [ ] Processing fee percentage
- [ ] Fixed processing fee amount
- [ ] Penalty rate percentage
- [ ] Fine period in days
- [ ] Repayment start policy
- [ ] Repayment start delay in days
- [ ] Whether the officer may choose the repayment start date

Some loan-term fields overlap. The form should show fields appropriate to the selected arrangement.

## Repayment history

For each historical repayment, where available:

- [ ] Amount paid
- [ ] Payment date
- [ ] Payment method
- [ ] Receipt number
- [ ] Officer who recorded the payment
- [ ] Principal portion
- [ ] Interest portion
- [ ] Fees portion
- [ ] Note

If only the current outstanding balance is known, the app should record the opening position without inventing individual historical repayments.

## Guarantor

- [ ] Full name
- [ ] Phone number
- [ ] National ID image: front
- [ ] National ID image: back
- [ ] Signature

The current guarantor record does not have a separate NIN text field. Adding one would require a database change.

## Images, documents and signatures

- [ ] Borrower's passport photo
- [ ] Borrower's national ID: front
- [ ] Borrower's national ID: back
- [ ] Guarantor's national ID: front
- [ ] Guarantor's national ID: back
- [ ] Collateral document
- [ ] Supporting document
- [ ] Other document
- [ ] Borrower's signature
- [ ] Guarantor's signature
- [ ] Officer's signature
- [ ] Signed loan agreement

## Historical disbursement details

- [ ] Amount disbursed
- [ ] Date disbursed
- [ ] Disbursement source
- [ ] Amount from assigned float
- [ ] Amount from collected repayments
- [ ] Officer who recorded the disbursement
- [ ] Note

## Important notes

- Branch and company identifiers, record IDs, timestamps, sync status, audit information, file storage references and migration flags should be managed by the app, not entered in the checklist.
- Some borrower details are currently stored on a loan application rather than directly on the borrower profile. Their reuse across future loans needs to be handled during implementation.
- The sample form includes a repayable amount. The database stores related loan terms and a wallet opening balance; the correct mapping of an imported repayable amount must be verified before implementation.
- Existing loans should not be counted as new disbursements on the onboarding day. Unknown information should not be replaced with invented values.
- The checklist describes database fields, not a guarantee that every field is already supported for self-service onboarding in the app.
