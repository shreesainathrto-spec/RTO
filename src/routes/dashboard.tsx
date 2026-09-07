import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CheckSquare,
  UserCircle,
  BarChart3,
  DollarSign,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Globe,
  Target,
  Users2,
  Shield,
  ShieldCheck,
  CheckCircle,
  Lightbulb,
  FileText,
  Zap,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Car,
} from "lucide-react";
import { getSession, logout, isAuthReady, type StaffUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword } from "@/lib/userService";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
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

    if (!getSession()) {
      throw redirect({ to: "/" });
    }
  },
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { heading: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    heading: "Operational",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/dashboard/applications", label: "Applications", icon: FileText },
      { to: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
      { to: "/dashboard/service/all", label: "In RTO Services", icon: Zap },
      { to: "/dashboard/task-templates", label: "Task Templates", icon: FileText },
      { to: "/dashboard/clients", label: "Customers", icon: Users },
    ],
  },
  {
    heading: "Driving School",
    items: [
      { to: "/dashboard/driving-school/vehicles", label: "School Vehicles", icon: Car },
    ],
  },
  {
    heading: "Financial",
    items: [
      { to: "/dashboard/accounting", label: "Accounting", icon: DollarSign },
      { to: "/dashboard/billing", label: "Billing", icon: Receipt },
      { to: "/dashboard/targets", label: "Target Management", icon: Target },
      { to: "/dashboard/analytics", label: "Business Analytics", icon: BarChart3 },
    ],
  },
  {
    heading: "System",
    items: [
      { to: "/dashboard/employees", label: "Employee Management", icon: Users2 },
      { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function DashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<StaffUser | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("erp_sidebar_collapsed") === "true";
    }
    return false;
  });
  const sidebarRef = useRef<HTMLElement>(null);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("erp_sidebar_collapsed", String(next));
      return next;
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    setChanging(true);
    try {
      await changeOwnPassword(newPassword);
      toast.success("Password changed successfully!");
      setShowChangePassword(false);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password.");
    } finally {
      setChanging(false);
    }
  };

  useEffect(() => {
    setUser(getSession());
    const handler = () => setUser(getSession());
    window.addEventListener("auth-change", handler);
    return () => window.removeEventListener("auth-change", handler);
  }, []);

  // Restore scroll position when layout mounts or route changes
  useEffect(() => {
    const restore = () => {
      if (sidebarRef.current) {
        const savedPosition = localStorage.getItem("sidebarScrollPosition");
        if (savedPosition) {
          const parsed = Number(savedPosition);
          sidebarRef.current.scrollTop = parsed;
          console.log("[Sidebar] Restoring Position:", parsed);
        }
      }
    };

    restore();
    // Defer passes to account for layout shifts and render lag
    const t1 = setTimeout(restore, 50);
    const t2 = setTimeout(restore, 150);

    // Scroll main content to top on pathname changes
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTop = 0;
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  const handleSidebarScroll = (e: React.UIEvent<HTMLElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    localStorage.setItem("sidebarScrollPosition", scrollTop.toString());
    console.log("[Sidebar] Saving Position:", scrollTop);
  };

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/" });
  };

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background">
      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-40 h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-300 ease-in-out overflow-hidden shrink-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-0 lg:p-0 lg:border-r-0" : "lg:w-64",
          "w-64"
        )}
      >
        <div className={cn("p-4 flex items-center justify-between border-b border-sidebar-border", collapsed && "lg:justify-center lg:px-2")}>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground shrink-0">
              R
            </div>
            {!collapsed && <div className="font-bold tracking-tight text-sm truncate">REGISTRY PRO</div>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex size-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>

        <nav
          ref={sidebarRef}
          onScroll={handleSidebarScroll}
          className="flex-1 overflow-y-auto p-2 space-y-4"
        >
          {GROUPS.map((group) => {
            const isAdmin = user?.role === "admin";
            
            let filteredItems = group.items.filter((item) => {
              if (item.to === "/dashboard/employees") return isAdmin;
              if (item.to === "/dashboard/settings" || item.to.startsWith("/dashboard/settings/")) return isAdmin;
              return true;
            });

            if (filteredItems.length === 0) return null;

            return (
              <div key={group.heading}>
                {!collapsed && (
                  <div className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase truncate">
                    {group.heading}
                  </div>
                )}
                <div className="space-y-1">
                  {filteredItems.map((item) => {
                    const active = item.exact
                      ? pathname === item.to
                      : pathname === item.to || pathname.startsWith(item.to + "/");
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-border/40 hover:text-sidebar-foreground",
                          collapsed && "lg:justify-center lg:px-0"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2 space-y-2">
          <a
            href="/"
            title={collapsed ? "View public site" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-border/40 hover:text-sidebar-foreground",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <Globe className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">View public site</span>}
          </a>
          <div className={cn("flex items-center gap-1.5 px-2 py-2", collapsed && "lg:justify-center lg:px-0")}>
            <div className="size-8 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{user?.name ?? "—"}</div>
                <div className="text-[10px] text-sidebar-foreground/60 capitalize truncate">{user?.role}</div>
              </div>
            )}
            {!collapsed && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setShowChangePassword(true)} title="Change Password" className="size-7">
                  <KeyRound className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out" className="size-7">
                  <LogOut className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </aside>

      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter a new secure password for your account. Min 6 characters.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pass">New Password</Label>
              <Input
                id="new-pass"
                type="password"
                placeholder="******"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowChangePassword(false)} disabled={changing}>
                Cancel
              </Button>
              <Button type="submit" disabled={changing}>
                {changing ? "Changing..." : "Change Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-14 border-b bg-card flex items-center gap-3 px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex size-8 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
          </Button>
          <h1 className="font-semibold">
            {ALL_ITEMS.find((n) =>
              n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/"),
            )?.label ?? "Dashboard"}
          </h1>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
