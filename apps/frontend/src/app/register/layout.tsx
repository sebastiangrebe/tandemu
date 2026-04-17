import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create a Tandemu account to get your AI teammate that learns your coding style.',
  keywords: ['sign up', 'register', 'tandemu', 'AI teammate', 'create account'],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
