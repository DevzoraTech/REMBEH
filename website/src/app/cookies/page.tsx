import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — REMBEH',
  description: 'How REMBEH uses cookies and similar technologies.',
};

export default function CookiePolicy() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <a href="/" className="text-sm font-medium text-accent-500 hover:text-accent-600">
          ← Back to REMBEH
        </a>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-brand-900 mb-2">Cookie Policy</h1>
        <p className="text-sm text-brand-500 mb-12">Last updated: July 20, 2026</p>

        <div className="space-y-8 text-brand-700 leading-relaxed text-sm">
          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">1. What Are Cookies</h2>
            <p>
              Cookies and similar technologies (local storage, session storage) help websites remember
              preferences and keep sessions secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">2. How REMBEH Uses Them</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Essential:</strong> authentication session tokens for the web app login
              </li>
              <li>
                <strong>Preferences:</strong> UI preferences such as remembered workspace context
              </li>
              <li>
                <strong>This marketing site:</strong> primarily static; no advertising trackers by default
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-900 mb-3">3. Control</h2>
            <p>
              You can clear cookies and site data in your browser settings. Disabling essential cookies may
              prevent signing in to the REMBEH web app.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
