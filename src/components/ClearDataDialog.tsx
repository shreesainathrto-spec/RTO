import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { clearAllCrmData, clearCaches, type ClearDataProgress } from "@/lib/clearDataService";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClearDataDialog({ open, onOpenChange }: ClearDataDialogProps) {
  const [step, setStep] = useState<"warning" | "pin" | "confirm" | "progress" | "complete" | "error">("warning");
  const [confirmText, setConfirmText] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [progress, setProgress] = useState<ClearDataProgress | null>(null);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const canProceedToPin = confirmText === "DELETE ALL";
  const canProceedToClear = adminPin.length === 4;

  const handleContinueToPin = () => {
    if (confirmText !== "DELETE ALL") {
      setError("You must type DELETE ALL exactly to proceed.");
      return;
    }
    setError("");
    setStep("pin");
  };

  const handleContinueToClear = async () => {
    if (adminPin.length !== 4) {
      setError("PIN must be 4 digits.");
      return;
    }
    setError("");
    setStep("progress");

    try {
      const result = await clearAllCrmData(adminPin, (prog) => {
        setProgress(prog);
      });

      if (result.success) {
        // Clear caches
        await clearCaches();

        // Invalidate all React Query caches
        queryClient.clear();

        // Refresh state
        window.dispatchEvent(new Event("clear-crm-data"));

        setStep("complete");
        setTimeout(() => {
          toast.success("✅ All CRM data has been deleted successfully.");
          onOpenChange(false);
          // Navigate to dashboard
          navigate({ to: "/dashboard" });
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || "Failed to clear data");
      setStep("error");
    }
  };

  const handleReset = () => {
    setStep("warning");
    setConfirmText("");
    setAdminPin("");
    setProgress(null);
    setError("");
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      handleReset();
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {/* WARNING STEP */}
        {step === "warning" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="size-6 text-destructive" />
                <DialogTitle>⚠ Clear All CRM Data</DialogTitle>
              </div>
              <DialogDescription className="text-sm mt-2">
                This action <span className="font-semibold">cannot be undone</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-destructive">
                  The following will be permanently deleted:
                </p>
                <ul className="text-sm text-destructive space-y-1.5 ml-4 list-disc">
                  <li>Clients</li>
                  <li>Leads</li>
                  <li>Tasks & Task Templates</li>
                  <li>Services & Vehicles</li>
                  <li>Billing & Invoices</li>
                  <li>Payments & Collections</li>
                  <li>Accounting Records</li>
                  <li>Activity Logs</li>
                  <li>Analytics</li>
                  <li>Targets</li>
                  <li>All operational module data</li>
                </ul>
                <p className="text-xs text-destructive/70 mt-3">
                  ✓ Employee accounts will NOT be deleted
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* CONFIRM STEP */}
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-text" className="text-sm font-semibold">
                  Type <span className="font-mono bg-muted px-2 py-1 rounded">DELETE ALL</span> to confirm
                </Label>
                <Input
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => {
                    setConfirmText(e.target.value);
                    setError("");
                  }}
                  placeholder="Type DELETE ALL"
                  className={confirmText === "DELETE ALL" ? "border-green-500" : ""}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("warning")}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinueToPin}
                disabled={!canProceedToPin}
              >
                Continue to PIN
              </Button>
            </DialogFooter>
          </>
        )}

        {/* PIN STEP */}
        {step === "pin" && (
          <>
            <DialogHeader>
              <DialogTitle>Admin PIN Verification</DialogTitle>
              <DialogDescription>
                Enter your 4-digit admin PIN to proceed with data deletion.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-pin">Admin PIN</Label>
                <Input
                  id="admin-pin"
                  type="password"
                  value={adminPin}
                  onChange={(e) => {
                    setAdminPin(e.target.value.slice(0, 4));
                    setError("");
                  }}
                  placeholder="••••"
                  maxLength={4}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("confirm")}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinueToClear}
                disabled={!canProceedToClear}
              >
                Clear All Data
              </Button>
            </DialogFooter>
          </>
        )}

        {/* PROGRESS STEP */}
        {step === "progress" && progress && (
          <>
            <DialogHeader>
              <DialogTitle>Clearing CRM Data...</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold">{progress.currentCollection}</p>
                  <span className="text-xs text-muted-foreground">{progress.percentage}%</span>
                </div>
                <Progress value={progress.percentage} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Collection {progress.current} of {progress.total}
              </p>
            </div>
          </>
        )}

        {/* COMPLETE STEP */}
        {step === "complete" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-6 text-green-600" />
                <DialogTitle>Data Cleared Successfully</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-green-500/10 p-4">
                <p className="text-sm text-green-700">
                  ✅ All CRM data has been deleted successfully. Redirecting to dashboard...
                </p>
              </div>
            </div>
          </>
        )}

        {/* ERROR STEP */}
        {step === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive">Error</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("warning")}>
                Start Over
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
