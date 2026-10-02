/**
 * The compact loading state: Kevin bobbing over an indeterminate bar.
 * Used while auth resolves on protected pages and as the route-level
 * `loading.tsx`. The landing page has its own full intro (IntroLoader).
 */
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col items-center justify-center gap-5 bg-background">
      <div className="page-wash pointer-events-none fixed inset-0 -z-10" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/kevin.webp"
        alt=""
        width={72}
        height={72}
        className="h-[72px] w-[72px] animate-[arcade-float_1.6s_ease-in-out_infinite] [image-rendering:pixelated]"
      />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/3 animate-[loader-slide_1.1s_cubic-bezier(0.65,0,0.35,1)_infinite] rounded-full bg-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}
