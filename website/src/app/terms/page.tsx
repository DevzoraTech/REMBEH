import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — REMBEH',
  description: 'Terms and conditions for using the REMBEH platform.',
};

export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <a href="/" className="text-sm font-medium text-accent-500 hover:text-accent-600">
          ← Back to REMBEH
        </a>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-brand-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-brand-500 mb-12">Last updated: July 20, 2026</p>

        <div className="space-y-8 text-brand-700 leading-relaxed text-sm">
          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">1. Acceptance</h2>
            <p>
              By accessing REMBEH, operated by ANTIKRA Mechanism, you agree to these Terms. If you use the
              Service on behalf of an organization, you represent that you have authority to bind that
              organization.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">2. The Service</h2>
            <p>REMBEH is a multi-tenant financial operations platform comprising:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>REMBEH Web — manager and operations dashboard</li>
              <li>REMBEH Mobile — field agent app for loans, KYC, and collections</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">3. Accounts</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide accurate registration and staff invitation data</li>
              <li>Protect credentials and notify us of unauthorized access</li>
              <li>You are responsible for activity under your organization&apos;s accounts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">4. Acceptable Use</h2>
            <p>
              You may not misuse the Service, attempt to access another tenant&apos;s data, reverse engineer
              the platform, or use REMBEH for unlawful lending or fraud.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">5. Data &amp; Compliance</h2>
            <p>
              Your organization remains the controller of borrower and operational data you submit. You are
              responsible for obtaining required consents and complying with applicable financial regulations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">6. Contact</h2>
            <p>
              <a className="text-accent-500" href="mailto:hello@antikra.com">hello@antikra.com</a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
