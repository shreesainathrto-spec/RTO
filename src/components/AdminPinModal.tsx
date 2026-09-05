import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { verifyAdminPin } from '@/lib/adminSecurity';
import { toast } from 'sonner';

interface AdminPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void; // called after successful verification
}

export function AdminPinModal({ open, onOpenChange, onSuccess }: AdminPinModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const ok = await verifyAdminPin(pin);
      if (ok) {
        toast.success('Admin PIN verified');
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error('Invalid Admin PIN');
      }
    } catch (e) {
      console.error(e);
      toast.error('Verification error');
    } finally {
      setLoading(false);
      setPin('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admin PIN Required</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm font-medium">Enter Admin PIN:</label>
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            placeholder="******"
            disabled={loading}
          />
        </div>
        <DialogFooter className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={loading || !pin.trim()}>
            {loading ? 'Verifying…' : 'Verify & Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
