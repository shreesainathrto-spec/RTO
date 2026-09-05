import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  TrendingUp,
  AlertCircle,
  Loader2,
  Edit2,
  Target as TargetIcon,
  CheckCircle2,
  Clock,
  Calendar,
  Zap,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSession } from "@/lib/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  subscribeToTargets,
  updateTargetValue,
  createOrInitializeTarget,
  deleteTarget,
  type TargetMetrics,
} from "@/lib/targets";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/targets")({
  component: TargetsPage,
});

export const SUBMODULE_SERVICES: Record<SubModuleType, string[]> = {
  services: [
    "RC Transfer of Ownership",
    "Duplicate RC",
    "Change Address",
    "Registration Renewal",
    "RC Particular",
    "Vahaan RC Sudharo Vadhro",
    "Backlog",
    "Hypothecation Addition",
    "Hypothecation Terminate",
    "Hypothecation Continue",
    "No Objection Certificate",
    "Fitness Renewal RTO",
    "Fitness Renewal ATS",
    "Duplicate Fitness Certificate",
    "Gujarat Permit",
    "National Permit (Gujarat Permit)",
    "Gujarat Permit Renewal",
    "National Permit (Gujarat Permit) Renewal",
    "Vehicle Alteration",
    "Vehicle Conversion",
    "Tax",
    "PUC",
    "Tax Detail Update"
  ],
  licence: [
    "Issue Of Duplicate DL",
    "Change Of Address In DL",
    "Change Of Name In DL",
    "Photo & Signature Change",
    "Hazardous Material Endorsement",
    "DL Replacement",
    "DL Extract",
    "Hazardous Training Card",
    "International Licence",
    "Change Date Of Birth In DL",
    "DL Renew"
  ],
  insurance: [
    "Insurance"
  ],
  form5: [
    "Form 5 New HGV",
    "Form 5A Renew HGV"
  ],
  driving_school: [
    "Driving School Course"
  ]
};

