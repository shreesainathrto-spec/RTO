// src/routes/dashboard.settings.tsx
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getForceCapsSetting, setForceCapsSetting } from "@/lib/capitalize-settings";
import { getMigrationStatus } from "@/lib/migration";
import { ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { ClearDataDialog } from "@/components/ClearDataDialog";
import { ChangePinModal } from "@/components/ChangePinModal";
import {
  type RolePermissions,
  saveStaffPermissions,
  subscribeStaffPermissions,
} from "@/lib/permissions";
import { useLanguage } from "@/lib/i18n";

interface Settings {
  officeName: string;
  branch: string;
  contact: string;
  insuranceGstPercentage?: number;
}

const KEY = "registry-settings";
const DEFAULTS: Settings = { officeName: "Registry Pro", branch: "Branch 042", contact: "", insuranceGstPercentage: 18 };

const defaultPermissions = {
  createClients: false,
  editClients: false,
  deleteClients: false,
};

export const Route = createFileRoute("/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [forceCaps, setForceCapsState] = useState(false);
  const [saved, setSaved] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{ unmigratedRecords: number } | null>(
    null,
  );

  const [permissions, setPermissions] = useState<RolePermissions>(defaultPermissions);
  const [permsSaved, setPermsSaved] = useState(false);
  const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  
  const [courseTypes, setCourseTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("driving_school_course_types");
      return saved ? JSON.parse(saved) : ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    } catch {
      return ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    }
  });
  const [newCourseTypeInput, setNewCourseTypeInput] = useState("");

  // Insurance Companies state
  const [insuranceCompanies, setInsuranceCompanies] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("insurance_companies");
      return saved ? JSON.parse(saved) : ["New India", "ICICI Lombard", "HDFC Ergo", "Bajaj Allianz", "TATA AIG", "SBI General", "National Insurance", "United India", "Oriental Insurance"];
    } catch {
      return ["New India", "ICICI Lombard", "HDFC Ergo", "Bajaj Allianz", "TATA AIG", "SBI General", "National Insurance", "United India", "Oriental Insurance"];
    }
  });
  const [newCompanyInput, setNewCompanyInput] = useState("");
  const [editingCompanyIndex, setEditingCompanyIndex] = useState<number | null>(null);
  const [editingCompanyValue, setEditingCompanyValue] = useState("");

  // Insurance Agencies state
  const [insuranceAgencies, setInsuranceAgencies] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("insurance_agencies");
      return saved ? JSON.parse(saved) : ["Primary Agency", "Branch Agency", "Broker Agency"];
    } catch {
      return ["Primary Agency", "Branch Agency", "Broker Agency"];
    }
  });
  const [newAgencyInput, setNewAgencyInput] = useState("");
  const [editingAgencyIndex, setEditingAgencyIndex] = useState<number | null>(null);
  const [editingAgencyValue, setEditingAgencyValue] = useState("");

  const session = getSession();
  if (session?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  const isAdmin = true;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setForceCapsState(getForceCapsSetting());

    // Load migration status
    getMigrationStatus()
      .then((status) => setMigrationStatus({ unmigratedRecords: status.unmigratedRecords }))
      .catch((err) => console.error("Error loading migration status:", err));

    // Subscribe to staff permissions
    const unsubPerms = subscribeStaffPermissions((p) => {
      setPermissions(p ?? defaultPermissions);
    });
    return () => {
      unsubPerms();
    };
  }, []);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePermissions = async () => {
    if (!permissions) return;
    try {
      await saveStaffPermissions(permissions);
      setPermsSaved(true);
      setTimeout(() => setPermsSaved(false), 2000);
    } catch (err) {
      console.error("[Settings] Failed to save staff permissions:", err);
    }
  };

  const toggleForceCaps = (enabled: boolean) => {
    setForceCapsSetting(enabled);
    setForceCapsState(enabled);
    // Dispatch event so other components can listen for setting changes
    window.dispatchEvent(new Event("force-caps-changed"));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Office details and local data management.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Office name</Label>
          <Input
            value={s.officeName}
            onChange={(e) => setS({ ...s, officeName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Input value={s.branch} onChange={(e) => setS({ ...s, branch: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Contact phone</Label>
          <Input
            value={s.contact}
            onChange={(e) => setS({ ...s, contact: e.target.value })}
            placeholder="9876543210"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Insurance GST Percentage (%)</Label>
          <Input
            type="number"
            value={s.insuranceGstPercentage ?? 18}
            onChange={(e) => setS({ ...s, insuranceGstPercentage: Number(e.target.value) })}
            min="0"
            max="100"
          />
        </div>
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="space-y-0.5">
            <Label>{t("Force capital letters")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Automatically convert text inputs to uppercase")}
            </p>
          </div>
          <Switch checked={forceCaps} onCheckedChange={toggleForceCaps} />
        </div>
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="space-y-0.5">
            <Label>{t("Language")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Select your preferred language")}
            </p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="flex h-9 w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="en">English</option>
            <option value="gu">ગુજરાતી (Gujarati)</option>
          </select>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save}>{t("Save changes")}</Button>
          {saved && <span className="text-sm text-success font-medium text-emerald-600">✓ Settings saved successfully.</span>}
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                Security Settings
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage global application security and action confirmation authorization.
              </p>
            </div>
            <div className="pt-3 border-t flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Delete Confirmation PIN</Label>
                <p className="text-xs text-muted-foreground">
                  Global PIN required before executing any record or entity deletion
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tracking-widest bg-muted px-2.5 py-1 rounded border">••••</span>
                <Button variant="outline" size="sm" onClick={() => setChangePinOpen(true)}>
                  <KeyRound className="size-3.5 mr-1.5" />
                  Change PIN
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Link to="/dashboard/employees">
              <Button variant="outline">Employee Management</Button>
            </Link>
          </div>
        </div>
      )}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Staff Role Permissions</h3>
            <p className="text-sm text-muted-foreground">
              Configure client management permissions for employee/staff roles.
            </p>
          </div>
          <div className="space-y-4 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Staff can create clients</Label>
                <p className="text-xs text-muted-foreground">
                  Allow employees to add new client and lead records
                </p>
              </div>
              <Switch
                checked={permissions.createClients}
                onCheckedChange={(checked) =>
                  setPermissions(prev => ({ ...(prev ?? defaultPermissions), createClients: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Staff can edit clients</Label>
                <p className="text-xs text-muted-foreground">
                  Allow employees to edit client profile fields
                </p>
              </div>
              <Switch
                checked={permissions.editClients}
                onCheckedChange={(checked) =>
                  setPermissions(prev => ({ ...(prev ?? defaultPermissions), editClients: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Staff can delete clients</Label>
                <p className="text-xs text-muted-foreground">
                  Allow employees to delete clients (normally Admin only)
                </p>
              </div>
              <Switch
                checked={permissions.deleteClients}
                onCheckedChange={(checked) =>
                  setPermissions(prev => ({ ...(prev ?? defaultPermissions), deleteClients: checked }))
                }
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSavePermissions}>Save Permissions</Button>
              {permsSaved && <span className="text-sm text-success font-medium text-emerald-600">✓ Settings saved successfully.</span>}
            </div>
          </div>
        </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Driving School Course Types</h3>
        <p className="text-sm text-muted-foreground">
          Manage the available course options for Driving School applications.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {courseTypes.map((course) => (
            <span
              key={course}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border rounded-lg text-xs font-semibold text-slate-800"
            >
              {course}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to permanently delete this course type?")) {
                    const next = courseTypes.filter((c) => c !== course);
                    setCourseTypes(next);
                    localStorage.setItem("driving_school_course_types", JSON.stringify(next));
                  }
                }}
                className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                title="Remove course"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 max-w-md pt-2">
          <Input
            placeholder="Add new course (e.g. 30 Days)"
            value={newCourseTypeInput}
            onChange={(e) => setNewCourseTypeInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              const cleaned = newCourseTypeInput.trim();
              if (cleaned && !courseTypes.includes(cleaned)) {
                const next = [...courseTypes, cleaned];
                setCourseTypes(next);
                localStorage.setItem("driving_school_course_types", JSON.stringify(next));
                setNewCourseTypeInput("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Insurance Companies Section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Insurance Companies</h3>
        <p className="text-sm text-muted-foreground">
          Manage the available Insurance Companies options for Insurance applications.
        </p>

        <div className="space-y-2 max-w-xl">
          {insuranceCompanies.map((company, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg">
              {editingCompanyIndex === idx ? (
                <div className="flex gap-2 w-full">
                  <Input
                    value={editingCompanyValue}
                    onChange={(e) => setEditingCompanyValue(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const cleaned = editingCompanyValue.trim();
                      if (cleaned) {
                        const next = [...insuranceCompanies];
                        next[idx] = cleaned;
                        setInsuranceCompanies(next);
                        localStorage.setItem("insurance_companies", JSON.stringify(next));
                      }
                      setEditingCompanyIndex(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs px-2"
                    onClick={() => setEditingCompanyIndex(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-800">{company}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2 py-1"
                      onClick={() => {
                        setEditingCompanyIndex(idx);
                        setEditingCompanyValue(company);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[10px] px-2 py-1"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to permanently delete this item?")) {
                          const next = insuranceCompanies.filter((_, i) => i !== idx);
                          setInsuranceCompanies(next);
                          localStorage.setItem("insurance_companies", JSON.stringify(next));
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 max-w-md pt-2">
          <Input
            placeholder="Add new company (e.g. Reliance General)"
            value={newCompanyInput}
            onChange={(e) => setNewCompanyInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              const cleaned = newCompanyInput.trim();
              if (cleaned && !insuranceCompanies.includes(cleaned)) {
                const next = [...insuranceCompanies, cleaned];
                setInsuranceCompanies(next);
                localStorage.setItem("insurance_companies", JSON.stringify(next));
                setNewCompanyInput("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Insurance Agencies Section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Insurance Agencies</h3>
        <p className="text-sm text-muted-foreground">
          Manage the available Insurance Agencies options for Insurance applications.
        </p>

        <div className="space-y-2 max-w-xl">
          {insuranceAgencies.map((agency, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg">
              {editingAgencyIndex === idx ? (
                <div className="flex gap-2 w-full">
                  <Input
                    value={editingAgencyValue}
                    onChange={(e) => setEditingAgencyValue(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const cleaned = editingAgencyValue.trim();
                      if (cleaned) {
                        const next = [...insuranceAgencies];
                        next[idx] = cleaned;
                        setInsuranceAgencies(next);
                        localStorage.setItem("insurance_agencies", JSON.stringify(next));
                      }
                      setEditingAgencyIndex(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs px-2"
                    onClick={() => setEditingAgencyIndex(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-800">{agency}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2 py-1"
                      onClick={() => {
                        setEditingAgencyIndex(idx);
                        setEditingAgencyValue(agency);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[10px] px-2 py-1"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to permanently delete this item?")) {
                          const next = insuranceAgencies.filter((_, i) => i !== idx);
                          setInsuranceAgencies(next);
                          localStorage.setItem("insurance_agencies", JSON.stringify(next));
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 max-w-md pt-2">
          <Input
            placeholder="Add new agency (e.g. Prime Broker)"
            value={newAgencyInput}
            onChange={(e) => setNewAgencyInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              const cleaned = newAgencyInput.trim();
              if (cleaned && !insuranceAgencies.includes(cleaned)) {
                const next = [...insuranceAgencies, cleaned];
                setInsuranceAgencies(next);
                localStorage.setItem("insurance_agencies", JSON.stringify(next));
                setNewAgencyInput("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-card p-6 space-y-3">
        <h3 className="font-semibold text-destructive">Danger zone</h3>
        <p className="text-sm text-muted-foreground">
          Permanently delete all CRM data from the database (except employee accounts).
        </p>
        {isAdmin ? (
          <Button variant="destructive" onClick={() => setClearDataDialogOpen(true)}>
            Clear all CRM data
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can clear data.</p>
        )}
      </div>

      {migrationStatus && migrationStatus.unmigratedRecords > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-6 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="font-semibold text-orange-700">Service Type Migration Required</h3>
                <p className="text-sm text-orange-600 mt-1">
                  {migrationStatus.unmigratedRecords} record(s) need to be migrated to support
                  service module filtering.
                </p>
              </div>
              <Link to="/dashboard/settings/migration" className="inline-block">
                <Button variant="default" size="sm">
                  <ArrowRight className="size-4 mr-2" />
                  Go to Migration Tool
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {migrationStatus && migrationStatus.unmigratedRecords === 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-700">All Records Migrated</h3>
              <p className="text-sm text-green-600 mt-1">
                All records have been successfully migrated and are ready for service module
                filtering.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <ClearDataDialog 
        open={clearDataDialogOpen} 
        onOpenChange={setClearDataDialogOpen} 
      />

      <ChangePinModal
        open={changePinOpen}
        onOpenChange={setChangePinOpen}
      />
    </div>
  );
}
