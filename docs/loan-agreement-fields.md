# Loan agreement DOCX field mapping

Template file: [`product-idea-assets/Loan-agreement .docx`](../product-idea-assets/Loan-agreement%20.docx)  
Runtime copy: `services/api/assets/loan-agreement.docx`

## Placeholders → system fields

| Placeholder | System field |
|---|---|
| `<<day>>` `<<month>>` `<<year>>` | Agreement generation date (UTC) |
| `<<company_name>>` | Tenant name |
| `<<company_address>>` | Branch address |
| `<<company_contact>>` | Branch phone |
| `<<borrowername>>` | Borrower full name |
| `<<borrower_name>>` | Borrower full name (signature block) |
| `<<NIN>>` | National ID |
| `<<borrower_address>>` | District, sub-county, parish, village |
| `<<borrower_contact>>` | Phone |
| `<<amount_borrowed>>` | Principal amount (UGX, formatted) |
| `<<amount_borrowed_in_words>>` | Principal in English words |
| `<<loan_purpose>>` | `loanPurpose`, else `collateralType` |
| `<<interest_rate>>` | Interest rate percent (e.g. `10%`) |
| `<<loan_duration>>` | Term label from product template / duration days |
| `<<date_loan_taken>>` | `submittedAt` (or generate time) |
| `<<fine_amount>>` | Computed penalty fine from principal × penalty rate |
| `<<fine_period>>` | `finePeriodDays` label (e.g. `1 day`) |
| `<<collateral_1>>` | Collateral type |
| `<<gurantor_name>>` | Guarantor full name (DOCX spelling kept) |
| `<<agent_name>>` | Officer display name |
| `<<borrower_signature>>` | Marker in DOCX; PNG appended on PDF signature pages |
| `<<guarantor_signature>>` | Marker in DOCX; PNG appended on PDF signature pages |
| `<<agent_signature>>` | Marker in DOCX; PNG appended on PDF signature pages |

## Download flow

1. Web **Download PDF** calls `GET /api/v1/loan-applications/:id/agreement.pdf` with JWT.
2. API fills the DOCX template with the merge fields above.
3. LibreOffice headless converts the filled DOCX to PDF (preferred).
4. Electronic signature PNGs are appended as extra PDF pages.
5. PDF is stored in S3 under `tenants/{tenantId}/loans/{id}/documents/` and streamed to the client.

If LibreOffice is missing, the API still fills the DOCX fields and renders an equivalent PDF from those same template clauses (Times New Roman), then appends signatures.
