# Feature Module Boundaries

Every REMBEH feature module must own its own boundary. This keeps the modular monolith clean now and keeps future service extraction realistic.

Each feature should include:

- controllers for HTTP entry points
- services for business rules
- repositories for database access
- DTOs and response contracts for API shape
- permissions owned as constants by the feature
- event names and payload contracts owned by the feature
- audit/outbox writes for important state changes
- focused tests or e2e coverage for the feature flow

Reference modules:

- Branches — workspace structure, staff invitations, branch-scoped access
- Customers — field-captured borrower profiles (agents create; managers/owners monitor)

Field rule: agents capture data on mobile for their assigned branch. Manager and owner consoles consume that branch-scoped data. Do not let clients supply a tenant or branch id for writes — derive both from the authenticated session.