const getServiceColor = (service: string, targetColor?: string) => {
  if (targetColor) return targetColor;
  const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#6366f1", "#38bdf8", "#14b8a6", "#f97316", "#ef4444"];
  let hash = 0;
  for (let i = 0; i < service.length; i++) {
    hash = service.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

function TargetsPage() {
  const session = getSession();
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");
  const [targets, setTargets] = useState<TargetMetrics[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetMetrics | null>(null);
  const [error, setError] = useState("");
  const [selectedService, setSelectedService] = useState("");

  const isAdmin = session?.role === "admin";

  // Subscribe to real-time collections
  useEffect(() => {
    setIsLoading(true);
    let targetsLoaded = false;
    let servicesLoaded = false;
    let employeesLoaded = false;

    const checkLoaded = () => {
      if (targetsLoaded && servicesLoaded && employeesLoaded) {
        setIsLoading(false);
      }
    };

    const unsubTargets = subscribeToTargets((data) => {
      setTargets(data);
      targetsLoaded = true;
      checkLoaded();
    });

    const unsubServices = onSnapshot(collection(db, "registry_services_v2"), (snap) => {
      setServices(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      servicesLoaded = true;
      checkLoaded();
    });

    const unsubEmployees = onSnapshot(collection(db, "users"), (snap) => {
      setEmployees(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      employeesLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubTargets();
      unsubServices();
      unsubEmployees();
    };
  }, []);

  // Filter targets by active submodule
  const filteredTargets = useMemo(() => {
    return targets.filter((t) => (t.submodule || "services") === activeSubModule);
  }, [targets, activeSubModule]);

  // Top Card Computations
  const totalTargets = useMemo(() => {
    return filteredTargets.reduce((sum, t) => sum + (t.target || 0), 0);
  }, [filteredTargets]);

  const totalAchieved = useMemo(() => {
    return filteredTargets.reduce((sum, t) => sum + t.completed, 0);
  }, [filteredTargets]);

  const totalRemaining = useMemo(() => {
    return Math.max(0, totalTargets - totalAchieved);
  }, [totalTargets, totalAchieved]);

  const overallAchievementPercent = useMemo(() => {
    return totalTargets > 0 ? Math.round((totalAchieved / totalTargets) * 100) : 0;
  }, [totalTargets, totalAchieved]);

  const completedThisMonth = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return services.filter((s: any) => {
      if ((s.subModule || "services") !== activeSubModule) return false;
      if (s.taskStatus !== "Completed" && s.status !== "Completed") return false;
      const date = s.createdAt || s.updatedAt || s.date ? new Date(s.createdAt || s.updatedAt || s.date) : null;
      if (!date || isNaN(date.getTime())) return false;
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;
  }, [services, activeSubModule]);

  const completedToday = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return services.filter((s: any) => {
      if ((s.subModule || "services") !== activeSubModule) return false;
      if (s.taskStatus !== "Completed" && s.status !== "Completed") return false;
      const date = s.createdAt || s.updatedAt || s.date ? new Date(s.createdAt || s.updatedAt || s.date) : null;
      if (!date || isNaN(date.getTime())) return false;
      return (
        date.getDate() === currentDay &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    }).length;
  }, [services, activeSubModule]);

  // Employee Performance Table Mappings (filtered by active submodule)
  const employeePerformance = useMemo(() => {
    return employees
      .map((emp) => {
        const empServices = services.filter((s: any) => {
          if ((s.subModule || "services") !== activeSubModule) return false;
          return (
            s.employeeId === emp.employeeId ||
            s.assignedTo === emp.id ||
            s.assignedStaff === emp.fullName ||
            s.assignee === emp.username
          );
        });
        const completed = empServices.filter((s: any) => s.taskStatus === "Completed" || s.status === "Completed").length;
        const pending = empServices.filter((s: any) => s.taskStatus !== "Completed" && s.status !== "Completed").length;
        const total = completed + pending;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          name: emp.fullName || emp.name || emp.username || "Unknown",
          total,
          completed,
          pending,
          rate,
        };
      })
      .filter((e) => e.total > 0)
      .sort((a, b) => b.completed - a.completed);
  }, [employees, services, activeSubModule]);

  // Recharts Computations
  const monthlyData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    return months.map((monthName, index) => {
      const achieved = services.filter((s: any) => {
        if ((s.subModule || "services") !== activeSubModule) return false;
        if (s.taskStatus !== "Completed" && s.status !== "Completed") return false;
        const date = s.createdAt || s.updatedAt || s.date ? new Date(s.createdAt || s.updatedAt || s.date) : null;
        if (!date || isNaN(date.getTime())) return false;
        return date.getMonth() === index && date.getFullYear() === currentYear;
      }).length;

      return {
        name: monthName,
        Target: totalTargets / 12 || 10,
        Achieved: achieved,
      };
    });
  }, [services, totalTargets, activeSubModule]);

  const pieData = useMemo(() => {
    return filteredTargets
      .map((t) => ({
        name: t.service,
        value: t.completed,
      }))
      .filter((d) => d.value > 0);
  }, [filteredTargets]);

  const progressChartData = useMemo(() => {
    return filteredTargets.map((t) => ({
      name: t.service,
      Progress: t.achievementPercentage,
    }));
  }, [filteredTargets]);

  const dailyData = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const count = services.filter((s: any) => {
        if ((s.subModule || "services") !== activeSubModule) return false;
        if (s.taskStatus !== "Completed" && s.status !== "Completed") return false;
        const sDate = s.createdAt || s.updatedAt || s.date ? new Date(s.createdAt || s.updatedAt || s.date) : null;
        if (!sDate || isNaN(sDate.getTime())) return false;
        return (
          sDate.getDate() === d.getDate() &&
          sDate.getMonth() === d.getMonth() &&
          sDate.getFullYear() === d.getFullYear()
        );
      }).length;

      return {
        name: dateStr,
        Completed: count,
      };
    });
  }, [services, activeSubModule]);

  const employeeChartData = useMemo(() => {
    return employeePerformance.map((emp) => ({
      name: emp.name,
      Completed: emp.completed,
      Pending: emp.pending,
    }));
  }, [employeePerformance]);

  const handleAddNew = () => {
    setEditingTarget(null);
    setShowForm(true);
    setError("");
  };

  const handleEdit = (target: TargetMetrics) => {
    setEditingTarget(target);
    setShowForm(true);
    setError("");
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this target configuration?")) {
      try {
        await deleteTarget(id);
        toast.success("Target configuration deleted successfully!");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete target";
        toast.error(msg);
        setError(msg);
      }
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTarget(null);
    setError("");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Target Dashboard...</p>
      </div>
    );
  }

  const activeServices = SUBMODULE_SERVICES[activeSubModule] || [];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Target Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise target configurations, completion rates, and real-time submodule performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button onClick={handleAddNew} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90">
              <Plus className="size-4" />
              Configure Target
            </Button>
          )}
        </div>
      </div>

      {/* Submodule tabs */}
      <div className="flex justify-start">
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Top Cards Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total Targets", value: totalTargets, icon: TargetIcon, color: "text-blue-600 bg-blue-50" },
          { label: "Total Achieved", value: totalAchieved, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Remaining", value: totalRemaining, icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Achievement %", value: `${overallAchievementPercent}%`, icon: TrendingUp, color: "text-indigo-600 bg-indigo-50" },
          { label: "This Month", value: completedThisMonth, icon: Calendar, color: "text-cyan-600 bg-cyan-50" },
          { label: "Today's Services", value: completedToday, icon: Zap, color: "text-rose-600 bg-rose-50" },
        ].map((c, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</span>
              <div className={`p-1.5 rounded-lg ${c.color.split(" ")[1]}`}>
                <c.icon className={`size-4 ${c.color.split(" ")[0]}`} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl font-bold tracking-tight">{c.value}</h2>
            </div>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Service Performance Registry</h3>
          <span className="text-xs text-muted-foreground font-medium">Updated just now</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b bg-slate-100/50 text-[10px] uppercase font-bold text-muted-foreground">
                <th className="p-3">Service</th>
                <th className="p-3 text-center">Period</th>
                <th className="p-3 text-center">Target</th>
                <th className="p-3 text-center">Completed</th>
                <th className="p-3 text-center">Remaining</th>
                <th className="p-3">Progress</th>
                <th className="p-3 text-center">Status</th>
                {isAdmin && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTargets.map((target) => {
                const completedVal = target.completed;
                const targetVal = target.target;
                const remainingVal = Math.max(0, targetVal - completedVal);
                const percent = targetVal > 0 ? Math.round((completedVal / targetVal) * 100) : 0;
                
                let statusBadge = "Not Started";
                let statusColor = "bg-gray-100 text-gray-700";
                if (targetVal > 0) {
                  if (completedVal === 0) {
                    statusBadge = "Not Started";
                    statusColor = "bg-gray-100 text-gray-700";
                  } else if (percent > 100) {
                    statusBadge = "Exceeded";
                    statusColor = "bg-indigo-100 text-indigo-700";
                  } else if (percent === 100) {
                    statusBadge = "Target Achieved";
                    statusColor = "bg-emerald-100 text-emerald-700";
                  } else {
                    statusBadge = "Behind Target";
                    statusColor = "bg-rose-100 text-rose-700";
                  }
                } else {
                  statusBadge = "No Target";
                  statusColor = "bg-gray-100 text-gray-700";
                }

                const srvColor = getServiceColor(target.service, target.color);

                return (
                  <tr key={target.id} className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: srvColor }} />
                      {target.service}
                    </td>
                    <td className="p-3 text-center font-medium text-slate-500 capitalize">{target.period || "Monthly"}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700">{targetVal || "—"}</td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-600">{completedVal}</td>
                    <td className="p-3 text-center font-mono font-semibold text-amber-600">{targetVal > 0 ? remainingVal : "—"}</td>
                    <td className="p-3 min-w-[150px]">
                      {targetVal > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(percent, 100)}%`,
                                backgroundColor: srvColor,
                              }}
                            />
                          </div>
                          <span className="font-semibold text-slate-600 font-mono w-8">{percent}%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">No target configured</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>
                        {statusBadge}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(target)}
                          >
                            <Edit2 className="size-3.5 text-muted-foreground hover:text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                            onClick={() => handleDelete(target.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredTargets.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">
                    No targets configured for this submodule. Click "Configure Target" to set one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid for Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Chart 1: Monthly Targets vs Achievements */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4">Monthly Achievement Trend</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Achieved" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completed Services" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Service Wise Share */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Service Completion Share</h4>
          {pieData.length > 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={getServiceColor(entry.name) || "#ccc"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-16 text-xs text-muted-foreground">No completions registered yet.</div>
          )}
        </div>

        {/* Chart 3: Horizontal Progress */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4">Achievement Progress</h4>
          {progressChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={progressChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="Progress" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-20 text-xs text-muted-foreground">No targets configured yet.</div>
          )}
        </div>

        {/* Chart 4: Daily Completion Trend */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4">Daily Trend (Last 7 Days)</h4>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Line type="monotone" dataKey="Completed" stroke="#ec4899" strokeWidth={2} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid for Employee Performance */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Employee Chart */}
        <div className="rounded-xl border bg-card p-4 shadow-sm md:col-span-1">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4">Employee Output Distribution</h4>
          {employeeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={employeeChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Completed" fill="#10b981" stackId="a" />
                <Bar dataKey="Pending" fill="#f59e0b" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-20 text-xs text-muted-foreground">No active employee assignments.</div>
          )}
        </div>

        {/* Employee Table */}
        <div className="rounded-xl border bg-card shadow-sm md:col-span-2 overflow-hidden flex flex-col justify-between">
          <div className="p-4 border-b bg-slate-50">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Employee Achievements</h4>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-100/50 text-[10px] uppercase font-bold text-muted-foreground">
                  <th className="p-3">Employee Name</th>
                  <th className="p-3 text-center">Total Assigned</th>
                  <th className="p-3 text-center">Completed</th>
                  <th className="p-3 text-center">Pending</th>
                  <th className="p-3 text-right">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {employeePerformance.map((emp) => (
                  <tr key={emp.name} className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">{emp.name}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-600">{emp.total}</td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-600">{emp.completed}</td>
                    <td className="p-3 text-center font-mono font-semibold text-amber-600">{emp.pending}</td>
                    <td className="p-3 text-right font-mono font-bold text-primary">{emp.rate}%</td>
                  </tr>
                ))}
                {employeePerformance.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No active tasks assigned to staff.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Configuration Form Dialog */}
      <TargetFormDialog
        open={showForm}
        onOpenChange={handleFormClose}
        editingTarget={editingTarget}
        preselectedSubModule={activeSubModule}
        preselectedService={selectedService}
        onSuccess={handleFormClose}
        onError={setError}
      />
    </div>
  );
}

// ─── Target Form Dialog Rebuilt ────────────────────────────────────────────────
interface TargetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTarget: TargetMetrics | null;
  preselectedSubModule: SubModuleType;
  preselectedService: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function TargetFormDialog({
  open,
  onOpenChange,
  editingTarget,
  preselectedSubModule,
  preselectedService,
  onSuccess,
  onError,
}: TargetFormDialogProps) {
  const session = getSession();
  const [selectedSubModule, setSelectedSubModule] = useState<SubModuleType>("services");
  const [selectedService, setSelectedService] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("Monthly");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [color, setColor] = useState("");
  const [status, setStatus] = useState("Active");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (editingTarget) {
      setSelectedSubModule((editingTarget.submodule || "services") as SubModuleType);
      setSelectedService(editingTarget.service || editingTarget.category || "");
      setSelectedPeriod(editingTarget.period || "Monthly");
      setTargetQuantity(String(editingTarget.target || ""));
      setStartDate(editingTarget.startDate || "");
      setEndDate(editingTarget.endDate || "");
      setColor(editingTarget.color || getServiceColor(editingTarget.service || "") || "");
      setStatus(editingTarget.status || "Active");
    } else {
      setSelectedSubModule(preselectedSubModule);
      setSelectedService(preselectedService);
      setSelectedPeriod("Monthly");
      setTargetQuantity("");
      setStartDate("");
      setEndDate("");
      setColor(preselectedService ? getServiceColor(preselectedService) : "");
      setStatus("Active");
    }
    setLocalError("");
  }, [editingTarget, preselectedSubModule, preselectedService, open]);

  // Sync service selection color
  useEffect(() => {
    if (selectedService && !editingTarget) {
      setColor(getServiceColor(selectedService));
    }
  }, [selectedService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!selectedSubModule) {
      setLocalError("Please select a submodule");
      return;
    }

    if (!selectedService) {
      setLocalError("Please select a service");
      return;
    }

    const tQty = parseInt(targetQuantity, 10);
    if (isNaN(tQty) || tQty <= 0) {
      setLocalError("Please enter a valid target quantity");
      return;
    }

    if (!session) {
      setLocalError("Not authenticated");
      return;
    }

    setIsSubmitting(true);

    try {
      const extraData: any = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        color: color || undefined,
        status: status || undefined,
      };

      if (editingTarget) {
        await updateTargetValue(editingTarget.id, tQty, session.username, extraData);
        toast.success("Target updated successfully!");
      } else {
        await createOrInitializeTarget(
          selectedSubModule,
          selectedService,
          selectedPeriod,
          tQty,
          session.username,
          extraData
        );
        toast.success("Target created successfully!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save target";
      setLocalError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const servicesForSelectedSubModule = SUBMODULE_SERVICES[selectedSubModule] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTarget ? "Configure Target" : "Set New Service Target"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {localError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Submodule */}
            <div className="space-y-1">
              <Label htmlFor="submodule" className="text-[11px] font-semibold text-slate-700">Submodule *</Label>
              <Select
                value={selectedSubModule}
                onValueChange={(val) => {
                  setSelectedSubModule(val as SubModuleType);
                  setSelectedService(""); // Reset service on submodule change
                }}
                disabled={!!editingTarget}
              >
                <SelectTrigger id="submodule">
                  <SelectValue placeholder="Select submodule..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="services">Vahaan</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="licence">Licence</SelectItem>
                  <SelectItem value="form5">Form 5</SelectItem>
                  <SelectItem value="driving_school">Driving School</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Service */}
            <div className="space-y-1">
              <Label htmlFor="service" className="text-[11px] font-semibold text-slate-700">Service *</Label>
              <Select
                value={selectedService}
                onValueChange={(val) => setSelectedService(val)}
                disabled={!!editingTarget}
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder="Select service..." />
                </SelectTrigger>
                <SelectContent>
                  {servicesForSelectedSubModule.map((srv) => (
                    <SelectItem key={srv} value={srv}>
                      {srv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Period */}
            <div className="space-y-1">
              <Label htmlFor="period" className="text-[11px] font-semibold text-slate-700">Period *</Label>
              <Select
                value={selectedPeriod}
                onValueChange={(val) => setSelectedPeriod(val)}
                disabled={!!editingTarget}
              >
                <SelectTrigger id="period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target Quantity */}
            <div className="space-y-1">
              <Label htmlFor="target" className="text-[11px] font-semibold text-slate-700">Target Quantity *</Label>
              <Input
                id="target"
                type="number"
                min="1"
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(e.target.value)}
                placeholder="e.g. 100"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start Date */}
            <div className="space-y-1">
              <Label htmlFor="start" className="text-[11px] font-semibold text-slate-700">Start Date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <Label htmlFor="end" className="text-[11px] font-semibold text-slate-700">End Date</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Chart Color hex */}
            <div className="space-y-1">
              <Label htmlFor="color" className="text-[11px] font-semibold text-slate-700">Chart Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="color"
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#3b82f6"
                  disabled={isSubmitting}
                  className="font-mono w-28"
                />
                <input
                  type="color"
                  value={color || "#3b82f6"}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={isSubmitting}
                  className="w-8 h-8 rounded border p-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <Label htmlFor="status" className="text-[11px] font-semibold text-slate-700">Status</Label>
              <Select value={status} onValueChange={(val) => setStatus(val)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="h-9">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 h-9">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editingTarget ? (
                "Update Configuration"
              ) : (
                "Create Target"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

