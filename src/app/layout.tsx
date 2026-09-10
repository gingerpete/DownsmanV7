import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'The Sussex Downsman Hike 2026 - Sign Up' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-scout-teal text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
