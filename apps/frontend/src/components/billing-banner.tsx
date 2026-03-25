'use client';

import { useState } from 'react';
import { X, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { createCheckout } from '@/lib/api';
import { toast } from 'sonner';

export function BillingBanner() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(false);

  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
  const isFree = currentOrg?.planTier === 'FREE';
  const storageKey = currentOrg ? `tandemu_billing_dismissed_${currentOrg.id}` : '';

  const [dismissed, setDismissed] = useState(false);

  // Re-evaluate dismissal when currentOrg becomes available
  const isDismissed = dismissed || (
    typeof window !== 'undefined' && !!storageKey && localStorage.getItem(storageKey) === 'true'
  );

  console.log('[BillingBanner]', { billingEnabled, isFree, isDismissed, planTier: currentOrg?.planTier, orgId: currentOrg?.id });

  if (!billingEnabled || !isFree || isDismissed || !currentOrg) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { url } = await createCheckout({
        organizationId: currentOrg.id,
        planTier: 'PRO',
        successUrl: `${window.location.origin}/settings?billing=success`,
        cancelUrl: window.location.href,
      });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  return (
    <div className="relative rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 sm:px-6 sm:py-4">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pr-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">You&apos;re on the Free plan (1 seat)</p>
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro for $10/seat/month to add team members and unlock full telemetry.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleUpgrade}
          disabled={loading}
          className="shrink-0 sm:ml-auto"
        >
          {loading ? 'Redirecting...' : 'Upgrade to Pro'}
        </Button>
      </div>
    </div>
  );
}
