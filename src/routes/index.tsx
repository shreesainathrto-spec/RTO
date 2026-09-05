import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { login, getSession, isAuthReady } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    if (!isAuthReady()) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (isAuthReady()) {
            clearInterval(interval);
            resolve();
          }
        }, 30);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 3000);
      });
    }

    if (getSession()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Staff Login — Registry Pro" },
      { name: "description", content: "Secure staff login for the Registry Pro office dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      const code = (err as any)?.code ?? "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        setError("Invalid username or password.");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between p-12 bg-foreground text-background">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground">
            R
          </div>
          <span className="font-semibold tracking-tight">REGISTRY PRO</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            The office <span className="text-primary">command center</span> for RTO operations.
          </h1>
          <p className="text-background/70 max-w-md">
            Track every application, renewal and document — from first inquiry to final delivery.
          </p>
        </div>
        <div className="text-xs text-background/50">© {new Date().getFullYear()} Registry Pro</div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="size-10 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground">
              R
            </div>
            <span className="font-semibold tracking-tight">REGISTRY PRO</span>
          </div>
          <h2 className="text-2xl font-bold">Staff Login</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to access the office dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
