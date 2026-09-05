import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { subscribeApplications } from "@/lib/applications";
import { subscribeDrivingSchoolApplications } from "@/lib/drivingSchool";
import { type ApplicationRecord, type VehicleMaster } from "@/lib/applications";
import { formatDate } from "@/lib/formatting";
import {
  Search,
  Filter,
  Calendar,
  ArrowUpDown,
  TrendingUp,
  Coins,
  Users,
  Car,
  ChevronRight,
  TrendingDown,
  Percent,
  FileText,
  Clock,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/dashboard/analytics")({
  component: BusinessAnalytics,
});

type SubModuleFilterType = "all" | "services" | "insurance" | "licence" | "form5" | "driving_school";
type PeriodFilterType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object") {
    if (typeof val.toDate === "function") return val.toDate();
    const seconds = val.seconds ?? val._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  const date = new Date(val);
  return isNaN(date.getTime()) ? null : date;
}

function getStartAndEndDates(period: PeriodFilterType, customFrom?: string, customTo?: string): { start: Date; end: Date } {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  switch (period) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      // Start from Sunday of this week
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      break;
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      end = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
      break;
    case "yearly":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    case "custom":
      if (customFrom) {
        start = new Date(customFrom);
        start.setHours(0, 0, 0, 0);
      } else {
        start.setFullYear(now.getFullYear() - 1); // fallback: 1 year ago
      }
      if (customTo) {
        end = new Date(customTo);
        end.setHours(23, 59, 59, 999);
      } else {
        end = new Date();
      }
      break;
  }
  return { start, end };
}

// Map service names to categories for Vahaan breakdown
function getVahaanCategory(serviceName: string): string {
  const name = serviceName.toLowerCase();
  if (name.includes("permit")) return "Permit";
  if (name.includes("fitness")) return "Fitness";
  if (name.includes("tax")) return "Tax";
  if (name.includes("puc")) return "PUC";
  if (name.includes("hypothecation") || name.includes("noc")) return "Hypothecation";
  if (name.includes("transfer") || name.includes("rc") || name.includes("address") || name.includes("correction") || name.includes("particular") || name.includes("backlog")) return "RC Services";
  return "Other";
}

