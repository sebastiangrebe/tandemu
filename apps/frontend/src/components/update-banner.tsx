'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import {
  checkForUpdate,
  triggerUpdate,
  getVersion,
  type VersionCheckResult,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArrowUpCircle, ExternalLink, X, RefreshCw } from 'lucide-react';

export function UpdateBanner() {
  const { user } = useAuth();
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [polling, setPolling] = useState(false);

  // SaaS gating — don't render on managed deployments
  const isSaaS = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

  // Only show for OWNER/ADMIN
  const isAdmin =
    user?.role === 'OWNER' || user?.role === 'ADMIN';

  useEffect(() => {
    if (isSaaS || !isAdmin) return;

    checkForUpdate()
      .then((r) => {
        setResult(r);
        // Check if user already dismissed this version
        if (
          r.updateAvailable &&
          r.latest &&
          localStorage.getItem(`tandemu_update_dismissed_${r.latest}`) === '1'
        ) {
          setDismissed(true);
        }
      })
      .catch(() => {});
  }, [isSaaS, isAdmin]);

  const handleDismiss = useCallback(() => {
    if (result?.latest) {
      localStorage.setItem(`tandemu_update_dismissed_${result.latest}`, '1');
    }
    setDismissed(true);
  }, [result]);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateError(null);

    try {
      const res = await triggerUpdate();
      if (!res.triggered) {
        setUpdateError(res.error ?? 'Update failed');
        setUpdating(false);
        return;
      }

      // Poll for version change
      setPolling(true);
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const v = await getVersion();
          if (v.version !== result?.current) {
            clearInterval(interval);
            setPolling(false);
            window.location.reload();
          }
        } catch {
          // Backend might be restarting — keep polling
        }

        // Timeout after 2 minutes
        if (Date.now() - startTime > 120_000) {
          clearInterval(interval);
          setPolling(false);
          setUpdating(false);
          setUpdateError(
            'Update is taking longer than expected. The containers may still be restarting — check back in a moment.',
          );
        }
      }, 5000);
    } catch {
      setUpdateError('Failed to trigger update');
      setUpdating(false);
    }
  }, [result]);

  if (isSaaS || !isAdmin || !result?.updateAvailable || dismissed) {
    return null;
  }

  return (
    <>
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
        <ArrowUpCircle className="h-5 w-5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          {polling ? (
            <p className="text-sm font-medium">
              Updating to v{result.latest}... The app will restart shortly.
            </p>
          ) : (
            <p className="text-sm">
              <span className="font-medium">Tandemu v{result.latest}</span> is
              available{' '}
              <span className="text-muted-foreground">
                (you&apos;re on v{result.current})
              </span>
            </p>
          )}
          {updateError && (
            <p className="text-xs text-destructive mt-1">{updateError}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.releaseUrl && !polling && (
            <Button variant="ghost" size="sm" asChild>
              <a
                href={result.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Release Notes
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
          )}
          {!polling && (
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Update Now
                </>
              )}
            </Button>
          )}
          {polling && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          )}
          {!polling && !updating && (
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Manual instructions dialog (shown when Watchtower fails) */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How to Update</DialogTitle>
            <DialogDescription>
              Run these commands on your server to update Tandemu.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted p-4 font-mono text-sm space-y-1">
            <p className="text-muted-foreground"># Pull latest images</p>
            <p>docker compose pull</p>
            <p className="text-muted-foreground mt-2">
              # Restart with new images
            </p>
            <p>docker compose up -d</p>
            <p className="text-muted-foreground mt-2">
              # Migrations run automatically on startup
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
