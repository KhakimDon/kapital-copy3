import React from "react";

/** Last line of defense: a crashed page must never blank the whole app.
 *  Shows a readable card with the error message and a reload button; the
 *  error also lands in the console for reporting. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label ?? "app"}] page crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-3xl">😵</div>
        <div className="text-sm font-semibold">Sahifada xatolik yuz berdi</div>
        <pre className="max-w-full overflow-x-auto rounded-lg bg-muted px-3 py-2 text-left text-[11px] text-muted-foreground">
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Qayta yuklash
        </button>
      </div>
    );
  }
}
