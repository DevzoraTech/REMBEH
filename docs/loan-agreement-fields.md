# Loan agreement DOCX field mapping

Template file: [`product-idea-assets/Loan-agreement .docx`](../product-idea-assets/Loan-agreement%20.docx)  
Runtime copy: `services/api/assets/loan-agreement.docx`

## Placeholders → system fields

| Placeholder | System field |
|---|---|
| `<<day>>` `<<month>>` `<<year>>` | Agreement generation date (UTC) |
| `<<current_date>>` | Same date label (DOCX footer) |
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
| `<<borrower_signature>>` | Applicant PNG embedded **inline** at this placeholder |
| `<<guarantor_signature>>` | Guarantor PNG embedded **inline** at this placeholder |
| `<<agent_signature>>` | Officer PNG embedded **inline** at this placeholder |

## Download flow

1. Web **Download PDF** calls `GET /api/v1/loan-applications/:id/agreement.pdf` with JWT.
2. API fills the DOCX template (`word/document.xml` **and** `word/header*.xml` / `word/footer*.xml`) with the merge fields above (including split `<<tokens>>` coalesced across Word runs).
3. Signature PNGs replace `<<borrower_signature>>` / `<<guarantor_signature>>` / `<<agent_signature>>` **in place** in the DOCX (template signature blocks). No separate “ELECTRONIC SIGNATURES” appendix or extra signature pages.
4. By default the API renders a professional Times New Roman PDF (centered header, left body, inline signatures) via pdf-lib so the agreement is never blank. Set `LOAN_AGREEMENT_USE_LIBREOFFICE=1` to try LibreOffice DOCX→PDF first (accepted only when body text is detectable). LibreOffice PDFs are **not** re-saved through pdf-lib (that load/save path strips CID-font body text and produced blank pages).
5. The brand footer is either filled in the DOCX footer (`<<current_date>>`) for LibreOffice, or stamped by pdf-lib on the fallback path.
6. PDF is stored in S3 under `tenants/{tenantId}/loans/{id}/documents/` and streamed to the client.

If LibreOffice is missing, the API fills the DOCX fields and renders an equivalent Times New Roman PDF that mirrors the template layout:

- **Header (centered):** Republic / Moneylenders Act / AND / company matter / **LOAN AGREEMENT** (bold + underlined)
- **Body (left-aligned):** preamble, BETWEEN / AND party blocks, WHEREAS / NOW THEREFORE, numbered clauses with indented sub-clauses
- **Signatures:** inline Name / Signature rows (no “ELECTRONIC SIGNATURES” appendix)
- **Footer (centered, small):** Rembeh Financial Software (ANTIKRA Mechanism) + date

Legacy notices such as “Document version: N” and “LibreOffice PDF conversion unavailable” are not included.
