// DuplicateDetectionDialog — Show possible duplicate entries before saving.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatActivityTime } from "@/lib/activity";
import { type RegistryRecord } from "@/lib/records";

interface DuplicateDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: RegistryRecord[];
  onContinue: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DuplicateDetectionDialog({
  open,
  onOpenChange,
  duplicates,
  onContinue,
  onCancel,
  loading = false,
}: DuplicateDetectionDialogProps) {
  if (!duplicates.length) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertDialogTitle>Possible Duplicate Found</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            A similar record already exists. Do you want to continue creating this entry?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto py-4">
          {duplicates.map((record) => (
            <div key={record.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Vehicle Number</p>
                  <p className="font-mono font-medium">{record.mvNo}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Work Type</p>
                  <p className="font-medium">{record.work}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Customer Name</p>
                  <p className="font-medium">{record.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <Badge variant="outline" className="mt-1 capitalize">
                    {record.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Created Date</p>
                  <p className="text-sm">{formatActivityTime(record.date)}</p>
                </div>
                {record.groupName && (
                  <div>
                    <p className="text-xs text-gray-600">Group</p>
                    <p className="text-sm">{record.groupName}</p>
                  </div>
                )}
              </div>
              {record.assignee && (
                <div className="mt-3 border-t border-amber-200 pt-2">
                  <p className="text-xs text-gray-600">Assigned to</p>
                  <p className="text-sm font-medium">{record.assignee}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <AlertDialogCancel onClick={onCancel} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue} disabled={loading}>
            {loading ? "Saving..." : "Continue Anyway"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
