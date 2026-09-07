import React, { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  Plus,
  Calendar,
  Filter,
  Search,
  Pencil,
  Trash2,
  Eye,
  Car,
  TrendingUp,
  Wrench,
  Fuel,
  UserCheck,
  CreditCard,
  FileText,
  X,
  ArrowUpDown,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { getSession } from "@/lib/auth";
import { formatDateDDMMYYYY, formatCurrency } from "@/lib/formatting";
import {
  subscribeDrivingSchoolVehiclesList,
  type DrivingSchoolVehicle,
} from "@/lib/drivingSchoolVehicles";
import {
  subscribeDrivingSchoolExpenses,
  saveDrivingSchoolExpenseRecord,
  deleteDrivingSchoolExpenseRecord,
  EXPENSE_CATEGORIES,
  SALARY_PERIODS,
  PAYMENT_METHODS,
  type DrivingSchoolExpense,
  type ExpenseCategory,
  type SalaryPeriod,
  type PaymentMethod,
} from "@/lib/drivingSchoolExpenses";
import { fetchAllUsers, type UserRecord } from "@/lib/userService";

// Helpers for Indian Rupee format and Date conversion
function parseDDMMYYYYToDate(dStr?: string): Date | null {
  if (!dStr) return null;
  const parts = dStr.split("/");
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (y > 1000 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return new Date(y, m, d);
    }
  }
  return null;
}

function formatDateToDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Fuel: "#f59e0b", // Amber
  Maintenance: "#3b82f6", // Blue
  Repair: "#ef4444", // Red
  Service: "#8b5cf6", // Purple
  Tyres: "#10b981", // Emerald
  Battery: "#ec4899", // Pink
  Insurance: "#6366f1", // Indigo
  Tax: "#14b8a6", // Teal
  PUC: "#84cc16", // Lime
  "Spare Parts": "#f97316", // Orange
  Cleaning: "#06b6d4", // Cyan
  "Driver Salary": "#22c55e", // Green
  Other: "#64748b", // Slate
};

