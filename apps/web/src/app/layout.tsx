import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REMBEH Financial Software",
  description:
    "REMBEH is financial operations software for branch lending teams, daily cash control, subscriptions, salaries, reporting, and customer operations.",
  icons: {
    icon: "/rembeh-icon.png",
    apple: "/rembeh-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-[family-name:var(--font-sans)]">
        {children}
      </body>
    </html>
  );
}
