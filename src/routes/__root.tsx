import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { initAuth, type StaffUser } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n";
import { useForceCapitals } from "@/hooks/useForceCapitals";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Registry Pro — Office Dashboard" },
      {
        name: "description",
        content:
          "Office dashboard for RTO services: track clients, leads, renewals and applications.",
      },
      { name: "author", content: "Registry Pro" },
      { property: "og:title", content: "Registry Pro — Office Dashboard" },
      {
        property: "og:description",
        content:
          "Office dashboard for RTO services: track clients, leads, renewals and applications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [authReady, setAuthReady] = useState(false);
  const [authFallbackElapsed, setAuthFallbackElapsed] = useState(false);
  const forceCaps = useForceCapitals();

  // Sync the force-caps CSS class on <body> whenever the setting changes
  useEffect(() => {
    document.body.classList.toggle("force-caps-on", forceCaps);
  }, [forceCaps]);

  useEffect(() => {
    const unsub = initAuth(() => setAuthReady(true));
    return unsub;
  }, []);

  // If auth initialization takes too long (network/cordova issues), don't block
  // app rendering forever — proceed after a short fallback so site becomes usable.
  useEffect(() => {
    const t = setTimeout(() => setAuthFallbackElapsed(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Global error handlers to avoid blank white-screen on unhandled errors
  const [fatalError, setFatalError] = useState<Error | null>(null);
  useEffect(() => {
    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", ev.reason);
      try {
        const err = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
        setFatalError(err);
      } catch {
        setFatalError(new Error("Unknown error"));
      }
    };
    const onError = (ev: ErrorEvent) => {
      console.error("Global error:", ev.error || ev.message);
      setFatalError(ev.error instanceof Error ? ev.error : new Error(ev.message));
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection as any);
    window.addEventListener("error", onError as any);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection as any);
      window.removeEventListener("error", onError as any);
    };
  }, []);

  if (fatalError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-xl w-full text-center border rounded-lg p-6 bg-card">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground my-3">
            An unexpected error occurred. You can try refreshing the page or returning to the
            dashboard.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded"
            >
              Reload
            </button>
            <a href="/" className="inline-flex items-center px-4 py-2 border rounded">
              Go home
            </a>
          </div>
          <pre className="text-xs text-muted-foreground mt-4 text-left overflow-auto max-h-40">
            {String(fatalError && fatalError.stack)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        {authReady || authFallbackElapsed ? (
          <Outlet />
        ) : (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <div className="size-10 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground animate-pulse">
                R
              </div>
              <p className="text-sm text-muted-foreground">Starting up…</p>
            </div>
          </div>
        )}
        <Toaster />
      </QueryClientProvider>
    </LanguageProvider>
  );
}
