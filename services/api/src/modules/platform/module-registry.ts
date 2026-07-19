import { BRANCH_EVENTS } from '../branches/branches.events';
import { BRANCH_PERMISSION_LIST } from '../branches/branches.permissions';

export type RembehModuleCategory =
  'core' | 'lending' | 'finance' | 'communication' | 'ai' | 'enterprise';

export type RembehModuleDefinition = {
  key: string;
  name: string;
  category: RembehModuleCategory;
  description: string;
  permissions: string[];
  menu: Array<{
    label: string;
    route: string;
    surface: 'web' | 'mobile' | 'both';
  }>;
  events: string[];
};

export const REMBEH_MODULES: RembehModuleDefinition[] = [
  {
    key: 'workspace',
    name: 'Account',
    category: 'core',
    description:
      'Tenant profile, settings, branches, departments, and account activation.',
    permissions: [
      'workspace.read',
      'workspace.update',
      ...BRANCH_PERMISSION_LIST,
    ],
    menu: [
      { label: 'Dashboard', route: '/dashboard', surface: 'both' },
      { label: 'Branches', route: '/branches', surface: 'web' },
      { label: 'Settings', route: '/settings', surface: 'web' },
    ],
    events: [
      'workspace.created',
      BRANCH_EVENTS.created,
      BRANCH_EVENTS.updated,
      BRANCH_EVENTS.staffInvited,
      BRANCH_EVENTS.staffActivated,
    ],
  },
  {
    key: 'identity',
    name: 'Identity & Access',
    category: 'core',
    description:
      'Users, roles, permissions, invitations, OTP, and staff activation.',
    permissions: [
      'user.invite',
      'user.activate',
      'user.read',
      'role.create',
      'role.update',
      'permission.assign',
    ],
    menu: [
      { label: 'Employees', route: '/employees', surface: 'web' },
      { label: 'Roles', route: '/settings/roles', surface: 'web' },
    ],
    events: ['employee.invited', 'employee.activated', 'role.updated'],
  },
  {
    key: 'customers',
    name: 'Customers',
    category: 'core',
    description:
      'Borrower profiles, verification, documents, and customer history.',
    permissions: [
      'customer.create',
      'customer.read',
      'customer.update',
      'customer.verify',
    ],
    menu: [{ label: 'Customers', route: '/customers', surface: 'both' }],
    events: ['customer.registered', 'customer.verified', 'customer.updated'],
  },
  {
    key: 'loans',
    name: 'Loans',
    category: 'lending',
    description:
      'Applications, approvals, disbursement, guarantors, collateral, and lifecycle status.',
    permissions: [
      'loan.create',
      'loan.read',
      'loan.update',
      'loan.approve',
      'loan.reject',
      'loan.disburse',
      'loan.product.manage',
    ],
    menu: [
      { label: 'Loans', route: '/loans', surface: 'both' },
      {
        label: 'Loan products',
        route: '/settings/loan-products',
        surface: 'web',
      },
    ],
    events: [
      'loan.created',
      'loan.approved',
      'loan.rejected',
      'loan.disbursed',
      'loan_application.submitted',
      'loan_application.updated',
      'loan_application.media_uploaded',
    ],
  },
  {
    key: 'collections',
    name: 'Collections',
    category: 'lending',
    description:
      'Repayments, arrears, field collection routes, receipts, and recovery queues.',
    permissions: [
      'collection.create',
      'collection.read',
      'collection.reconcile',
      'arrears.read',
      'recovery.assign',
    ],
    menu: [{ label: 'Collections', route: '/collections', surface: 'both' }],
    events: ['payment.made', 'receipt.issued', 'arrears.flagged'],
  },
  {
    key: 'cashiers',
    name: 'Cashiers',
    category: 'finance',
    description:
      'Cash drawers, teller activity, reconciliation, and branch cash controls.',
    permissions: [
      'cashdrawer.open',
      'cashdrawer.close',
      'cashdrawer.reconcile',
      'cashier.read',
    ],
    menu: [{ label: 'Cashier', route: '/cashier', surface: 'both' }],
    events: ['cashdrawer.opened', 'cashdrawer.closed', 'cashdrawer.reconciled'],
  },
  {
    key: 'reports',
    name: 'Reports',
    category: 'finance',
    description:
      'Operational, lending, collections, accounting, and audit reports.',
    permissions: ['report.read', 'report.export', 'report.schedule'],
    menu: [{ label: 'Reports', route: '/reports', surface: 'web' }],
    events: ['report.generated', 'report.exported'],
  },
  {
    key: 'notifications',
    name: 'Notifications',
    category: 'communication',
    description:
      'Email, SMS, WhatsApp, push, and in-app messages from platform events.',
    permissions: [
      'notification.read',
      'notification.send',
      'notification.template.update',
    ],
    menu: [
      {
        label: 'Notifications',
        route: '/settings/notifications',
        surface: 'web',
      },
    ],
    events: ['notification.queued', 'notification.sent', 'notification.failed'],
  },
  {
    key: 'ai',
    name: 'AI',
    category: 'ai',
    description:
      'Risk insights, fraud detection, recommendations, and future assistant workflows.',
    permissions: ['ai.insight.read', 'ai.recommendation.read', 'ai.fraud.read'],
    menu: [{ label: 'AI Insights', route: '/ai', surface: 'web' }],
    events: ['ai.insight.created', 'ai.risk.flagged'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    category: 'enterprise',
    description:
      'Audit logs, API access, webhooks, SSO, and white-label controls.',
    permissions: [
      'audit.read',
      'api.manage',
      'webhook.manage',
      'sso.manage',
      'branding.update',
    ],
    menu: [
      { label: 'Audit Logs', route: '/audit-logs', surface: 'web' },
      { label: 'API & Webhooks', route: '/settings/api', surface: 'web' },
    ],
    events: ['audit.recorded', 'webhook.delivered', 'api.key.created'],
  },
];
