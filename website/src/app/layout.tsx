import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'REMBEH — Financial Management System',
  description:
    'Peace in every decision. REMBEH is the multi-tenant financial operations platform for lending institutions — field agents, loan applications, collections, Smile ID, and daily close. Built by ANTIKRA Mechanism.',
  keywords: [
    'REMBEH',
    'financial management',
    'lending software',
    'loan collections',
    'field agent app',
    'ANTIKRA',
    'Uganda',
  ],
  openGraph: {
    title: 'REMBEH — Financial Management System',
    description: 'Peace in every decision. Lending operations for field agents and managers.',
    type: 'website',
    siteName: 'REMBEH',
    images: [{ url: '/icon.png', width: 1024, height: 1024 }],
  },
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-brand-900">{children}</body>
    </html>
  );
}
