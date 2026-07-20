import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — REMBEH',
  description: 'How REMBEH collects, uses, and protects your personal information.',
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <a href="/" className="text-sm font-medium text-accent-500 hover:text-accent-600">
          ← Back to REMBEH
        </a>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-brand-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-brand-500 mb-12">Last updated: July 20, 2026</p>

        <div className="space-y-8 text-brand-700 leading-relaxed text-sm">
          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">1. Introduction</h2>
            <p>
              ANTIKRA Mechanism (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the REMBEH Financial Management
              System, including the REMBEH web application and REMBEH mobile field app (collectively, the
              &ldquo;Service&rdquo;). This Privacy Policy explains how we collect, use, disclose, and safeguard
              information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account data: name, email, phone, organization, branch, and role</li>
              <li>Borrower and guarantor KYC data submitted by field agents (including National ID images)</li>
              <li>Loan application media, signatures, and agreement documents</li>
              <li>Collections and payment activity recorded in the workspace</li>
              <li>Device and usage logs needed to operate and secure the Service</li>
              <li>Identity verification results from Smile ID when enabled by your organization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">3. How We Use Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide lending operations, collections, and daily close workflows</li>
              <li>Authenticate users and enforce tenant isolation</li>
              <li>Process identity verification and document storage</li>
              <li>Deliver operational notifications and support responses</li>
              <li>Detect fraud, abuse, and security incidents</li>
              <li>Comply with legal and regulatory obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">4. Data Sharing</h2>
            <p>We do not sell personal information. We may share data with:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Your organization administrators and authorized staff within your tenant</li>
              <li>Infrastructure providers (e.g. AWS hosting and object storage)</li>
              <li>Identity verification providers (Smile ID) when your organization enables them</li>
              <li>Authorities when required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">5. Security</h2>
            <p>
              REMBEH uses HTTPS, JWT authentication, role-based permissions, and per-tenant data scoping.
              Object storage uses private buckets with time-limited signed URLs for downloads.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">6. Contact</h2>
            <p>
              Questions about this policy: <a className="text-accent-500" href="mailto:hello@antikra.com">hello@antikra.com</a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
