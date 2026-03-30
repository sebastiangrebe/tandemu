import Image from 'next/image';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo with pulse animation */}
        <div className="relative">
          <div className="absolute -inset-4 animate-ping rounded-full bg-primary/5" style={{ animationDuration: '2s' }} />
          <div className="relative">
            <Image
              src="/logo.svg"
              alt="Tandemu"
              width={48}
              height={48}
              className="dark:hidden"
            />
            <Image
              src="/logo-dark.svg"
              alt="Tandemu"
              width={48}
              height={48}
              className="hidden dark:block"
            />
          </div>
        </div>

        {/* Brand name */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-foreground">Tandemu</span>
          <span className="text-sm text-muted-foreground">AI Teammate Platform</span>
        </div>

        {/* Loading bar */}
        <div className="relative w-48 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 w-[40%] rounded-full bg-foreground/80"
            style={{
              animation: 'indeterminate 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes indeterminate {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}
