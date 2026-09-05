import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  Truck,
  Wrench,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSession } from "@/lib/auth";
import {
  saveClient,
  saveVehicle,
  saveService,
  isLicenseService,
  type Client,
  type Vehicle,
  type Service,
} from "@/lib/hierarchy";
import { SERVICE_TYPES, type ServiceType } from "@/lib/records";

interface AddClientWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultServiceType: ServiceType;
  onSuccess?: () => void;
}

export function AddClientWizardDialog({
  open,
  onOpenChange,
  defaultServiceType,
  onSuccess,
}: AddClientWizardDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Dropdown options from Firebase
  const [taskTemplates, setTaskTemplates] = useState<{ id: string; templateName: string; subModule?: string }[]>([]);
  const [staffList, setStaffList] = useState<{ uid: string; name: string; email: string }[]>([]);

  // Step 1: Client Form State
  const [clientForm, setClientForm] = useState({
    name: "",
    mobile: "",
    companyName: "",
    address: "",
    notes: "",
  });

  // Step 2: Vehicle Form State
  const [vehicleForm, setVehicleForm] = useState({
    vehicleNumber: "",
    vehicleType: "Commercial",
    chassisNumber: "",
    engineNumber: "",
    registrationDate: new Date().toISOString().split("T")[0],
    status: "Pending" as "Pending" | "In Progress" | "Completed" | "On Hold",
  });

  // Step 3: Service Form State
  const [serviceForm, setServiceForm] = useState({
    serviceType: defaultServiceType,
    applicationType: "Home",
    applicationId: "",
    templateId: "",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    serviceAmount: 0,
    amountReceived: 0,
    advancePayment: 0,
    assignedStaff: "",
    notes: "",
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setClientForm({
        name: "",
        mobile: "",
        companyName: "",
        address: "",
        notes: "",
      });
      setVehicleForm({
        vehicleNumber: "",
        vehicleType: "Commercial",
        chassisNumber: "",
        engineNumber: "",
        registrationDate: new Date().toISOString().split("T")[0],
        status: "Pending",
      });
      const isLic = isLicenseService(defaultServiceType);
      setServiceForm({
        serviceType: defaultServiceType,
        applicationType: isLic ? "Non-Faceless" : "Home",
        applicationId: "",
        templateId: "",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        serviceAmount: 0,
        amountReceived: 0,
        advancePayment: 0,
        assignedStaff: "",
        notes: "",
      });
    }
  }, [open, defaultServiceType]);

  // Subscribe to task templates and staff list
  useEffect(() => {
    if (!open) return;

    // Load templates
    const unsubTemplates = onSnapshot(
      collection(db, "task_templates"),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          templateName: d.data().templateName || "Untitled Template",
          subModule: d.data().subModule || "",
        }));
        setTaskTemplates(list);
      },
      (err) => console.error("Error loading task templates:", err)
    );

    // Load staff/users
    const unsubStaff = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            name: data.name || data.displayName || data.fullName || data.email || "Unknown Staff",
            email: data.email || "",
          };
        });
        setStaffList(list);
      },
      (err) => console.error("Error loading staff list:", err)
    );

    return () => {
      unsubTemplates();
      unsubStaff();
    };
  }, [open]);

  const getActiveSubModule = (serviceType: string): string => {
    const s = (serviceType || "").toLowerCase();
    if (s.includes("vahaan")) return "vahaan";
    if (s.includes("licence") || s.includes("license")) return "licence";
    if (s.includes("driving")) return "driving_school";
    if (s.includes("insurance")) return "insurance";
    if (s.includes("form 5") || s.includes("form5")) return "form5";
    return "vahaan";
  };

  const getTemplateSubModule = (tpl: any): string => {
    let sub = (tpl.subModule || "").toLowerCase();
    if (sub === "services") sub = "vahaan";
    if (sub) return sub;
    const name = tpl.templateName.toLowerCase();
    if (name.includes("insurance")) return "insurance";
    if (name.includes("licence") || name.includes("license")) return "licence";
    if (name.includes("form 5") || name.includes("form5")) return "form5";
    if (name.includes("school") || name.includes("driving")) return "driving_school";
    return "vahaan";
  };

  const filteredTemplates = useMemo(() => {
    const activeSub = getActiveSubModule(serviceForm.serviceType || "");
    return taskTemplates.filter((t: any) => {
      const tplSub = getTemplateSubModule(t);
      return tplSub.toLowerCase() === activeSub.toLowerCase();
    });
  }, [taskTemplates, serviceForm.serviceType]);

  useEffect(() => {
    if (serviceForm.templateId) {
      const templateExists = filteredTemplates.some(t => t.id === serviceForm.templateId);
      if (!templateExists) {
        setServiceForm(prev => ({ ...prev, templateId: "" }));
      }
    }
  }, [filteredTemplates, serviceForm.templateId]);

  // Validation handlers
  const handleStep1Next = () => {
    if (!clientForm.name.trim()) {
      toast.error("Client Name is required");
      return;
    }
    if (!clientForm.mobile.trim()) {
      toast.error("Mobile Number is required");
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    if (!isLicenseService(serviceForm.serviceType) && !vehicleForm.vehicleNumber.trim()) {
      toast.error("Vehicle Number is required");
      return;
    }
    setStep(3);
  };

  // Final Complete Save Process
  const handleFinalSave = async () => {
    if (!serviceForm.applicationId.trim()) {
      toast.error("Application ID is required");
      return;
    }

    setSaving(true);
    try {
      const session = getSession();
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;

      const isLicense = isLicenseService(serviceForm.serviceType);

      // 1. Generate IDs
      const clientId = `cli_${crypto.randomUUID()}`;
      const vehicleId = isLicense ? "" : `veh_${crypto.randomUUID()}`;
      const serviceId = `srv_${crypto.randomUUID()}`;

      // 2. Create Client
      const newClient: Client = {
        id: clientId,
        name: clientForm.name.trim(),
        mobile: clientForm.mobile.trim(),
        companyName: clientForm.companyName.trim(),
        address: clientForm.address.trim(),
        notes: clientForm.notes.trim(),
        type: "client",
      };
      await saveClient(newClient, actorOverride);

      // 3. Create Vehicle (if not license or vehicle number provided)
      if (!isLicense || vehicleForm.vehicleNumber.trim()) {
        const vId = vehicleId || `veh_${crypto.randomUUID()}`;
        const newVehicle: Vehicle = {
          id: vId,
          clientId,
          vehicleNumber: vehicleForm.vehicleNumber.trim().toUpperCase(),
          vehicleType: vehicleForm.vehicleType,
          chassisNumber: vehicleForm.chassisNumber.trim(),
          engineNumber: vehicleForm.engineNumber.trim(),
          registrationDate: vehicleForm.registrationDate,
          status: vehicleForm.status,
        };
        await saveVehicle(newVehicle, actorOverride);
      }

      // 4. Create Service
      const serviceAmount = Number(serviceForm.serviceAmount) || 0;
      const amountReceived = Number(serviceForm.amountReceived) || 0;
      const advancePayment = Number(serviceForm.advancePayment) || 0;
      const pendingAmount = Math.max(0, serviceAmount - amountReceived - advancePayment);

      const newService: Service = {
        id: serviceId,
        vehicleId: isLicense ? "" : vehicleId,
        clientId,
        clientName: newClient.name,
        clientMobile: newClient.mobile,
        serviceType: serviceForm.serviceType,
        applicationType: serviceForm.applicationType || "Home",
        applicationId: serviceForm.applicationId.trim(),
        templateId: serviceForm.templateId || undefined,
        dueDate: serviceForm.dueDate,
        serviceAmount,
        amountReceived,
        advancePayment,
        pendingAmount,
        assignedStaff: serviceForm.assignedStaff || "Unassigned",
        taskStatus: "Not Started",
        progress: 0,
        notes: serviceForm.notes.trim(),
      };
      await saveService(newService, actorOverride);

      toast.success(
        `Successfully created Client "${newClient.name}" and ${newService.serviceType} Service!`
      );

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("[AddClientWizard] Failed to save wizard pipeline:", err);
      toast.error(err?.message || "Failed to create client pipeline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden bg-background text-foreground border shadow-xl rounded-xl">
        {/* Wizard Stepper Header */}
        <DialogHeader className="p-5 pb-4 bg-muted/30 border-b">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <span>Add Client & Service Wizard</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
              Step {step} of 3
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Create Client, Vehicle, and Service in one continuous workflow.
          </DialogDescription>

          {/* Stepper Progress Bar & Labels */}
          <div className="pt-4 pb-1">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <div
                className={`flex items-center gap-1.5 ${
                  step >= 1 ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                <div
                  className={`size-6 rounded-full flex items-center justify-center text-xs ${
                    step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > 1 ? <CheckCircle2 className="size-4" /> : "1"}
                </div>
                <span>Client Info</span>
              </div>

              <div className={`h-0.5 flex-1 mx-2 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />

              <div
                className={`flex items-center gap-1.5 ${
                  step >= 2 ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                <div
                  className={`size-6 rounded-full flex items-center justify-center text-xs ${
                    step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > 2 ? <CheckCircle2 className="size-4" /> : "2"}
                </div>
                <span>Vehicle Info</span>
              </div>

              <div className={`h-0.5 flex-1 mx-2 ${step >= 3 ? "bg-primary" : "bg-muted"}`} />

              <div
                className={`flex items-center gap-1.5 ${
                  step >= 3 ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                <div
                  className={`size-6 rounded-full flex items-center justify-center text-xs ${
                    step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  3
                </div>
                <span>Service Info</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Form Body Step Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {/* STEP 1: CLIENT FORM */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Client Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Full Name"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mobile Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Mobile"
                  value={clientForm.mobile}
                  onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Company Name
                </Label>
                <Input
                  placeholder="Company / Group"
                  value={clientForm.companyName}
                  onChange={(e) => setClientForm({ ...clientForm, companyName: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  C/O Address
                </Label>
                <Textarea
                  placeholder="Address"
                  rows={2}
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  placeholder="Internal notes..."
                  rows={2}
                  value={clientForm.notes}
                  onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* STEP 2: VEHICLE FORM */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g. GJ01AB1234"
                  value={vehicleForm.vehicleNumber}
                  onChange={(e) =>
                    setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value.toUpperCase() })
                  }
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle Type
                </Label>
                <Select
                  value={vehicleForm.vehicleType}
                  onValueChange={(v) => setVehicleForm({ ...vehicleForm, vehicleType: v })}
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select Vehicle Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Commercial">Commercial</SelectItem>
                    <SelectItem value="Private">Private</SelectItem>
                    <SelectItem value="Goods">Goods</SelectItem>
                    <SelectItem value="Passenger">Passenger</SelectItem>
                    <SelectItem value="Trailer">Trailer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Chassis Number
                </Label>
                <Input
                  placeholder="Chassis Number"
                  value={vehicleForm.chassisNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, chassisNumber: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Engine Number
                </Label>
                <Input
                  placeholder="Engine Number"
                  value={vehicleForm.engineNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, engineNumber: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Registration Date
                  </Label>
                  <Input
                    type="date"
                    value={vehicleForm.registrationDate}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, registrationDate: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </Label>
                  <Select
                    value={vehicleForm.status}
                    onValueChange={(v: any) => setVehicleForm({ ...vehicleForm, status: v })}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="On Hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SERVICE FORM */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Service Type</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-normal">
                    <Lock className="size-3" /> Auto-selected & Locked
                  </span>
                </Label>
                <Input
                  value={serviceForm.serviceType}
                  disabled
                  className="bg-muted font-semibold text-primary"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Task Template (Optional)
                </Label>
                <Select
                  value={serviceForm.templateId || "__none"}
                  onValueChange={(v) =>
                    setServiceForm({ ...serviceForm, templateId: v === "__none" ? "" : v })
                  }
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="None (Default Manual Task)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None (Default Manual Task)</SelectItem>
                    {filteredTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.templateName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Application Type
                  </Label>
                  <Select
                    value={serviceForm.applicationType}
                    onValueChange={(v) => setServiceForm({ ...serviceForm, applicationType: v })}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Select Application Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLicenseService(serviceForm.serviceType) ? (
                        <>
                          <SelectItem value="Non-Faceless">Non-Faceless</SelectItem>
                          <SelectItem value="Faceless">Faceless</SelectItem>
                          <SelectItem value="Out Of Bhavnagar">Out Of Bhavnagar</SelectItem>
                          <SelectItem value="Out Of Bhavnagar To Bhavnagar">
                            Out Of Bhavnagar To Bhavnagar
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Home">Home</SelectItem>
                          <SelectItem value="Faceless">Faceless</SelectItem>
                          <SelectItem value="CNG">CNG</SelectItem>
                          <SelectItem value="Out Of Bhavnagar">Out Of Bhavnagar</SelectItem>
                          <SelectItem value="Out Of Bhavnagar To Bhavnagar">
                            Out Of Bhavnagar To Bhavnagar
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Application ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Enter Application ID"
                    value={serviceForm.applicationId}
                    onChange={(e) => setServiceForm({ ...serviceForm, applicationId: e.target.value })}
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Due Date
                  </Label>
                  <Input
                    type="date"
                    value={serviceForm.dueDate}
                    onChange={(e) => setServiceForm({ ...serviceForm, dueDate: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assigned Staff
                  </Label>
                  <Select
                    value={serviceForm.assignedStaff || "__none"}
                    onValueChange={(v) =>
                      setServiceForm({ ...serviceForm, assignedStaff: v === "__none" ? "" : v })
                    }
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.uid} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Service Amount (₹)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={serviceForm.serviceAmount || ""}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, serviceAmount: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Amount Received (₹)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={serviceForm.amountReceived || ""}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, amountReceived: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Advance Payment (₹)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={serviceForm.advancePayment || ""}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, advancePayment: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Service Notes
                </Label>
                <Textarea
                  placeholder="Notes..."
                  rows={2}
                  value={serviceForm.notes}
                  onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <DialogFooter className="p-4 bg-muted/30 border-t flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((step - 1) as any)}
                disabled={saving}
                className="gap-1"
              >
                <ChevronLeft className="size-4" /> Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                onClick={step === 1 ? handleStep1Next : handleStep2Next}
                className="gap-1 bg-primary text-primary-foreground font-semibold"
              >
                Next <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalSave}
                disabled={saving}
                className="gap-1 bg-primary text-primary-foreground font-semibold"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving Pipeline...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Save Service & Complete
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
