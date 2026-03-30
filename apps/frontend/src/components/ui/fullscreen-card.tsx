'use client';

import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FullscreenCardProps {
  children: React.ReactNode;
}

export function FullscreenCard({ children }: FullscreenCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-auto p-6">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10"
          onClick={() => setIsFullscreen(false)}
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
        <div className="h-full">{children}</div>
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
