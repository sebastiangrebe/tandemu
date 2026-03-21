import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6", className)}>
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="h-8 w-16 mb-1" />
      <Skeleton className="h-3 w-32 mt-2" />
    </div>
  );
}

export function ChartSkeleton({ className, height = 220 }: { className?: string; height?: number }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6", className)}>
      <Skeleton className="h-5 w-32 mb-1" />
      <Skeleton className="h-3 w-48 mb-4" />
      <Skeleton className="w-full rounded-lg" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6", className)}>
      <Skeleton className="h-5 w-28 mb-1" />
      <Skeleton className="h-3 w-44 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FrictionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border bg-card p-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-10 w-8 mb-1" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-6">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-56 mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4 mb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
