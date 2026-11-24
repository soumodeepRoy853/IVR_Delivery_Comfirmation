import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IVR Delivery Confirmation',
  description: 'Trigger automated delivery confirmation calls and review responses.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
