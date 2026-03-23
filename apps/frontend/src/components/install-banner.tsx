export function InstallBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-foreground text-background px-6 py-10 sm:px-10 sm:py-12">
      <div className="relative z-10 flex flex-col items-center text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Connect Claude Code to your dashboard.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-background/70 max-w-md">
          One install. An AI that remembers. Metrics that matter.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-background/20 bg-background/10 px-4 py-2.5 font-mono text-sm">
          <span className="text-background/50">$</span>
          <span>curl -fsSL <strong>get.tandemu.dev</strong> | sh</span>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <a
            href="https://tandemu.dev/docs"
            className="text-sm font-medium text-background/70 hover:text-background transition-colors inline-flex items-center gap-1"
          >
            Read the Docs <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h40v40H0z\' fill=\'none\' stroke=\'white\' stroke-width=\'1\'/%3E%3C/svg%3E")',
        }}
      />
    </div>
  );
}
