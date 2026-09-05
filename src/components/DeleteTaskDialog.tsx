// DeleteTaskDialog — Task deletion dialog with PIN verification.
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
import { Input } from "@/components/ui/input";
import { AlertCircle, Lock } from "lucide-react";
import { deleteTaskPermanently } from "@/lib/tasks";
import { verifyAdminPin } from "@/lib/adminSecurity";
import { toast } from "sonner";

interface DeleteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  userRole: "admin" | "staff";
  username: string;
  onSuccess?: () => void;
}

export function DeleteTaskDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  userRole,
  username,
  onSuccess,
}: DeleteTaskDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setPin("");
      setError("");
      setLoading(false);
    }, 300);
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const ok = await verifyAdminPin(pin);
      if (!ok) {
        setError("Invalid PIN. Deletion aborted.");
        setLoading(false);
        return;
      }
      setError("");
      await deleteTaskPermanently(taskId);
      toast.success("Task deleted successfully.");
      handleClose();
      onSuccess?.();
    } catch (err) {
      setError(`Failed to delete task: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDialogTitle>Are you sure you want to permanently delete this task?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Task: <span className="font-medium text-gray-900">{taskTitle}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
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
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleDelete();
                  }
                }}
                className="pl-10"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <AlertDialogCancel onClick={handleClose} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={loading || !pin}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