export function DrivingSchoolExpensesView() {
  const session = getSession();
  const isAdmin = session?.role === "admin";

  // Data states
  const [vehicles, setVehicles] = useState<DrivingSchoolVehicle[]>([]);
  const [expenses, setExpenses] = useState<DrivingSchoolExpense[]>([]);
  const [employees, setEmployees] = useState<UserRecord[]>([]);

  // Filter states
  const [dateFilterMode, setDateFilterMode] = useState<
    "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom"
  >("monthly");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Custom date range (DD/MM/YYYY)
  const todayDDMMYYYY = formatDateToDDMMYYYY(new Date());
  const [customFromDate, setCustomFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return formatDateToDDMMYYYY(d);
  });
  const [customToDate, setCustomToDate] = useState<string>(todayDDMMYYYY);

  // Month selector for Monthly view
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Modal states
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<DrivingSchoolExpense | null>(null);
  const [viewDetailModalOpen, setViewDetailModalOpen] = useState(false);
  const [selectedExpenseForView, setSelectedExpenseForView] = useState<DrivingSchoolExpense | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  // Form states
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formCategory, setFormCategory] = useState<ExpenseCategory>("Fuel");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayDDMMYYYY);
  const [formDriverId, setFormDriverId] = useState("");
  const [formDriverName, setFormDriverName] = useState("");
  const [formSalaryPeriod, setFormSalaryPeriod] = useState<SalaryPeriod>("Monthly");
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>("Cash");
  const [formDescription, setFormDescription] = useState("");

  // Realtime listeners
  useEffect(() => {
    const unsubVehicles = subscribeDrivingSchoolVehiclesList((list) => {
      setVehicles(list);
    });
    const unsubExpenses = subscribeDrivingSchoolExpenses((list) => {
      setExpenses(list);
    });
    fetchAllUsers()
      .then((users) => setEmployees(users))
      .catch((err) => console.error("Failed to fetch employees:", err));

    return () => {
      unsubVehicles();
      unsubExpenses();
    };
  }, []);

  // Filter expenses based on Date Mode, Vehicle, Category, Search
  const filteredExpenses = useMemo(() => {
    const now = new Date();

    return expenses.filter((exp) => {
      // 1. Vehicle Filter
      if (selectedVehicleId !== "all" && exp.vehicleId !== selectedVehicleId) {
        return false;
      }

      // 2. Category Filter
      if (selectedCategory !== "all" && exp.category !== selectedCategory) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const vNum = (exp.vehicleNumber || "").toLowerCase();
        const vName = (exp.vehicleName || "").toLowerCase();
        const cat = (exp.category || "").toLowerCase();
        const dName = (exp.driverName || "").toLowerCase();
        const desc = (exp.description || "").toLowerCase();
        const match =
          vNum.includes(q) ||
          vName.includes(q) ||
          cat.includes(q) ||
          dName.includes(q) ||
          desc.includes(q);
        if (!match) return false;
      }

      // 4. Date Filter
      const expDate = parseDDMMYYYYToDate(exp.expenseDate);
      if (!expDate) return false;

      if (dateFilterMode === "daily") {
        const todayStr = formatDateToDDMMYYYY(now);
        return exp.expenseDate === todayStr;
      } else if (dateFilterMode === "weekly") {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        return expDate >= weekAgo && expDate <= now;
      } else if (dateFilterMode === "monthly") {
        return (
          expDate.getMonth() === selectedMonth &&
          expDate.getFullYear() === selectedYear
        );
      } else if (dateFilterMode === "quarterly") {
        const currentQuarter = Math.floor(selectedMonth / 3);
        const expQuarter = Math.floor(expDate.getMonth() / 3);
        return (
          expQuarter === currentQuarter && expDate.getFullYear() === selectedYear
        );
      } else if (dateFilterMode === "yearly") {
        return expDate.getFullYear() === selectedYear;
      } else if (dateFilterMode === "custom") {
        const fromDate = parseDDMMYYYYToDate(customFromDate);
        const toDate = parseDDMMYYYYToDate(customToDate);
        if (fromDate && toDate) {
          toDate.setHours(23, 59, 59, 999);
          return expDate >= fromDate && expDate <= toDate;
        }
      }

      return true;
    });
  }, [
    expenses,
    selectedVehicleId,
    selectedCategory,
    searchQuery,
    dateFilterMode,
    selectedMonth,
    selectedYear,
    customFromDate,
    customToDate,
  ]);

  // Dashboard Summary Computations
  const summary = useMemo(() => {
    let totalExpenses = 0;
    let driverSalaryTotal = 0;
    let maintenanceTotal = 0;
    let fuelTotal = 0;
    let vehicleExpensesTotal = 0;

    const uniqueDates = new Set<string>();

    filteredExpenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      totalExpenses += amt;
      if (e.category === "Driver Salary") driverSalaryTotal += amt;
      if (e.category === "Maintenance" || e.category === "Repair" || e.category === "Service") {
        maintenanceTotal += amt;
      }
      if (e.category === "Fuel") fuelTotal += amt;
      if (selectedVehicleId !== "all" && e.vehicleId === selectedVehicleId) {
        vehicleExpensesTotal += amt;
      }
      if (e.expenseDate) uniqueDates.add(e.expenseDate);
    });

    const activeDays = uniqueDates.size || 1;
    const avgDailyExpense = Math.round(totalExpenses / activeDays);

    return {
      totalExpenses,
      vehicleExpensesTotal:
        selectedVehicleId !== "all" ? vehicleExpensesTotal : totalExpenses,
      driverSalaryTotal,
      maintenanceTotal,
      fuelTotal,
      avgDailyExpense,
    };
  }, [filteredExpenses, selectedVehicleId]);

  // Vehicle-wise Expense Summary Table Data
  const vehicleWiseSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        vehicleId: string;
        vehicleNumber: string;
        vehicleName: string;
        fuel: number;
        maintenance: number;
        salary: number;
        other: number;
        total: number;
      }
    >();

    // Initialize map with all vehicles
    vehicles.forEach((v) => {
      map.set(v.id, {
        vehicleId: v.id,
        vehicleNumber: v.vehicleNumber,
        vehicleName: v.vehicleName,
        fuel: 0,
        maintenance: 0,
        salary: 0,
        other: 0,
        total: 0,
      });
    });

    // Populate with filtered expenses
    filteredExpenses.forEach((e) => {
      let item = map.get(e.vehicleId);
      if (!item) {
        item = {
          vehicleId: e.vehicleId,
          vehicleNumber: e.vehicleNumber || "Unknown",
          vehicleName: e.vehicleName || "Unknown",
          fuel: 0,
          maintenance: 0,
          salary: 0,
          other: 0,
          total: 0,
        };
        map.set(e.vehicleId, item);
      }

      const amt = Number(e.amount) || 0;
      item.total += amt;
      if (e.category === "Fuel") item.fuel += amt;
      else if (
        e.category === "Maintenance" ||
        e.category === "Repair" ||
        e.category === "Service" ||
        e.category === "Tyres" ||
        e.category === "Battery" ||
        e.category === "Spare Parts"
      ) {
        item.maintenance += amt;
      } else if (e.category === "Driver Salary") {
        item.salary += amt;
      } else {
        item.other += amt;
      }
    });

    // If a specific vehicle is selected, only show that vehicle
    const all = Array.from(map.values());
    if (selectedVehicleId !== "all") {
      return all.filter((v) => v.vehicleId === selectedVehicleId);
    }
    return all.filter((v) => v.total > 0 || vehicles.some((veh) => veh.id === v.vehicleId));
  }, [vehicles, filteredExpenses, selectedVehicleId]);

  // Category Breakdown for Pie/Bar Chart
  const categoryBreakdown = useMemo(() => {
    const catMap: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      const cat = e.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + (Number(e.amount) || 0);
    });

    return Object.entries(catMap)
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[name] || "#64748b",
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // Monthly Expense Trend (Last 6 Months or Current Year Months)
  const monthlyExpenseTrend = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const data = months.map((m, idx) => ({
      month: m,
      monthIndex: idx,
      total: 0,
      fuel: 0,
      salary: 0,
      maintenance: 0,
    }));

    expenses.forEach((e) => {
      if (selectedVehicleId !== "all" && e.vehicleId !== selectedVehicleId) {
        return;
      }
      const d = parseDDMMYYYYToDate(e.expenseDate);
      if (d && d.getFullYear() === selectedYear) {
        const mIdx = d.getMonth();
        const amt = Number(e.amount) || 0;
        data[mIdx].total += amt;
        if (e.category === "Fuel") data[mIdx].fuel += amt;
        if (e.category === "Driver Salary") data[mIdx].salary += amt;
        if (
          e.category === "Maintenance" ||
          e.category === "Repair" ||
          e.category === "Service"
        ) {
          data[mIdx].maintenance += amt;
        }
      }
    });

    return data;
  }, [expenses, selectedVehicleId, selectedYear]);

  // Daily Trend for the selected month/view
  const dailyExpenseTrend = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const data: { day: string; dateStr: string; amount: number }[] = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = String(i).padStart(2, "0");
      const monthStr = String(selectedMonth + 1).padStart(2, "0");
      const dateKey = `${dayStr}/${monthStr}/${selectedYear}`;
      data.push({
        day: dayStr,
        dateStr: dateKey,
        amount: 0,
      });
    }

    expenses.forEach((e) => {
      if (selectedVehicleId !== "all" && e.vehicleId !== selectedVehicleId) {
        return;
      }
      const d = parseDDMMYYYYToDate(e.expenseDate);
      if (
        d &&
        d.getMonth() === selectedMonth &&
        d.getFullYear() === selectedYear
      ) {
        const dayNum = d.getDate();
        if (dayNum >= 1 && dayNum <= daysInMonth) {
          data[dayNum - 1].amount += Number(e.amount) || 0;
        }
      }
    });

    return data;
  }, [expenses, selectedVehicleId, selectedMonth, selectedYear]);

  // Open Add/Edit Modal
  const handleOpenAddModal = (expenseToEdit?: DrivingSchoolExpense) => {
    if (expenseToEdit) {
      setEditingExpense(expenseToEdit);
      setFormVehicleId(expenseToEdit.vehicleId);
      setFormCategory(expenseToEdit.category || "Fuel");
      setFormAmount(String(expenseToEdit.amount || ""));
      setFormDate(expenseToEdit.expenseDate || todayDDMMYYYY);
      setFormDriverId(expenseToEdit.driverId || "");
      setFormDriverName(expenseToEdit.driverName || "");
      setFormSalaryPeriod(expenseToEdit.salaryPeriod || "Monthly");
      setFormPaymentMethod(expenseToEdit.paymentMethod || "Cash");
      setFormDescription(expenseToEdit.description || "");
    } else {
      setEditingExpense(null);
      setFormVehicleId(vehicles[0]?.id || "");
      setFormCategory("Fuel");
      setFormAmount("");
      setFormDate(todayDDMMYYYY);
      setFormDriverId("");
      setFormDriverName("");
      setFormSalaryPeriod("Monthly");
      setFormPaymentMethod("Cash");
      setFormDescription("");
    }
    setExpenseModalOpen(true);
  };

  // Save Expense Handler
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formVehicleId) {
      toast.error("Please select a Vehicle");
      return;
    }

    const numAmount = parseFloat(formAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid expense amount greater than 0");
      return;
    }

    if (!formDate || !parseDDMMYYYYToDate(formDate)) {
      toast.error("Please enter a valid expense date in DD/MM/YYYY format");
      return;
    }

    const selectedVeh = vehicles.find((v) => v.id === formVehicleId);
    if (!selectedVeh && !editingExpense) {
      toast.error("Selected vehicle was not found");
      return;
    }

    setSavingExpense(true);
    try {
      const payload: Partial<DrivingSchoolExpense> = {
        vehicleId: formVehicleId,
        vehicleNumber: selectedVeh?.vehicleNumber || editingExpense?.vehicleNumber || "",
        vehicleName: selectedVeh?.vehicleName || editingExpense?.vehicleName || "",
        category: formCategory,
        amount: numAmount,
        expenseDate: formDate,
        driverId: formDriverId,
        driverName: formDriverName,
        salaryPeriod: formCategory === "Driver Salary" ? formSalaryPeriod : undefined,
        paymentMethod: formPaymentMethod,
        description: formDescription,
      };

      await saveDrivingSchoolExpenseRecord(payload, editingExpense?.id);
      toast.success(
        editingExpense ? "Expense updated successfully!" : "Expense recorded successfully!"
      );
      setExpenseModalOpen(false);
    } catch (err: any) {
      console.error("Save expense failed:", err);
      toast.error(err.message || "Failed to save expense record");
    } finally {
      setSavingExpense(false);
    }
  };

  // Delete Expense Handler
  const handleDeleteExpense = async (exp: DrivingSchoolExpense) => {
    if (!isAdmin) {
      toast.error("Only administrators are authorized to delete expense records.");
      return;
    }

    if (
      window.confirm(
        `Are you sure you want to delete this ${exp.category} expense of ₹${exp.amount} for ${exp.vehicleNumber}?`
      )
    ) {
      try {
        await deleteDrivingSchoolExpenseRecord(exp.id);
        toast.success("Expense record deleted successfully");
        if (selectedExpenseForView?.id === exp.id) {
          setViewDetailModalOpen(false);
        }
      } catch (err) {
        console.error("Delete expense failed:", err);
        toast.error("Failed to delete expense record");
      }
    }
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
            <span>Driving School</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span>School Vehicles</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-700">Expenses</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Vehicle Expenses & Financials
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Complete vehicle expense records, driver salary disbursements, maintenance, and analytics.
          </p>
        </div>

        <Button
          onClick={() => handleOpenAddModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </Button>
      </div>

      {/* 2. Dashboard Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Expenses</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-lg font-bold font-mono text-slate-900">
            ₹{summary.totalExpenses.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Selected period</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Vehicle Total</span>
            <Car className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-600">
            ₹{summary.vehicleExpensesTotal.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium truncate">
            {selectedVehicleId === "all" ? "All vehicles" : "Selected vehicle"}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Driver Salary</span>
            <UserCheck className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-lg font-bold font-mono text-violet-600">
            ₹{summary.driverSalaryTotal.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Staff salaries</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Fuel Cost</span>
            <Fuel className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg font-bold font-mono text-amber-600">
            ₹{summary.fuelTotal.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Petrol / Diesel / CNG</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Maintenance</span>
            <Wrench className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg font-bold font-mono text-rose-600">
            ₹{summary.maintenanceTotal.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Service & Repairs</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Daily Avg</span>
            <TrendingUp className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-lg font-bold font-mono text-cyan-600">
            ₹{summary.avgDailyExpense.toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Per active day</p>
        </div>
      </div>

      {/* 3. Filters & Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: "daily", label: "Daily" },
                { id: "weekly", label: "Weekly" },
                { id: "monthly", label: "Monthly" },
                { id: "quarterly", label: "Quarterly" },
                { id: "yearly", label: "Yearly" },
                { id: "custom", label: "Custom Date Range" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDateFilterMode(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  dateFilterMode === tab.id
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Month / Year picker for Monthly view */}
          {dateFilterMode === "monthly" && (
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-700"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-700"
              >
                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Date Inputs (DD/MM/YYYY) */}
          {dateFilterMode === "custom" && (
            <div className="flex items-center gap-2">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1.5">From:</span>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="w-28 text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1.5">To:</span>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="w-28 text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center"
                />
              </div>
            </div>
          )}
        </div>

        {/* Vehicle, Category & Search Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Select Vehicle
            </label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800"
            >
              <option value="all">All Vehicles ({vehicles.length})</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicleNumber} — {v.vehicleName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Expense Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800"
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Search Records
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search vehicle, driver, category, remarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Charts Section: Category Breakdown + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Expense Category Distribution</h3>
              <p className="text-xs text-slate-400 font-medium">
                Distribution by category in selected period
              </p>
            </div>
            <span className="text-xs font-bold font-mono text-blue-600">
              ₹{summary.totalExpenses.toLocaleString("en-IN")} Total
            </span>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs border border-dashed rounded-xl">
              <DollarSign className="w-8 h-8 mb-1 text-slate-300" />
              No expenses recorded for this period
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Amount"]}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Monthly Expense Trend Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Monthly Trend ({selectedYear})
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Monthly expenditure comparison for {selectedVehicleId === "all" ? "all vehicles" : "selected vehicle"}
              </p>
            </div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-700"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyExpenseTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `₹${v >= 1000 ? `${v / 1000}k` : v}`}
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    `₹${Number(val).toLocaleString("en-IN")}`,
                    name === "total"
                      ? "Total"
                      : name === "fuel"
                      ? "Fuel"
                      : name === "salary"
                      ? "Driver Salary"
                      : "Maintenance",
                  ]}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Daily Trend Chart for Selected Month */}
      {dateFilterMode === "monthly" && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Daily Expense Trend ({monthNames[selectedMonth]} {selectedYear})
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Day-by-day expense timeline
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 font-mono">
              Month Total: ₹{summary.totalExpenses.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyExpenseTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `₹${v >= 1000 ? `${v / 1000}k` : v}`}
                />
                <Tooltip
                  labelFormatter={(lbl) => `Day ${lbl} (${monthNames[selectedMonth]})`}
                  formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Expense"]}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#2563eb" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 6. Vehicle-wise Expense Summary Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Vehicle-wise Expense Summary</h3>
            <p className="text-xs text-slate-400 font-medium">
              Aggregated financial breakdown per school vehicle
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-700">
            {vehicleWiseSummary.length} Vehicles
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="p-3">Vehicle</th>
                <th className="p-3 text-right">Fuel</th>
                <th className="p-3 text-right">Maintenance / Service</th>
                <th className="p-3 text-right">Driver Salary</th>
                <th className="p-3 text-right">Other Expenses</th>
                <th className="p-3 text-right">Total Expense</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {vehicleWiseSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    No vehicle expense data found.
                  </td>
                </tr>
              ) : (
                vehicleWiseSummary.map((v) => (
                  <tr key={v.vehicleId} className="hover:bg-slate-50/80">
                    <td className="p-3">
                      <div className="font-mono font-bold text-slate-900">{v.vehicleNumber}</div>
                      <div className="text-[11px] text-slate-500">{v.vehicleName}</div>
                    </td>
                    <td className="p-3 text-right font-mono text-amber-600">
                      ₹{v.fuel.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono text-blue-600">
                      ₹{v.maintenance.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600">
                      ₹{v.salary.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      ₹{v.other.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      ₹{v.total.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {vehicleWiseSummary.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                <tr>
                  <td className="p-3 uppercase text-slate-700">Total Overall</td>
                  <td className="p-3 text-right font-mono text-amber-700">
                    ₹
                    {vehicleWiseSummary
                      .reduce((acc, curr) => acc + curr.fuel, 0)
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="p-3 text-right font-mono text-blue-700">
                    ₹
                    {vehicleWiseSummary
                      .reduce((acc, curr) => acc + curr.maintenance, 0)
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-700">
                    ₹
                    {vehicleWiseSummary
                      .reduce((acc, curr) => acc + curr.salary, 0)
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-700">
                    ₹
                    {vehicleWiseSummary
                      .reduce((acc, curr) => acc + curr.other, 0)
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="p-3 text-right font-mono font-extrabold text-blue-700">
                    ₹
                    {vehicleWiseSummary
                      .reduce((acc, curr) => acc + curr.total, 0)
                      .toLocaleString("en-IN")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 7. Expense Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Expense Records</h3>
            <p className="text-xs text-slate-400 font-medium">
              Individual expense transactions and salary disbursements
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600">
            {filteredExpenses.length} Records Found
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Category</th>
                <th className="p-3">Description / Remarks</th>
                <th className="p-3">Driver / Staff</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Added By</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 space-y-2">
                    <DollarSign className="w-8 h-8 mx-auto text-slate-300" />
                    <div>No expense records found for the selected criteria.</div>
                    <Button
                      onClick={() => handleOpenAddModal()}
                      variant="outline"
                      className="text-xs mt-2"
                    >
                      + Add New Expense
                    </Button>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-semibold text-slate-700">
                      {exp.expenseDate}
                    </td>
                    <td className="p-3">
                      <div className="font-mono font-bold text-slate-900">{exp.vehicleNumber}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {exp.vehicleName}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs"
                        style={{
                          backgroundColor: CATEGORY_COLORS[exp.category] || "#64748b",
                        }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 max-w-[180px] truncate" title={exp.description}>
                      {exp.description || "—"}
                    </td>
                    <td className="p-3">
                      {exp.driverName ? (
                        <div>
                          <span className="font-semibold text-slate-900">{exp.driverName}</span>
                          {exp.salaryPeriod && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              ({exp.salaryPeriod})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 text-sm">
                      ₹{Number(exp.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {exp.paymentMethod || "Cash"}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-500 text-[11px] truncate max-w-[100px]">
                      {exp.createdByName || "System"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExpenseForView(exp);
                            setViewDetailModalOpen(true);
                          }}
                          className="p-1 rounded text-slate-600 hover:bg-slate-100 transition"
                          title="View Expense Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal(exp)}
                          className="p-1 rounded text-blue-600 hover:bg-blue-50 transition"
                          title="Edit Expense"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp)}
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 transition"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 8. ADD / EDIT EXPENSE MODAL */}
      {expenseModalOpen && (
        <div
          onClick={() => setExpenseModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl space-y-5 my-auto p-6 border border-slate-200 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingExpense ? "Edit Vehicle Expense" : "Record Vehicle Expense"}
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  {editingExpense
                    ? "Update the financial transaction record"
                    : "Add an expense or driver salary payment"}
                </p>
              </div>
              <button
                onClick={() => setExpenseModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
              {/* Vehicle Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  SCHOOL VEHICLE <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formVehicleId}
                  onChange={(e) => setFormVehicleId(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900 text-xs"
                >
                  <option value="">-- Select Driving School Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vehicleNumber} — {v.vehicleName} ({v.model || v.vehicleType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    EXPENSE CATEGORY <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900 text-xs"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    AMOUNT (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 1500"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>

              {/* Expense Date (DD/MM/YYYY) & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    EXPENSE DATE (DD/MM/YYYY) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-medium text-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">PAYMENT METHOD</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 text-xs"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Driver Details (Shown for Salary or as optional for vehicle expenses) */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                    {formCategory === "Driver Salary"
                      ? "Driver Salary Information"
                      : "Driver / Staff Associated (Optional)"}
                  </h4>
                  {formCategory === "Driver Salary" && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-md">
                      First-Class Salary
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Driver Name
                    </label>
                    <input
                      type="text"
                      list="employee-drivers-list"
                      placeholder="Enter or select driver name..."
                      value={formDriverName}
                      onChange={(e) => setFormDriverName(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <datalist id="employee-drivers-list">
                      {employees.map((emp) => (
                        <option key={emp.uid || emp.userId} value={emp.fullName} />
                      ))}
                    </datalist>
                  </div>

                  {formCategory === "Driver Salary" && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Salary Period
                      </label>
                      <select
                        value={formSalaryPeriod}
                        onChange={(e) => setFormSalaryPeriod(e.target.value as SalaryPeriod)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                      >
                        {SALARY_PERIODS.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Description / Remarks */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  DESCRIPTION / REMARKS (OPTIONAL)
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter details about this expense or salary payment..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs resize-none"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingExpense}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2 rounded-xl shadow-md shadow-blue-500/20"
                >
                  {savingExpense
                    ? "Saving..."
                    : editingExpense
                    ? "Update Expense"
                    : "Save Expense"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. VIEW EXPENSE DETAIL MODAL */}
      {viewDetailModalOpen && selectedExpenseForView && (
        <div
          onClick={() => setViewDetailModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl space-y-5 my-auto p-6 border border-slate-200 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Expense Record Details</h2>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedExpenseForView.vehicleNumber} • {selectedExpenseForView.expenseDate}
                </p>
              </div>
              <button
                onClick={() => setViewDetailModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Vehicle</span>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {selectedExpenseForView.vehicleNumber}
                  </div>
                  <div className="text-[11px] text-slate-500">{selectedExpenseForView.vehicleName}</div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Amount</span>
                  <div className="text-lg font-bold font-mono text-blue-600">
                    ₹{Number(selectedExpenseForView.amount).toLocaleString("en-IN")}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Category</span>
                  <div className="mt-0.5">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{
                        backgroundColor:
                          CATEGORY_COLORS[selectedExpenseForView.category] || "#64748b",
                      }}
                    >
                      {selectedExpenseForView.category}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Expense Date</span>
                  <div className="text-xs font-bold text-slate-800 font-mono">
                    {selectedExpenseForView.expenseDate}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Payment Method</span>
                  <div className="text-xs font-semibold text-slate-800">
                    {selectedExpenseForView.paymentMethod || "Cash"}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Driver / Staff</span>
                  <div className="text-xs font-semibold text-slate-800">
                    {selectedExpenseForView.driverName || "—"}
                    {selectedExpenseForView.salaryPeriod && (
                      <span className="text-slate-400 ml-1">
                        ({selectedExpenseForView.salaryPeriod})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedExpenseForView.description && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                    Description / Remarks
                  </span>
                  <p className="text-slate-700 italic">{selectedExpenseForView.description}</p>
                </div>
              )}

              {/* Audit info */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Created by: {selectedExpenseForView.createdByName || "System"}</span>
                {selectedExpenseForView.updatedByName && (
                  <span>Updated by: {selectedExpenseForView.updatedByName}</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewDetailModalOpen(false);
                    handleOpenAddModal(selectedExpenseForView);
                  }}
                  className="text-xs flex items-center gap-1.5 rounded-xl"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    onClick={() => handleDeleteExpense(selectedExpenseForView)}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs flex items-center gap-1.5 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
