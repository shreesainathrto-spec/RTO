import { verifyAdminPin, logDeletion } from '@/lib/adminSecurity';
import { toast } from 'sonner';

/**
 * Executes a delete operation only after successful admin PIN verification.
 * Logs the attempt and result.
 *
 * @param deleteFn   The actual delete function (e.g., deleteClient(id)).
 * @param recordType Human readable type (e.g., 'Client').
 * @param recordId   Firestore document ID.
 * @param userId     UID of the user performing the action.
 */
export async function secureDelete(
  deleteFn: () => Promise<void>,
  recordType: string,
  recordId: string,
  userId: string
) {
  console.log('[DeleteAttempt]');
  console.log('[PinVerificationStarted]');
  const pin = prompt('Enter Admin PIN to delete this record:');
  if (!pin) {
    console.log('[PinVerificationFailed] (no input)');
    toast.error('Deletion cancelled');
    await logDeletion({
      recordType,
      recordId,
      deletedBy: userId,
      deletedAt: new Date(),
      pinVerified: false,
    });
    return;
  }
  const ok = await verifyAdminPin(pin);
  if (!ok) {
    console.log('[PinVerificationFailed]');
    toast.error('Invalid Admin PIN');
    await logDeletion({
      recordType,
      recordId,
      deletedBy: userId,
      deletedAt: new Date(),
      pinVerified: false,
    });
    return;
  }
  console.log('[PinVerificationSuccess]');
  await deleteFn();
  console.log('[ClientDeleted]');
  await logDeletion({
    recordType,
    recordId,
    deletedBy: userId,
    deletedAt: new Date(),
    pinVerified: true,
  });
  toast.success(`${recordType} deleted`);
}
