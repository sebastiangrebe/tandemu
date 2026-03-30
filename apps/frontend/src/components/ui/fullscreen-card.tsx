'use client';

import { useState, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FullscreenCardProps {
  children: React.ReactNode;
}

export function FullscreenCard({ children }: FullscreenCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const close = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullscreen, close]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-end p-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-6 pb-6">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
        onClick={() => setIsFullscreen(true)}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      {children}
    </div>
  );
}
