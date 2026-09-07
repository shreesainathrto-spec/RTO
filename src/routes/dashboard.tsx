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
  Bell,
  Check,
  Clock,
  ExternalLink,
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
import {
  subscribeUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  playNotificationSound,
  type AppNotification,
} from "@/lib/notifications";
import { formatDateDDMMYYYY } from "@/lib/formatting";

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
      { to: "/dashboard/driving-school/expenses", label: "Vehicle Expenses", icon: DollarSign },
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

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getSession());
    const handler = () => setUser(getSession());
    window.addEventListener("auth-change", handler);
    return () => window.removeEventListener("auth-change", handler);
  }, []);

  // Subscribe to real-time notifications for current logged-in employee
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeUserNotifications(user, (items, newArrivals) => {
      setNotifications(items);
      if (newArrivals > 0) {
        playNotificationSound();
        const latest = items.find((i) => !i.read);
        if (latest) {
          toast.info(latest.title, {
            description: latest.message,
          });
        }
      }
    });

    return () => unsub();
  }, [user?.uid, user?.username, user?.employeeId, user?.name]);

  // Close notifications dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (item: AppNotification) => {
    if (!item.read) {
      await markNotificationAsRead(item.id);
    }
    setNotifOpen(false);
    const subModuleParam = item.subModule && item.subModule !== "services" ? `?subModule=${item.subModule}` : "";
    navigate({ to: `/dashboard/tasks${subModuleParam}` });
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(user);
  };

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

          <div className="ml-auto flex items-center gap-2">
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifContainerRef}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative size-9 text-muted-foreground hover:text-foreground rounded-full"
                title="Notifications"
                aria-label="View task notifications"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white ring-2 ring-background animate-pulse">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border bg-card text-card-foreground shadow-2xl z-50 overflow-hidden flex flex-col max-h-[480px] animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="p-3 border-b bg-muted/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="size-4 text-primary" />
                      <span className="font-semibold text-sm">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[11px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded-full">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                      >
                        <Check className="size-3" /> Mark all read
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto flex-1 divide-y divide-border">
                    {notifications.length === 0 ? (
                      <div className="py-10 px-4 text-center">
                        <Bell className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-xs font-medium text-muted-foreground">No notifications yet</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          Task assignments will appear here in real-time.
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={cn(
                              "p-3 text-left transition-colors cursor-pointer hover:bg-muted/60 relative group flex gap-3 items-start",
                              !n.read ? "bg-primary/5" : "bg-card"
                            )}
                          >
                            <div className={cn(
                              "size-2 rounded-full mt-1.5 shrink-0",
                              !n.read ? "bg-primary" : "bg-transparent"
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={cn(
                                  "text-xs truncate",
                                  !n.read ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                                )}>
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                                  <Clock className="size-2.5" />
                                  {formatDateDDMMYYYY(n.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {n.message}
                              </p>
                              {n.assignedBy && (
                                <p className="text-[10px] text-muted-foreground/70 mt-1">
                                  By: {n.assignedBy}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-2 border-t bg-muted/20 text-center">
                      <Link
                        to="/dashboard/tasks"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                      >
                        View all tasks <ExternalLink className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
