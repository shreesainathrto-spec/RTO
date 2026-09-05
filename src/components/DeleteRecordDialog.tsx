// DeleteRecordDialog — Secure record deletion with admin PIN verification.
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Lock } from "lucide-react";
import { softDeleteRecord, type DeleteReason, type Bucket } from "@/lib/records";
import { verifyAdminPin } from "@/lib/adminSecurity";

interface DeleteRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  recordName: string;
  bucket: Bucket;
  userRole: "admin" | "staff";
  username: string;
  onSuccess?: () => void;
}

export function DeleteRecordDialog({
  open,
  onOpenChange,
  recordId,
  recordName,
  bucket,
  userRole,
  username,
  onSuccess,
}: DeleteRecordDialogProps) {
  const [step, setStep] = useState<"verify" | "reason" | "confirm">("verify");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState<DeleteReason | "">();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    // Reset state when dialog closes
    setTimeout(() => {
      setStep("verify");
      setPin("");
      setReason("");
      setError("");
      setLoading(false);
    }, 300);
  };

  const handleVerifyPin = async () => {
    setLoading(true);
    try {
      const ok = await verifyAdminPin(pin);
      if (!ok) {
        setError("Invalid PIN. Please try again.");
        return;
      }
      setError("");
      setStep("reason");
    } catch (e) {
      setError("PIN verification error.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReason = () => {
    if (!reason) {
      setError("Please select a deletion reason.");
      return;
    }
    setError("");
    setStep("confirm");
  };

  const handleConfirmDelete = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      await softDeleteRecord(bucket, recordId, username, reason);
      setError("");
      handleClose();
      onSuccess?.();
    } catch (err) {
      setError(`Failed to delete record: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  // Only admins can see the dialog
  if (userRole !== "admin") {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <AlertDialogTitle>Cannot Delete</AlertDialogTitle>
            </div>
          </AlertDialogHeader>
          <AlertDialogDescription className="text-sm">
            Only administrators can delete records.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDialogTitle>Delete Record?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Record: <span className="font-medium text-gray-900">{recordName}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* STEP 1: PIN Verification */}
          {step === "verify" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin PIN Required</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  type="password"
                  placeholder="Enter admin PIN"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleVerifyPin();
                  }}
                  className="pl-10"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {/* STEP 2: Reason Selection */}
          {step === "reason" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Deletion Reason</label>
              <Select value={reason} onValueChange={(val) => setReason(val as DeleteReason)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Duplicate Entry">Duplicate Entry</SelectItem>
                  <SelectItem value="Wrong Customer">Wrong Customer</SelectItem>
                  <SelectItem value="Testing Data">Testing Data</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {/* STEP 3: Confirmation */}
          {step === "confirm" && (
            <div className="space-y-3 rounded-lg bg-red-50 p-3">
              <p className="text-sm font-medium text-gray-900">⚠️ This action cannot be undone.</p>
              <div className="text-xs text-gray-700 space-y-1">
                <p>
                  <strong>Record:</strong> {recordName}
                </p>
                <p>
                  <strong>Reason:</strong> {reason}
                </p>
                <p>
                  <strong>Deleted By:</strong> {username}
                </p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <div className="flex gap-2">
            {step === "verify" && (
              <AlertDialogAction onClick={handleVerifyPin} disabled={!pin || loading}>
                Verify PIN
              </AlertDialogAction>
            )}
            {step === "reason" && (
              <>
                <button
                  onClick={() => {
                    setStep("verify");
                    setPin("");
                  }}
                  disabled={loading}
                  className="px-3 py-2 text-sm rounded-md border hover:bg-gray-50 disabled:opacity-50"
                >
                  Back
                </button>
                <AlertDialogAction onClick={handleSelectReason} disabled={!reason || loading}>
                  Continue
                </AlertDialogAction>
              </>
            )}
            {step === "confirm" && (
              <>
                <button
                  onClick={() => setStep("reason")}
                  disabled={loading}
                  className="px-3 py-2 text-sm rounded-md border hover:bg-gray-50 disabled:opacity-50"
                >
                  Back
                </button>
                <AlertDialogAction
                  onClick={handleConfirmDelete}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? "Deleting..." : "Delete Record"}
                </AlertDialogAction>
              </>
            )}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
