Don't think of it as loan management software.

Think of it as a Multi-Tenant Financial Operations Platform.

Everything else becomes a module.

REMBEH Platform Vision

REMBEH is a cloud-native, multi-tenant operating system for lending institutions that automates every aspect of lending operations while giving each organization a completely isolated digital workspace.

Customers should never feel like they're using someone else's SaaS.

They should feel like REMBEH was built specifically for them.

High Level Architecture
                    REMBEH CLOUD
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
 Authentication      Billing Engine      Notification Engine
        │                 │                  │
        └─────────────────┼──────────────────┘
                          │
                 Multi Tenant Core
                          │
        ┌────────────────────────────────────┐
        │                                    │
 Workspace A                          Workspace B
 ABC Finance                          XYZ Loans
        │                                    │
 Branches                             Branches
        │                                    │
 Users                                Users
 Loans                                Loans
 Reports                              Reports

Each company is a Tenant.

Nothing is shared except the platform itself.

Multi-Tenant Strategy

I recommend Shared Database + Tenant Isolation.

Every table has

tenant_id

Example

Users

id
tenant_id
branch_id
role_id
email
phone
Loans

id
tenant_id
branch_id
customer_id
Transactions

id
tenant_id
branch_id

No query should ever execute without a tenant_id filter.

Later, very large enterprise customers can be moved to dedicated databases without changing business logic.

Workspace Structure
REMBEH
   │
   ├── Workspace
   │      (Company)
   │
   ├── Branches
   │
   ├── Departments
   │
   ├── Users
   │
   ├── Roles
   │
   ├── Permissions
   │
   ├── Customers
   │
   ├── Loans
   │
   ├── Collections
   │
   ├── Reports
   │
   └── Settings
Registration Flow
Step 1

Company registers.

Collect

Business Name

Business Registration Number (optional)

Country

Currency

Owner Name

Phone

Email

Password

↓

Email OTP

↓

Workspace Created

↓

Owner becomes

Workspace Owner
Step 2

Create Branch

Branch Name

Branch Address

GPS Location

Branch Phone

Working Hours

Owner can create many.

Step 3

Invite Branch Manager

Email

Phone

Role

Branch

↓

Invitation Email

↓

OTP Verification

↓

Creates Password

↓

Manager Activated

Step 4

Manager Adds Team

Examples

Agents

Cashiers

Loan Officers

Recovery Officers

Customer Care

Accountants

Auditors

Each verifies

✅ Email

✅ Phone

before activation.

User Hierarchy
Platform Super Admin (REMBEH)

↓

Workspace Owner

↓

Company Admin

↓

Regional Manager

↓

Branch Manager

↓

Supervisor

↓

Cashier

↓

Loan Officer

↓

Field Agent

↓

Auditor

↓

Viewer
Mobile App

One app.

Dynamic permissions.

Agent logs in

↓

Only Agent features appear.


Manager logs in

↓

Manager Dashboard appears.

Cashier logs in

↓

Cashier Dashboard appears.

Same application.

Different permissions.

Web App

Main Control Center.

Dashboard

Customers

Loans

Collections

Approvals

Accounting

Branches

Employees

Reports

Settings
Module Architecture

This is where I think you can outperform many competitors.

Don't hardcode features.

Build feature modules.

Workspace

↓

Enabled Modules

Customer Module

Loan Module

SMS Module

Accounting Module

AI Module

Payroll Module

Collections Module

Mobile Money Module

HR Module

GPS Module

Document Module

Reports Module

Inventory Module

Expense Module

Every module registers itself.

Example

@Module({
   name: "Loans",
   permissions: [],
   routes: [],
   menu: []
})

The frontend automatically builds menus based on enabled modules.

Pricing

Instead of

Starter

Professional

Enterprise

Think

Workspace pays for modules.

Example

Core
Dashboard
Customers
Users
Branches
Lending
Loans
Guarantors
Collections
Finance
Cashiers
Accounting
Expenses
AI
AI Reports
AI Fraud Detection
AI Recommendations
Communication
SMS
Email
WhatsApp
Enterprise
API
White Label
Audit Logs
SSO

This gives tremendous flexibility.

Backend Modules
Authentication

Workspace

Tenant

Billing

Subscription

Roles

Permissions

Branches

Employees

Customers

Loans

Guarantors

Collateral

Collections

Transactions

Cashiers

Accounting

Reports

Notifications

Files

Audit Logs

Settings

AI

API

Webhooks

Each is independent.

Authentication

Support

Email

Phone

OTP

Password

Passkeys (future)

2FA
Permission System

Don't create roles only.

Create

Permission

↓

Role

↓

Role Group

↓

User

Example

loan.create

loan.update

loan.delete

loan.approve

loan.reject

Roles simply bundle permissions.

Notifications

One centralized service.

Email

SMS

Push

WhatsApp

In-App

Modules publish events.

Loan Approved

↓

Notification Service

↓

Send SMS

↓

Send Email

↓

Push Notification
Event Driven System

Everything should emit events.

Loan Created

Customer Registered

Payment Made

Cash Drawer Closed

Branch Created

Employee Invited

Later AI can consume these events.

Audit Logs

Every action.

Who

When

Old Value

New Value

IP

Device

Location

Nothing escapes the audit trail.

File Storage

Store

Contracts

Customer Photos

National IDs

Collateral Images

Videos

Receipts

Statements

Use S3-compatible storage.

Future Modules
Credit Bureau
Mobile Money
Bank APIs
Accounting
Payroll
HR
Procurement
CRM
Marketing
Customer Portal
Self-Service Loan Application
AI Assistant
OCR Document Processing
Biometric Verification
Recommended Tech Stack

Based on what I know about your experience and existing projects, I'd recommend:

Frontend (Web): Next.js
Mobile: Flutter
Backend: NestJS
Database: PostgreSQL
ORM: Prisma
Cache & Queues: Redis + BullMQ
Object Storage: AWS S3
Authentication: JWT + Refresh Tokens + OTP
Realtime: WebSockets
Search: PostgreSQL Full Text initially, with OpenSearch later if needed.
Infrastructure: Docker on AWS ECS/Fargate (or EC2 initially), behind an Application Load Balancer.
One architectural improvement I'd make

Rather than building a large "modular monolith" or jumping immediately to microservices, I'd use a modular monolith with clear domain boundaries.

Each feature (Loans, Customers, Branches, Billing, Notifications, etc.) should own its:

controllers,
services,
database access,
events,
permissions,
and API contracts.

Those boundaries let you disable modules for pricing, keep the codebase maintainable, and later extract a busy module into its own microservice if scale demands it—all without redesigning the entire system.

For a product like REMBEH, that approach provides an excellent balance between development speed today and scalability in the future.