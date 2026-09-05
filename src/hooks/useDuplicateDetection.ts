// useDuplicateDetection — Hook for duplicate detection in forms.
import { useState } from "react";
import { checkForDuplicates, type Bucket, type RegistryRecord } from "@/lib/records";
import { createActivity } from "@/lib/activity";
import { toast } from "sonner";

interface UseDuplicateDetectionProps {
  bucket: Bucket;
  actor: string;
}

export function useDuplicateDetection({ bucket, actor }: UseDuplicateDetectionProps) {
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<RegistryRecord[]>([]);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [loading, setLoading] = useState(false);

  const checkAndSave = async (
    mvNo: string,
    work: string,
    onSave: () => Promise<void>,
    excludeId?: string,
  ): Promise<void> => {
    try {
      setLoading(true);
      const dups = await checkForDuplicates(bucket, mvNo, work, excludeId);

      if (dups.length > 0) {
        // Show duplicate dialog
        setDuplicates(dups);
        setPendingAction(() => onSave);
        setDuplicateDialogOpen(true);
        setLoading(false);
      } else {
        // No duplicates, proceed with save
        await onSave();
      }
    } catch (error) {
      console.error("Error checking duplicates:", error);
      setLoading(false);
      throw error;
    }
  };

  const handleContinueWithDuplicate = async () => {
    if (!pendingAction) return;
    try {
      setLoading(true);
      // Log override activity
      const activity = createActivity(
        actor,
        "Duplicate warning overridden",
        "duplicateOverride",
        "shown",
        "accepted",
      );

      // Execute the pending save
      await pendingAction();

      // Reset state
      setDuplicateDialogOpen(false);
      setDuplicates([]);
      setPendingAction(null);
      setLoading(false);
    } catch (error) {
      console.error("Error saving after duplicate override:", error);
      setLoading(false);
      toast.error(
        `Failed to save client after override: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleCancelDuplicate = () => {
    setDuplicateDialogOpen(false);
    setDuplicates([]);
    setPendingAction(null);
    setLoading(false);
  };

  return {
    duplicateDialogOpen,
    duplicates,
    loading,
    checkAndSave,
    handleContinueWithDuplicate,
    handleCancelDuplicate,
  };
}