function BusinessAnalytics() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [drivingSchoolApps, setDrivingSchoolApps] = useState<any[]>([]);
  const [subModuleFilter, setSubModuleFilter] = useState<SubModuleFilterType>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterType>("monthly");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"client" | "vehicle">("client");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [clientSort, setClientSort] = useState<"revenue" | "services" | "average">("revenue");
  const [vehicleSort, setVehicleSort] = useState<"revenue" | "services">("revenue");

  useEffect(() => {
    const unsubApps = subscribeApplications(setApplications);
    const unsubDriving = subscribeDrivingSchoolApplications(setDrivingSchoolApps);
    return () => {
      unsubApps();
      unsubDriving();
    };
  }, []);

  // Compute start/end dates
  const { startDate, endDate } = useMemo(() => {
    const { start, end } = getStartAndEndDates(periodFilter, customFrom, customTo);
    return { startDate: start, endDate: end };
  }, [periodFilter, customFrom, customTo]);

  // Extract all unique group names dynamically
  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>();
    applications.forEach((app) => {
      const gp = app.vehicleDetails?.groupName || app.remarks; // fallback or metadata
      if (gp && gp.trim()) groups.add(gp.trim());
    });
    return Array.from(groups);
  }, [applications]);

  // Unified list of all transaction items (applications + driving school course units)
  const transactionItems = useMemo(() => {
    const items: any[] = [];

    // Parse main applications
    applications.forEach((app) => {
      const status = (app.applicationStatus || "").toLowerCase();
      if (status === "rejected" || app.isDeleted) return;

      const appDate = parseDate(app.createdAt || app.updatedAt) || new Date();
      const submodule = app.subModule || "services"; // default services = Vahaan

      const servicesArray: string[] = Array.isArray(app.services)
        ? app.services
        : app.selectedServices
        ? (Array.isArray(app.selectedServices) ? app.selectedServices : [app.selectedServices])
        : ["General Service"];

      const revenuePerService = (app.amount || 0) / Math.max(1, servicesArray.length);
      const collectedPerService = (app.totalPaid || 0) / Math.max(1, servicesArray.length);
      const outstandingPerService = (app.pendingAmount || 0) / Math.max(1, servicesArray.length);

      servicesArray.forEach((srv) => {
        items.push({
          id: `${app.id}-${srv}`,
          applicationId: app.id,
          clientName: app.ownerName || "Walk-in Client",
          clientId: app.mobileNumber || "unknown",
          phone: app.mobileNumber || "",
          vehicleNumber: (app.vehicleNumber || "").trim().toUpperCase().replace(/[\s-]/g, ""),
          groupName: app.vehicleDetails?.groupName || "None",
          subModule: submodule,
          service: srv,
          revenue: revenuePerService,
          collected: collectedPerService,
          outstanding: outstandingPerService,
          date: appDate,
          rawStatus: app.applicationStatus,
        });
      });
    });

    // Parse driving school applications
    drivingSchoolApps.forEach((app) => {
      const status = (app.status || "").toLowerCase();
      if (status === "rejected" || app.isDeleted) return;

      const appDate = parseDate(app.createdAt || app.updatedAt) || new Date();

      items.push({
        id: app.id,
        applicationId: app.id,
        clientName: app.studentName || "Driving Student",
        clientId: app.mobileNumber || "ds-unknown",
        phone: app.mobileNumber || "",
        vehicleNumber: "DRIVING SCHOOL",
        groupName: "Driving School",
        subModule: "driving_school",
        service: app.courseType || "Driving School Course",
        revenue: app.amount || 0,
        collected: app.totalPaid || 0,
        outstanding: (app.amount || 0) - (app.totalPaid || 0),
        date: appDate,
        rawStatus: app.status,
      });
    });

    return items;
  }, [applications, drivingSchoolApps]);

  // Apply filters: Submodule, Group, Date range, Search query
  const filteredItems = useMemo(() => {
    return transactionItems.filter((item) => {
      // 1. Submodule filter
      if (subModuleFilter !== "all" && item.subModule !== subModuleFilter) return false;

      // 2. Group name filter
      if (groupFilter !== "all" && item.groupName !== groupFilter) return false;

      // 3. Date range filter
      if (item.date < startDate || item.date > endDate) return false;

      // 4. Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesClient = item.clientName.toLowerCase().includes(q);
        const matchesVehicle = item.vehicleNumber.toLowerCase().includes(q);
        const matchesPhone = item.phone.includes(q);
        const matchesGroup = item.groupName.toLowerCase().includes(q);
        if (!matchesClient && !matchesVehicle && !matchesPhone && !matchesGroup) return false;
      }

      return true;
    });
  }, [transactionItems, subModuleFilter, groupFilter, startDate, endDate, searchQuery]);

  // Calculate Last Month boundaries to fetch comparative numbers
  const lastMonthDates = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }, []);

  const thisMonthDates = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, []);

  // Client-wise aggregation
  const clientAnalytics = useMemo(() => {
    const clientsMap = new Map<string, any>();

    filteredItems.forEach((item) => {
      const key = item.clientName;
      if (!clientsMap.has(key)) {
        clientsMap.set(key, {
          clientName: item.clientName,
          clientId: item.clientId,
          phone: item.phone,
          groupName: item.groupName,
          totalServices: 0,
          servicesThisMonth: 0,
          servicesLastMonth: 0,
          totalRevenue: 0,
          totalCollected: 0,
          totalOutstanding: 0,
          lastServiceDate: item.date,
          servicesMap: new Map<string, number>(),
          revenueMap: new Map<string, number>(),
          uniqueMonths: new Set<string>(),
        });
      }

      const client = clientsMap.get(key);
      client.totalServices += 1;
      client.totalRevenue += item.revenue;
      client.totalCollected += item.collected;
      client.totalOutstanding += item.outstanding;

      if (item.date > client.lastServiceDate) {
        client.lastServiceDate = item.date;
      }

      // Track active months (e.g. "2026-08")
      const monthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;
      client.uniqueMonths.add(monthKey);

      // Increment service & revenue breakdown
      const cat = item.subModule === "services" ? getVahaanCategory(item.service) : item.subModule.toUpperCase();
      client.servicesMap.set(cat, (client.servicesMap.get(cat) || 0) + 1);
      client.revenueMap.set(cat, (client.revenueMap.get(cat) || 0) + item.revenue);
    });

    // Fetch this month / last month services from unfiltered items
    transactionItems.forEach((item) => {
      const key = item.clientName;
      if (clientsMap.has(key)) {
        const client = clientsMap.get(key);
        if (item.date >= thisMonthDates.start && item.date <= thisMonthDates.end) {
          client.servicesThisMonth += 1;
        } else if (item.date >= lastMonthDates.start && item.date <= lastMonthDates.end) {
          client.servicesLastMonth += 1;
        }
      }
    });

    // Convert Map to array and finalize averages
    return Array.from(clientsMap.values()).map((c) => {
      const activeMonths = Math.max(1, c.uniqueMonths.size);
      return {
        ...c,
        averageMonthlyBusiness: c.totalRevenue / activeMonths,
        serviceBreakdown: (Array.from(c.servicesMap.entries()) as [any, any][]).map(([name, count]) => ({
          name,
          count,
          revenue: c.revenueMap.get(name) || 0,
        })),
      };
    }).sort((a, b) => {
      if (clientSort === "revenue") return b.totalRevenue - a.totalRevenue;
      if (clientSort === "services") return b.totalServices - a.totalServices;
      return b.averageMonthlyBusiness - a.averageMonthlyBusiness;
    });
  }, [filteredItems, transactionItems, thisMonthDates, lastMonthDates, clientSort]);

  // Vehicle-wise aggregation
  const vehicleAnalytics = useMemo(() => {
    const vehiclesMap = new Map<string, any>();

    filteredItems.forEach((item) => {
      if (item.vehicleNumber === "DRIVING SCHOOL" || !item.vehicleNumber) return;

      const key = item.vehicleNumber;
      if (!vehiclesMap.has(key)) {
        vehiclesMap.set(key, {
          vehicleNumber: key,
          ownerName: item.clientName,
          groupName: item.groupName,
          totalServices: 0,
          servicesThisMonth: 0,
          servicesLastMonth: 0,
          totalRevenue: 0,
          totalCollected: 0,
          totalOutstanding: 0,
          lastServiceDate: item.date,
          uniqueMonths: new Set<string>(),
        });
      }

      const vehicle = vehiclesMap.get(key);
      vehicle.totalServices += 1;
      vehicle.totalRevenue += item.revenue;
      vehicle.totalCollected += item.collected;
      vehicle.totalOutstanding += item.outstanding;

      if (item.date > vehicle.lastServiceDate) {
        vehicle.lastServiceDate = item.date;
      }

      const monthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;
      vehicle.uniqueMonths.add(monthKey);
    });

    // Populate comparisons
    transactionItems.forEach((item) => {
      const key = item.vehicleNumber;
      if (vehiclesMap.has(key)) {
        const vehicle = vehiclesMap.get(key);
        if (item.date >= thisMonthDates.start && item.date <= thisMonthDates.end) {
          vehicle.servicesThisMonth += 1;
        } else if (item.date >= lastMonthDates.start && item.date <= lastMonthDates.end) {
          vehicle.servicesLastMonth += 1;
        }
      }
    });

    return Array.from(vehiclesMap.values()).map((v) => {
      const activeMonths = Math.max(1, v.uniqueMonths.size);
      return {
        ...v,
        averageMonthlyBusiness: v.totalRevenue / activeMonths,
      };
    }).sort((a, b) => {
      if (vehicleSort === "revenue") return b.totalRevenue - a.totalRevenue;
      return b.totalServices - a.totalServices;
    });
  }, [filteredItems, transactionItems, thisMonthDates, lastMonthDates, vehicleSort]);

  // Overall metrics cards
  const totalStats = useMemo(() => {
    let revenue = 0;
    let collected = 0;
    let outstanding = 0;
    let services = 0;

    filteredItems.forEach((item) => {
      revenue += item.revenue;
      collected += item.collected;
      outstanding += item.outstanding;
      services += 1;
    });

    return { revenue, collected, outstanding, services };
  }, [filteredItems]);

  // Charts mapping: Monthly Trends
  const monthlyChartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const yearMap = new Map<string, { month: string; revenue: number; services: number }>();
    const currentYear = new Date().getFullYear();

    months.forEach((m, idx) => {
      yearMap.set(`${currentYear}-${idx}`, { month: m, revenue: 0, services: 0 });
    });

    filteredItems.forEach((item) => {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}`;
      if (yearMap.has(key)) {
        const data = yearMap.get(key)!;
        data.revenue += item.revenue;
        data.services += 1;
      }
    });

    return Array.from(yearMap.values());
  }, [filteredItems]);

  // Pie chart submodule shares
  const submoduleDistribution = useMemo(() => {
    const shares = new Map<string, { name: string; value: number }>();
    const labelMap: Record<string, string> = {
      services: "Vahaan",
      insurance: "Insurance",
      licence: "Licence",
      form5: "Form 5",
      driving_school: "Driving School",
    };

    filteredItems.forEach((item) => {
      const label = labelMap[item.subModule] || item.subModule;
      if (!shares.has(label)) {
        shares.set(label, { name: label, value: 0 });
      }
      shares.get(label)!.value += item.revenue;
    });

    return Array.from(shares.values());
  }, [filteredItems]);

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

  return (
    <div className="p-6 space-y-6 text-xs bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Client & Vehicle Analytics</h1>
          <p className="text-slate-500 font-medium">Derived from real-time applications, service logs, and accounting transactions.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "client" ? "default" : "outline"}
            className="text-[11px] font-bold"
            size="sm"
            onClick={() => setViewMode("client")}
          >
            <Users className="size-3.5 mr-1" />
            Client View
          </Button>
          <Button
            variant={viewMode === "vehicle" ? "default" : "outline"}
            className="text-[11px] font-bold"
            size="sm"
            onClick={() => setViewMode("vehicle")}
          >
            <Car className="size-3.5 mr-1" />
            Vehicle View
          </Button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {[
            { value: "all", label: "All Modules" },
            { value: "services", label: "Vahaan" },
            { value: "insurance", label: "Insurance" },
            { value: "licence", label: "Licence" },
            { value: "form5", label: "Form 5" },
            { value: "driving_school", label: "Driving School" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSubModuleFilter(tab.value as SubModuleFilterType)}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all text-[11px]",
                subModuleFilter === tab.value
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Group Name filter */}
        <div className="flex items-center gap-2">
          <Label htmlFor="groupFilter" className="text-[10px] uppercase font-bold text-slate-500">Group:</Label>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger id="groupFilter" className="w-[140px] h-7 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {uniqueGroups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filters: Period & Search */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client, vehicle, phone or group..."
            className="pl-9 text-xs"
          />
        </div>

        {/* Period Picker */}
        <div className="flex items-center gap-2">
          <Label htmlFor="period" className="text-[10px] uppercase font-bold text-slate-500 shrink-0">Analysis Period:</Label>
          <Select value={periodFilter} onValueChange={(val) => setPeriodFilter(val as PeriodFilterType)}>
            <SelectTrigger id="period" className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily (Today)</SelectItem>
              <SelectItem value="weekly">Weekly (This Week)</SelectItem>
              <SelectItem value="monthly">Monthly (This Month)</SelectItem>
              <SelectItem value="quarterly">Quarterly (This Quarter)</SelectItem>
              <SelectItem value="yearly">Yearly (This Year)</SelectItem>
              <SelectItem value="custom">Custom Date Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom Range Fields */}
        {periodFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 text-xs"
            />
            <span className="text-slate-400 font-bold">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        )}
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-500">Total Services</CardTitle>
            <Clock className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-slate-900">{totalStats.services}</div>
            <p className="text-[10px] text-slate-500 mt-1">Processed transactions in filter range</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-500">Total Revenue</CardTitle>
            <Coins className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-blue-600">₹{totalStats.revenue.toLocaleString()}</div>
            <p className="text-[10px] text-slate-500 mt-1">Booked fees/charges total</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-500">Collected</CardTitle>
            <TrendingUp className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-emerald-600">₹{totalStats.collected.toLocaleString()}</div>
            <p className="text-[10px] text-slate-500 mt-1">Amount paid by customers</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-500">Outstanding</CardTitle>
            <TrendingDown className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-amber-600">₹{totalStats.outstanding.toLocaleString()}</div>
            <p className="text-[10px] text-slate-500 mt-1">Unpaid / remaining balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Dynamic charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Revenue Trend */}
        <Card className="col-span-2 shadow-sm border border-slate-200">
          <CardHeader className="p-4">
            <CardTitle className="text-xs font-bold text-slate-800">Monthly Revenue Trend</CardTitle>
            <CardDescription className="text-[10px]">Monthly aggregate of transaction fee receipts</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] p-4 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyChartData}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip formatter={(value) => `₹${value}`} />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fillOpacity={0.1} fill="#3b82f6" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Submodule share */}
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4">
            <CardTitle className="text-xs font-bold text-slate-800">Revenue Distribution</CardTitle>
            <CardDescription className="text-[10px]">Distribution by CRM submodule</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] p-4 pt-0 flex flex-col justify-between">
            {submoduleDistribution.length > 0 ? (
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={submoduleDistribution} innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                      {submoduleDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${value}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">No data to display shares</div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[10px] font-semibold">
              {submoduleDistribution.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-slate-600">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Listing View */}
      {viewMode === "client" ? (
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold text-slate-800">Top Client Rankings</CardTitle>
              <CardDescription className="text-[10px]">Ranked based on total generation</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="clientSort" className="text-[9px] uppercase font-bold text-slate-500">Sort By:</Label>
              <Select value={clientSort} onValueChange={(val) => setClientSort(val as any)}>
                <SelectTrigger id="clientSort" className="w-[120px] h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Highest Revenue</SelectItem>
                  <SelectItem value="services">Total Services</SelectItem>
                  <SelectItem value="average">Avg Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-100/50 text-[10px] uppercase font-bold text-slate-500">
                  <th className="p-3 text-center">Rank</th>
                  <th className="p-3">Client / Customer Name</th>
                  <th className="p-3">Group</th>
                  <th className="p-3 text-center">Total Services</th>
                  <th className="p-3 text-center">This Month</th>
                  <th className="p-3 text-center">Last Month</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Collected</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-center">Last Active</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientAnalytics.map((c, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-800">
                      <div>{c.clientName}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{c.phone || "—"}</div>
                    </td>
                    <td className="p-3 text-slate-500 font-medium">{c.groupName}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700">{c.totalServices}</td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-500">{c.servicesThisMonth}</td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-500">{c.servicesLastMonth}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">₹{c.totalRevenue.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">₹{c.totalCollected.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-semibold text-rose-500">₹{c.totalOutstanding.toLocaleString()}</td>
                    <td className="p-3 text-center text-slate-500 font-mono">{formatDate(c.lastServiceDate)}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-[10px] text-blue-600"
                        onClick={() => setSelectedClient(c)}
                      >
                        Details
                        <ChevronRight className="size-3 ml-0.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {clientAnalytics.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                      No client transactions match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold text-slate-800">Vehicle Operations Rankings</CardTitle>
              <CardDescription className="text-[10px]">Ranked based on service occurrences and bookings</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="vehicleSort" className="text-[9px] uppercase font-bold text-slate-500">Sort By:</Label>
              <Select value={vehicleSort} onValueChange={(val) => setVehicleSort(val as any)}>
                <SelectTrigger id="vehicleSort" className="w-[120px] h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Highest Revenue</SelectItem>
                  <SelectItem value="services">Total Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-100/50 text-[10px] uppercase font-bold text-slate-500">
                  <th className="p-3 text-center">Rank</th>
                  <th className="p-3">Vehicle Number</th>
                  <th className="p-3">Owner / Client</th>
                  <th className="p-3">Group</th>
                  <th className="p-3 text-center">Services</th>
                  <th className="p-3 text-center">This Month</th>
                  <th className="p-3 text-center">Last Month</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Collected</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-center">Last Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicleAnalytics.map((v, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{v.vehicleNumber}</td>
                    <td className="p-3 font-semibold text-slate-700">{v.ownerName}</td>
                    <td className="p-3 text-slate-500 font-medium">{v.groupName}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700">{v.totalServices}</td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-500">{v.servicesThisMonth}</td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-500">{v.servicesLastMonth}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">₹{v.totalRevenue.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">₹{v.totalCollected.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-semibold text-rose-500">₹{v.totalOutstanding.toLocaleString()}</td>
                    <td className="p-3 text-center text-slate-500 font-mono">{formatDate(v.lastServiceDate)}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-[10px] text-blue-600"
                        onClick={() => setSelectedVehicle(v)}
                      >
                        History
                        <ChevronRight className="size-3 ml-0.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {vehicleAnalytics.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-slate-400 italic">
                      No vehicle transactions match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Client Detail View Dialog */}
      {selectedClient && (
        <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
          <DialogContent className="max-w-2xl sm:max-w-3xl overflow-y-auto max-h-[85vh] text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Users className="size-4 text-blue-600" />
                Client Profile: {selectedClient.clientName}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-3">
              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Phone</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5">{selectedClient.phone || "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Group Name</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5">{selectedClient.groupName || "None"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Last Active</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5 font-mono">{formatDate(selectedClient.lastServiceDate)}</p>
                </div>
              </div>

              {/* Financial metrics block */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Revenue</span>
                  <p className="text-sm font-black text-slate-800 mt-1 font-mono">₹{selectedClient.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Collected</span>
                  <p className="text-sm font-black text-emerald-600 mt-1 font-mono">₹{selectedClient.totalCollected.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Outstanding</span>
                  <p className="text-sm font-black text-rose-600 mt-1 font-mono">₹{selectedClient.totalOutstanding.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Avg Monthly Business</span>
                  <p className="text-sm font-black text-blue-600 mt-1 font-mono">₹{Math.round(selectedClient.averageMonthlyBusiness).toLocaleString()}</p>
                </div>
              </div>

              {/* Category distribution breakdown */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Service Breakdown</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50 font-bold text-slate-500">
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5 text-center">Service Count</th>
                        <th className="p-2.5 text-right">Revenue Generated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClient.serviceBreakdown.map((b: any, bIdx: number) => (
                        <tr key={bIdx} className="border-b last:border-b-0 hover:bg-slate-50/50">
                          <td className="p-2.5 font-semibold text-slate-700">{b.name}</td>
                          <td className="p-2.5 text-center font-mono">{b.count}</td>
                          <td className="p-2.5 text-right font-mono font-bold">₹{b.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Client Vehicles summary */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Associated Vehicles</h4>
                <div className="flex flex-wrap gap-2">
                  {filteredItems
                    .filter((item) => item.clientName === selectedClient.clientName && item.vehicleNumber !== "DRIVING SCHOOL")
                    .reduce((acc, curr) => {
                      if (!acc.includes(curr.vehicleNumber)) acc.push(curr.vehicleNumber);
                      return acc;
                    }, [] as string[])
                    .map((vh: string, vhIdx: number) => (
                      <span key={vhIdx} className="px-3 py-1.5 rounded-lg border bg-white font-mono font-bold text-slate-700 shadow-sm">
                        {vh}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Vehicle Detail View Dialog */}
      {selectedVehicle && (
        <Dialog open={!!selectedVehicle} onOpenChange={(open) => !open && setSelectedVehicle(null)}>
          <DialogContent className="max-w-2xl sm:max-w-3xl overflow-y-auto max-h-[85vh] text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Car className="size-4 text-blue-600" />
                Vehicle Profile: {selectedVehicle.vehicleNumber}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-3">
              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Owner</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5">{selectedVehicle.ownerName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Group Name</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5">{selectedVehicle.groupName || "None"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Last Active</span>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5 font-mono">{formatDate(selectedVehicle.lastServiceDate)}</p>
                </div>
              </div>

              {/* Financial metrics block */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Revenue</span>
                  <p className="text-sm font-black text-slate-800 mt-1 font-mono">₹{selectedVehicle.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Collected</span>
                  <p className="text-sm font-black text-emerald-600 mt-1 font-mono">₹{selectedVehicle.totalCollected.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Outstanding</span>
                  <p className="text-sm font-black text-rose-600 mt-1 font-mono">₹{selectedVehicle.totalOutstanding.toLocaleString()}</p>
                </div>
                <div className="p-3 border border-slate-100 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Avg Monthly Business</span>
                  <p className="text-sm font-black text-blue-600 mt-1 font-mono">₹{Math.round(selectedVehicle.averageMonthlyBusiness).toLocaleString()}</p>
                </div>
              </div>

              {/* History list */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Service History</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50 font-bold text-slate-500">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Submodule</th>
                        <th className="p-2.5">Service</th>
                        <th className="p-2.5 text-right">Amount</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems
                        .filter((item) => item.vehicleNumber === selectedVehicle.vehicleNumber)
                        .map((history, hIdx) => (
                          <tr key={hIdx} className="border-b last:border-b-0 hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono text-slate-500">{formatDate(history.date)}</td>
                            <td className="p-2.5 font-medium text-slate-600 capitalize">{history.subModule === "services" ? "Vahaan" : history.subModule}</td>
                            <td className="p-2.5 font-semibold text-slate-700">{history.service}</td>
                            <td className="p-2.5 text-right font-mono font-bold">₹{history.revenue.toLocaleString()}</td>
                            <td className="p-2.5 text-center">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                  (history.rawStatus || "").toLowerCase() === "approved" || (history.rawStatus || "").toLowerCase() === "completed"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                )}
                              >
                                {history.rawStatus || "Active"}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
