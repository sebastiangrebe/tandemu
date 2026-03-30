import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Tandemu account to access your AI teammate dashboard.',
  keywords: ['sign in', 'login', 'tandemu', 'AI teammate', 'dashboard'],
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
