'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SiGoogle, SiGithub } from '@icons-pack/react-simple-icons';
import { toast } from 'sonner';

export default function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register(email, name, password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="h-screen bg-muted">
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-6 lg:justify-start">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="Tandemu"
              width={36}
              height={36}
              className="dark:hidden"
            />
            <Image
              src="/logo-dark.svg"
              alt="Tandemu"
              width={36}
              height={36}
              className="hidden dark:block"
            />
            <span className="text-xl font-bold text-foreground tracking-tight">Tandemu</span>
          </div>

          {/* Card */}
          <div className="flex w-full max-w-sm min-w-sm flex-col gap-y-6 rounded-md border border-muted bg-background px-6 py-8 shadow-md">
            <div>
              <h1 className="text-xl font-semibold">Sign Up</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Log in
                </Link>
              </p>
            </div>

            {/* Social login buttons */}
            <div className="flex flex-col gap-3">
              <Button variant="outline" className="w-full" type="button">
                <SiGoogle className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full" type="button">
                <SiGithub className="mr-2 h-4 w-4" />
                Continue with GitHub
              </Button>
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground uppercase">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Email registration */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                type="text"
                placeholder="Full name"
                className="text-sm"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="email"
                placeholder="Email"
                className="text-sm"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Password (min. 6 characters)"
                className="text-sm"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                className="text-sm"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
