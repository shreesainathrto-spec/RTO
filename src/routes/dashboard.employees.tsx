import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAllUsers,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeAssignedTasksCount,
  setEmployeeStatus,
  resetEmployeePassword,
  logEmployeeAction,
  type UserRecord,
  type EmployeeAuditLog,
} from "@/lib/userService";
import { getSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/formatting";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  ShieldAlert,
  User,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  KeyRound,
  Trash2,
  Power,
  Activity,
  UserCheck2,
  Lock,
  Copy,
  Printer,
  EyeOff,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const session = getSession();
  const isAuthorized = session && session.role === "admin";

  if (!isAuthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  const [employees, setEmployees] = useState<UserRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<EmployeeAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<UserRecord | null>(null);
  const [viewEmployeeOpen, setViewEmployeeOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editEmployee, setEditEmployee] = useState<UserRecord | null>(null);
  const [showSuccessCredentials, setShowSuccessCredentials] = useState<{
    show: boolean;
    employeeId: string;
    username: string;
    password:  string;
  } | null>(null);

  useEffect(() => {
    if (!selectedEmployee) {
      setShowPassword(false);
    }
  }, [selectedEmployee]);
  
  // Delete PIN verification & confirmation modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<UserRecord | null>(null);
  const [assignedTaskCount, setAssignedTaskCount] = useState<number>(0);
  const [fetchingTaskCount, setFetchingTaskCount] = useState(false);

  // Form states for Create/Edit
  const [addForm, setAddForm] = useState({
    fullName: "",
    username: "",
    email: "",
    mobile: "",
    department: "",
    designation: "",
    role: "employee" as "admin" | "manager" | "employee" | "viewer",
    password: "",
    confirmPassword: "",
    status: "active" as "active" | "inactive",
  });

  const [editForm, setEditForm] = useState({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    mobile: "",
    employeeId: "",
    department: "",
    designation: "",
    role: "employee" as "admin" | "manager" | "employee" | "viewer",
    status: "active" as "active" | "inactive",
  });

  // Subscriptions to employees and audit logs
  useEffect(() => {
    // Sync users
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, userId: d.id, ...d.data() }) as UserRecord);
      setEmployees(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to sync users:", err);
      setLoading(false);
    });

    // Sync audit logs
    const qAudit = query(collection(db, "employee_audit_logs"), orderBy("timestamp", "desc"));
    const unsubAudit = onSnapshot(qAudit, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EmployeeAuditLog);
      setAuditLogs(list);
    }, (err) => {
      console.error("Failed to sync audit logs:", err);
    });

    return () => {
      unsubUsers();
      unsubAudit();
    };
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.status === "active").length;
    const inactive = employees.filter((e) => e.status === "inactive").length;
    const managers = employees.filter((e) => e.role === "manager").length;
    const staff = employees.filter((e) => e.role === "employee").length;
    return { total, active, inactive, managers, staff };
  }, [employees]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => e.department && set.add(e.department));
    return Array.from(set);
  }, [employees]);

  // Filtered List
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      // Search logic
      const search = searchQuery.toLowerCase().trim();
      const nameMatch = e.fullName?.toLowerCase().includes(search);
      const idMatch = e.employeeId?.toLowerCase().includes(search);
      const unameMatch = e.username?.toLowerCase().includes(search);
      const mobileMatch = e.mobile?.toLowerCase().includes(search);
      if (search && !(nameMatch || idMatch || unameMatch || mobileMatch)) return false;

      // Dropdowns
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (deptFilter !== "all" && e.department !== deptFilter) return false;

      return true;
    });
  }, [employees, searchQuery, roleFilter, statusFilter, deptFilter]);

  // Actions
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.fullName.trim()) return toast.error("Full name is required");
    if (!addForm.username.trim()) return toast.error("Username is required");

    // Validate email before submitting
    const email = addForm.email.trim();
    if (!email) {
      toast.error("Email is required");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Invalid email.");
      return;
    }
    const domain = email.split("@")[1];
    if (!domain || !domain.includes(".")) {
      toast.error("Invalid email.");
      return;
    }
    const domainParts = domain.split(".");
    if (domainParts.length < 2 || domainParts.some((part) => !part.trim())) {
      toast.error("Invalid email.");
      return;
    }

    if (!addForm.password) {
      toast.error("Password is required");
      return;
    }
    if (addForm.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (addForm.password !== addForm.confirmPassword) {
      toast.error("Confirm password does not match.");
      return;
    }

    try {
      await createEmployee({
        fullName: addForm.fullName,
        username: addForm.username,
        email: addForm.email,
        mobile: addForm.mobile,
        department: addForm.department,
        designation: addForm.designation,
        role: addForm.role,
        password: addForm.password,
        status: addForm.status,
      });
      setShowAdd(false);
      // Clear form
      setAddForm({
        fullName: "",
        username: "",
        email: "",
        mobile: "",
        department: "",
        designation: "",
        role: "employee",
        password: "",
        confirmPassword: "",
        status: "active",
      });
      toast.success("Employee created successfully!");
    } catch (err: any) {
      console.error("Employee creation failed:", err);
      toast.error(err.message || "Failed to create employee");
    }
  };

  const handleOpenEdit = (emp: UserRecord) => {
    if (emp.employeeId === "Boss001" || emp.username === "admin") {
      toast.error("Cannot edit permanent admin account");
      return;
    }
    setEditEmployee(emp);
    setEditForm({
      fullName: emp.fullName || "",
      username: emp.username || "",
      password: "",
      confirmPassword: "",
      email: emp.email || "",
      mobile: emp.mobile || "",
      employeeId: emp.employeeId || "",
      department: emp.department || "",
      designation: emp.designation || "",
      role: emp.role || "employee",
      status: emp.status || "active",
    });
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmployee) return;

    // Username uniqueness check
    const trimmedUsername = editForm.username.trim().toLowerCase();
    if (!trimmedUsername) {
      toast.error("Username is required.");
      return;
    }
    const isDupUsername = employees.some(
      (emp) => emp.uid !== editEmployee.uid && (emp.username || "").toLowerCase() === trimmedUsername
    );
    if (isDupUsername) {
      toast.error(`Username "${editForm.username.trim()}" is already taken by another employee.`);
      return;
    }

    // Employee ID uniqueness check
    const trimmedEmpId = editForm.employeeId.trim().toLowerCase();
    if (!trimmedEmpId) {
      toast.error("Employee ID is required.");
      return;
    }
    const isDupEmpId = employees.some(
      (emp) => emp.uid !== editEmployee.uid && (emp.employeeId || "").toLowerCase() === trimmedEmpId
    );
    if (isDupEmpId) {
      toast.error(`Employee ID "${editForm.employeeId.trim()}" is already assigned to another employee.`);
      return;
    }

    // Password validation if entered
    if (editForm.password.trim() !== "") {
      if (editForm.password.trim().length < 6) {
        toast.error("Password must be at least 6 characters long.");
        return;
      }
      if (editForm.password !== editForm.confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }
    }

    try {
      await updateEmployee(editEmployee.uid, editForm);
      setEditEmployee(null);
      toast.success("Employee updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update employee");
    }
  };

  const handleToggleStatus = async (emp: UserRecord) => {
    if (emp.employeeId === "Boss001" || emp.username === "admin") {
      toast.error("Cannot disable permanent admin account");
      return;
    }
    const newStatus = emp.status === "active" ? "inactive" : "active";
    try {
      await setEmployeeStatus(emp.uid, newStatus);
      toast.success(`Employee ${newStatus === "active" ? "activated" : "deactivated"}`);
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteClick = async (emp: UserRecord) => {
    if (emp.employeeId === "Boss001" || emp.username === "admin") {
      toast.error("Cannot delete permanent admin account");
      return;
    }
    setEmployeeToDelete(emp);
    setDeleteConfirmOpen(true);
    setFetchingTaskCount(true);
    try {
      const count = await getEmployeeAssignedTasksCount(emp.uid);
      setAssignedTaskCount(count);
    } catch (err) {
      setAssignedTaskCount(0);
    } finally {
      setFetchingTaskCount(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    try {
      await deleteEmployee(employeeToDelete.uid);
      toast.success(`Employee deleted and ${assignedTaskCount} tasks unassigned successfully`);
    } catch (err: any) {
      toast.error(err.message || "Deletion failed");
    } finally {
      setEmployeeToDelete(null);
      setAssignedTaskCount(0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Employee Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage your organization's employees, credentials, and roles.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 shadow-md">
          <Plus className="size-4" /> Add Employee
        </Button>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Users className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Employees</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex items-center gap-4">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
            <UserCheck className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.active}</div>
            <div className="text-xs text-muted-foreground">Active Employees</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex items-center gap-4">
          <div className="p-2 bg-rose-500/10 rounded-lg text-rose-600">
            <UserX className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.inactive}</div>
            <div className="text-xs text-muted-foreground">Inactive</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex items-center gap-4">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-600">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.managers}</div>
            <div className="text-xs text-muted-foreground">Managers</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex items-center gap-4">
          <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-600">
            <User className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.staff}</div>
            <div className="text-xs text-muted-foreground">Employees</div>
          </div>
        </div>
      </div>

      {/* Filters and search bar */}
      <div className="p-4 rounded-xl border bg-card shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by Employee Name, ID, Username, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:min-w-[400px]">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Depts</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading employees...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground font-medium text-left">
                  <th className="p-3">Employee ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Mobile Number</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Joining Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.uid} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-semibold text-primary">{e.employeeId || "—"}</td>
                    <td className="p-3 font-medium">{e.fullName}</td>
                    <td className="p-3 text-muted-foreground font-mono">{e.username}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          e.role === "admin"
                            ? "destructive"
                            : e.role === "manager"
                            ? "default"
                            : e.role === "viewer"
                            ? "outline"
                            : "secondary"
                        }
                        className="capitalize"
                      >
                        {e.role || "employee"}
                      </Badge>
                    </td>
                    <td className="p-3">{e.mobile || "—"}</td>
                    <td className="p-3 text-muted-foreground">{e.email || "—"}</td>
                    <td className="p-3">
                      {e.createdAt ? formatDate(e.createdAt) : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={e.status === "active" ? "outline" : "destructive"} className={e.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800" : ""}>
                        {e.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            console.log("Viewing employee", e);
                            setSelectedEmployee(e);
                            setViewEmployeeOpen(true);
                          }}
                          title="View Profile"
                        >
                          <Eye className="size-4 text-sky-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(e)}
                          disabled={e.employeeId === "Boss001" || e.username === "admin"}
                          title="Edit"
                          className={e.employeeId === "Boss001" || e.username === "admin" ? "opacity-30 cursor-not-allowed" : ""}
                        >
                          <Edit2 className="size-4 text-amber-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(e)}
                          disabled={e.employeeId === "Boss001" || e.username === "admin"}
                          title={e.status === "active" ? "Deactivate" : "Activate"}
                          className={e.employeeId === "Boss001" || e.username === "admin" ? "opacity-30 cursor-not-allowed" : ""}
                        >
                          <Power
                            className={`size-4 ${
                              e.status === "active" ? "text-rose-500" : "text-emerald-500"
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(e)}
                          disabled={e.employeeId === "Boss001" || e.username === "admin"}
                          title="Delete Employee"
                          className={e.employeeId === "Boss001" || e.username === "admin" ? "opacity-30 cursor-not-allowed" : ""}
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs Sub-Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">Employee System Audit Logs</h3>
        </div>
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden max-h-[300px] overflow-y-auto">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No audit logs captured yet.
            </div>
          ) : (
            <div className="divide-y text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between hover:bg-muted/10">
                  <div className="space-y-1">
                    <span className="font-semibold text-primary">{log.action}</span>
                    <p className="text-muted-foreground text-sm">{log.details}</p>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground space-y-1">
                    <div>By: <span className="font-medium text-foreground">{log.performedBy}</span></div>
                    <div>
                      {new Date(log.timestamp).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Create a new employee profile with manual login credentials.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input
                  placeholder=""
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Username *</Label>
                <Input
                  placeholder=""
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder=""
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Mobile Number</Label>
                <Input
                  placeholder=""
                  value={addForm.mobile}
                  onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Department</Label>
                <Input
                  placeholder=""
                  value={addForm.department}
                  onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Designation</Label>
                <Input
                  placeholder=""
                  value={addForm.designation}
                  onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Role *</Label>
                <Select
                  value={addForm.role}
                  onValueChange={(val) => setAddForm({ ...addForm, role: val as "manager" | "employee" | "admin" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Status *</Label>
                <Select
                  value={addForm.status}
                  onValueChange={(val) => setAddForm({ ...addForm, status: val as "active" | "inactive" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Password *</Label>
                <Input
                  type="password"
                  placeholder=""
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Confirm Password *</Label>
                <Input
                  type="password"
                  placeholder=""
                  value={addForm.confirmPassword}
                  onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Employee</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={!!editEmployee} onOpenChange={() => setEditEmployee(null)}>
        <DialogContent className="sm:max-w-lg overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile & Credentials</DialogTitle>
            <DialogDescription>
              Update employee information, username, role, status, or credentials.
            </DialogDescription>
          </DialogHeader>
          {editEmployee && (
            <form onSubmit={handleEditEmployee} className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Employee ID *</Label>
                  <Input
                    value={editForm.employeeId}
                    onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Username *</Label>
                  <Input
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mobile Number</Label>
                  <Input
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Department</Label>
                  <Input
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Designation</Label>
                  <Input
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Role *</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(val) => setEditForm({ ...editForm, role: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status *</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(val) => setEditForm({ ...editForm, status: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-3 space-y-3">
                <Label className="text-xs uppercase font-bold text-gray-400 block">Change Credentials (Optional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">New Password</Label>
                    <Input
                      type="password"
                      placeholder=""
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Confirm New Password</Label>
                    <Input
                      type="password"
                      placeholder=""
                      value={editForm.confirmPassword}
                      onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditEmployee(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* View Employee Dialog */}
      <Dialog open={viewEmployeeOpen} onOpenChange={setViewEmployeeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Employee Profile Details</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-xl">
                <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-lg text-primary">
                  {(selectedEmployee.fullName || (selectedEmployee as any).name || "EE").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold text-lg">{selectedEmployee.fullName ?? (selectedEmployee as any).name ?? "N/A"}</h4>
                  <p className="text-xs text-muted-foreground">ID: {selectedEmployee.employeeId ?? "N/A"}</p>
                </div>
              </div>

              {/* Basic Information */}
              <div className="space-y-2 text-sm">
                <h5 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Basic Information</h5>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Employee ID</span>
                  <span className="font-semibold">{selectedEmployee.employeeId ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Full Name</span>
                  <span className="font-medium">{selectedEmployee.fullName ?? (selectedEmployee as any).name ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Username</span>
                  <span className="font-mono font-medium">{selectedEmployee.username ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{selectedEmployee.email ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Mobile</span>
                  <span className="font-medium">{selectedEmployee.mobile ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Department</span>
                  <span className="font-medium">{selectedEmployee.department ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Designation</span>
                  <span className="font-medium">{selectedEmployee.designation ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Role</span>
                  <span className="capitalize font-medium">{selectedEmployee.role ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={selectedEmployee.status === "active" ? "outline" : "destructive"} className={selectedEmployee.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800" : ""}>
                    {selectedEmployee.status ?? "N/A"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Join Date</span>
                  <span className="font-medium">
                    {selectedEmployee.createdAt ? formatDate(selectedEmployee.createdAt) : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="font-medium">
                    {(selectedEmployee as any).updatedAt
                      ? formatDateTime((selectedEmployee as any).updatedAt)
                      : "N/A"}
                  </span>
                </div>
              </div>

              {/* Login Credentials (Admin Only) */}
              {session?.role === "admin" && (
                <div className="bg-slate-50 border p-3 rounded-xl space-y-2">
                  <h5 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Login Credentials (Admin Only)</h5>
                  <div className="flex justify-between items-center text-sm border-b pb-1">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono font-bold text-gray-800">{selectedEmployee.username ?? "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border">
                        ••••••••
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button onClick={() => setViewEmployeeOpen(false)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Auto-Login Credentials Overlay Success Dialog */}
      <Dialog
        open={!!showSuccessCredentials?.show}
        onOpenChange={(val) => {
          if (!val) setShowSuccessCredentials(null);
        }}
      >
        <DialogContent className="sm:max-w-md bg-emerald-950 border-emerald-500 text-emerald-100">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <UserCheck2 className="size-6 text-emerald-400 animate-bounce" />
              Employee Created Successfully
            </DialogTitle>
            <DialogDescription className="text-emerald-300">
              Please save the generated credentials. The temporary password will be required for their first login.
            </DialogDescription>
          </DialogHeader>

          {showSuccessCredentials && (
            <>
              <div className="p-4 rounded-xl border border-emerald-800 bg-emerald-900/40 space-y-3 font-mono text-sm">
                <div className="flex justify-between border-b border-emerald-800 py-1">
                  <span>Employee ID:</span>
                  <span className="font-bold text-white">{showSuccessCredentials.employeeId}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-800 py-1">
                  <span>Username:</span>
                  <span className="font-bold text-white">{showSuccessCredentials.username}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-800 py-1">
                  <span>Password:</span>
                  <span className="font-bold text-amber-300 select-all tracking-wider">
                    {showSuccessCredentials.password}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-emerald-900/30 border-emerald-700 hover:bg-emerald-900/65 text-emerald-100 font-semibold flex items-center justify-center gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Username: ${showSuccessCredentials.username}\nPassword: ${showSuccessCredentials.password}`
                    );
                    toast.success("Credentials copied to clipboard");
                  }}
                >
                  <Copy className="size-4" /> Copy Credentials
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-emerald-900/30 border-emerald-700 hover:bg-emerald-900/65 text-emerald-100 font-semibold flex items-center justify-center gap-2"
                  onClick={() => {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Employee Credentials - ${showSuccessCredentials.employeeId}</title>
                            <style>
                              body { font-family: monospace; padding: 40px; text-align: center; }
                              .card { border: 2px solid #10b981; border-radius: 12px; padding: 25px; display: inline-block; text-align: left; background: #f0fdf4; }
                              h2 { margin-top: 0; color: #047857; }
                              p { margin: 8px 0; font-size: 16px; }
                            </style>
                          </head>
                          <body>
                            <div class="card">
                              <h2>Employee Credentials</h2>
                              <p><strong>Employee ID:</strong> ${showSuccessCredentials.employeeId}</p>
                              <p><strong>Username:</strong> ${showSuccessCredentials.username}</p>
                              <p><strong>Password:</strong> ${showSuccessCredentials.password}</p>
                            </div>
                            <script>
                              window.onload = function() {
                                window.print();
                                window.close();
                              }
                            </script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                >
                  <Printer className="size-4" /> Print Credentials
                </Button>
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-bold w-full sm:w-auto"
              onClick={() => setShowSuccessCredentials(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Employee Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="size-5" />
              Are you sure?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm text-gray-700">
            <p>This action cannot be undone.</p>
            {employeeToDelete && (
              <p className="text-xs text-muted-foreground">
                Deleting employee: <strong className="text-gray-900 font-bold">{employeeToDelete.fullName || employeeToDelete.username}</strong>
              </p>
            )}

            {fetchingTaskCount ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-slate-50 rounded-lg border">
                <Loader2 className="size-3.5 animate-spin" />
                Checking assigned tasks...
              </div>
            ) : (
              assignedTaskCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs font-medium">
                  This employee currently has <strong>{assignedTaskCount} assigned tasks</strong>. These tasks will automatically become <strong>Unassigned</strong>.
                </div>
              )
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={fetchingTaskCount}
              onClick={() => {
                setDeleteConfirmOpen(false);
                handleConfirmDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
