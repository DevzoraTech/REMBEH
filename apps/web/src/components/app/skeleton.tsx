import {
  AuthCardSkeleton,
  AuthScene,
} from "../auth/auth-scene";

type SkeletonBlockProps = {
  className?: string;
};

export function SkeletonBlock({ className = "" }: SkeletonBlockProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[linear-gradient(90deg,#e1ebe6_0%,#f8fbf9_45%,#e1ebe6_100%)] bg-[length:200%_100%] ${className}`}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="panel overflow-hidden bg-white">
      <div
        className="grid gap-3 border-b border-[var(--line)] bg-[linear-gradient(90deg,var(--soft-mist),#f8fbf9)] px-3 py-2.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} className="h-2.5" />
        ))}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3 px-3 py-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <SkeletonBlock
                key={columnIndex}
                className={`h-3 ${
                  columnIndex === 0
                    ? "w-3/4"
                    : columnIndex === columns - 1
                      ? "ml-auto w-8"
                      : "w-full"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppBootSkeleton() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="grid min-h-screen md:grid-cols-[80px_minmax(0,1fr)]">
        <aside className="hidden bg-[linear-gradient(180deg,#0b172c,#102342_62%,#0f332f)] md:block" />
        <section className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
            <SkeletonBlock className="h-9 w-24" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="panel bg-white p-3">
                <SkeletonBlock className="h-2.5 w-20" />
                <SkeletonBlock className="mt-3 h-5 w-28" />
              </div>
            ))}
          </div>
          <TableSkeleton rows={5} columns={6} />
        </section>
      </div>
    </main>
  );
}

export function AuthPageSkeleton() {
  return (
    <AuthScene>
      <AuthCardSkeleton />
    </AuthScene>
  );
}
