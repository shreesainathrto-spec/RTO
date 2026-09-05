import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock, KeyRound } from "lucide-react";
import { updateAdminPin } from "@/lib/adminSecurity";
import { toast } from "sonner";

interface ChangePinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ChangePinModal({ open, onOpenChange, onSuccess }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setAdminPassword("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validations
    if (!currentPin) {
      setError("Current Delete PIN is required.");
      return;
    }
    if (!newPin || !/^\d{4,8}$/.test(newPin)) {
      setError("New Delete PIN must be 4–8 digits.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setError("Confirm PIN does not match.");
      return;
    }
    if (!adminPassword) {
      setError("Administrator Password is required.");
      return;
    }

    setLoading(true);
    try {
      await updateAdminPin(currentPin, newPin, confirmNewPin, adminPassword);
      toast.success("Delete PIN updated successfully.");
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update Delete PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <DialogTitle>Change Delete Confirmation PIN</DialogTitle>
          </div>
          <DialogDescription>
            Update the global security PIN required for all delete operations across the CRM.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Current Delete PIN */}
          <div className="space-y-1">
            <Label htmlFor="currentPin">Current Delete PIN *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="currentPin"
                type="password"
                placeholder="Enter current PIN"
                value={currentPin}
                onChange={(e) => {
                  setCurrentPin(e.target.value);
                  setError("");
                }}
                className="pl-10 font-mono"
                required
                autoFocus
              />
            </div>
          </div>

          {/* New Delete PIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="newPin">New Delete PIN *</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPin"
                  type="password"
                  maxLength={8}
                  placeholder="4–8 digits"
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value);
                    setError("");
                  }}
                  className="pl-10 font-mono"
                  required
                />
              </div>
            </div>

            {/* Confirm New Delete PIN */}
            <div className="space-y-1">
              <Label htmlFor="confirmNewPin">Confirm New PIN *</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmNewPin"
                  type="password"
                  maxLength={8}
                  placeholder="Confirm PIN"
                  value={confirmNewPin}
                  onChange={(e) => {
                    setConfirmNewPin(e.target.value);
                    setError("");
                  }}
                  className="pl-10 font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Administrator Password */}
          <div className="space-y-1 pt-1">
            <Label htmlFor="adminPassword">Administrator Password *</Label>
            <p className="text-xs text-muted-foreground">
              Enter your current account login password to authorize this security update.
            </p>
            <Input
              id="adminPassword"
              type="password"
              placeholder="Enter your admin password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                setError("");
              }}
              required
            />
          </div>

          {error && <p className="text-xs text-destructive font-medium">{error}</p>}

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating PIN…" : "Save New PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
