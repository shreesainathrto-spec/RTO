import {
  Download,
  Printer,
  X,
  Loader2,
  Calendar,
  ShieldAlert,
  Trash2,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateInvoicePDF, printWindow, formatCurrency, formatDate } from "@/lib/pdfGenerator";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { logClientActivity } from "@/lib/activity";
import {
  type Invoice,
  type InvoicePayment,
  recordInvoicePayment,
  deleteInvoiceById,
  subscribeToInvoicePayments,
} from "@/lib/billing";
import { deleteInvoiceSecured } from "@/lib/financeService";
import { toast } from "sonner";
import { formatPaymentStatus } from "@/lib/formatting";

interface InvoiceViewerProps {
  invoice: Invoice;
  onClose: () => void;
}

export function InvoiceViewer({ invoice: initialInvoice, onClose }: InvoiceViewerProps) {
  const [invoice, setInvoice] = useState<Invoice>(initialInvoice);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Live payments
  const [payments, setPayments] = useState<InvoicePayment[]>([]);

  // Add payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [payAccount, setPayAccount] = useState("Current Account");
  const [payRemarks, setPayRemarks] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingPayment, setSavingPayment] = useState(false);

  // Delete invoice dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const session = getSession();
  const actor = session?.username || "system";
  const actorName = session?.name || actor;
  const isAdmin = session?.role === "admin" || session?.role === "manager";

  // Real-time synchronization for the Invoice document
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "billing_invoices", initialInvoice.id), (snap) => {
      if (snap.exists()) {
        setInvoice({ id: snap.id, ...snap.data() } as Invoice);
      }
    });
    return () => unsub();
  }, [initialInvoice.id]);

  // Real-time subscription to payments linked to this invoice
  useEffect(() => {
    const unsub = subscribeToInvoicePayments(initialInvoice.id, (list) => {
      setPayments(list);
    });
    return () => unsub();
  }, [initialInvoice.id]);

  // Handle planned collection date update
  const handleUpdateCollectionDate = async (newDate: string) => {
    try {
      await updateDoc(doc(db, "billing_invoices", invoice.id), {
        collectionDate: newDate || null,
      });
      toast.success("Payment collection date updated!");
    } catch (err: any) {
      toast.error("Failed to update collection date");
    }
  };

  // Handle Ask Bhaylubha toggle
  const handleToggleBhaylubha = async (checked: boolean) => {
    try {
      await updateDoc(doc(db, "billing_invoices", invoice.id), {
        askBhaylubha: checked,
      });
      await logClientActivity(
        invoice.clientId,
        actor,
        actorName,
        `Admin ${checked ? "enabled" : "disabled"} Ask Bhaylubha approval flag`,
        "invoice_update",
        "askBhaylubha",
        `Invoice: ${invoice.invoiceNumber}`,
      );
      toast.success(checked ? "Bhaylubha approval required" : "Bhaylubha flag cleared");
    } catch (err: any) {
      toast.error("Failed to update approval flag");
    }
  };

  // Handle Payment Submit
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(payAmount);
    const maxAllowed = invoice.totalAmount - (invoice.totalPaid || 0);

    if (!payAmount || isNaN(amt) || amt <= 0) {
      return toast.error("Please enter a valid amount");
    }
    if (amt > maxAllowed) {
      return toast.error(`Amount exceeds pending balance of ₹${maxAllowed.toLocaleString()}`);
    }

    setSavingPayment(true);
    try {
      await recordInvoicePayment(
        invoice.id,
        amt,
        payMethod,
        payAccount,
        actorName,
        payRemarks,
        payDate,
      );
      toast.success("Payment recorded successfully!");
      setPayAmount("");
      setPayRemarks("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  };

  // Handle Invoice Deletion
  const handleDeleteInvoice = async () => {
    if (!session || session.role !== "admin") {
      return toast.error("Permission Denied: Only Admin users can delete invoices.");
    }
    if (!deleteReason.trim()) {
      return toast.error("Please provide a reason for deletion");
    }

    setDeleting(true);
    try {
      await deleteInvoiceSecured(invoice.id, adminPin, deleteReason, actorName, session.role);
      toast.success("Invoice deleted successfully!");
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete invoice");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    setPdfError(null);
    try {
      await generateInvoicePDF(invoice);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Failed to generate PDF");
      console.error("PDF generation error:", error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-800 border-green-200";
      case "Partially Paid":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Pending":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full my-8 flex flex-col max-h-[92vh] border overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-800">Invoice {invoice.invoiceNumber}</h2>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadgeColor(invoice.status)}`}
            >
              {formatPaymentStatus(invoice.status)}
            </span>
            {invoice.askBhaylubha && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <HelpCircle className="size-3" /> Ask Bhaylubha
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition text-gray-500 hover:text-gray-800"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Collection Schedule & Approval Checkbox config */}
          <div className="grid gap-4 sm:grid-cols-2 bg-slate-50 p-4 border rounded-xl">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                <Calendar className="size-3.5" /> Planned Payment Collection Date
              </Label>
              <Input
                type="date"
                disabled={!isAdmin}
                value={invoice.collectionDate || ""}
                onChange={(e) => handleUpdateCollectionDate(e.target.value)}
                className="bg-white border-gray-200 text-sm"
              />
            </div>
            <div className="flex items-center gap-2.5 pl-2 sm:border-l sm:pl-6">
              <input
                id="askBhay"
                type="checkbox"
                disabled={!isAdmin}
                checked={!!invoice.askBhaylubha}
                onChange={(e) => handleToggleBhaylubha(e.target.checked)}
                className="size-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <label
                htmlFor="askBhay"
                className="text-sm font-semibold text-gray-700 cursor-pointer select-none disabled:opacity-50"
              >
                Require Bhaylubha Approval before settlement
              </label>
            </div>
          </div>

          {/* Invoice Document Renderer */}
          <div className="border rounded-2xl p-6 bg-white shadow-sm">
            <InvoiceDocument invoice={invoice} />
          </div>

          {/* Linked Payments Segment */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Record Payment Form */}
            {invoice.status !== "Paid" && isAdmin && (
              <form
                onSubmit={handleRecordPayment}
                className="md:col-span-1 border rounded-xl p-4 bg-slate-50 space-y-3"
              >
                <h4 className="font-bold text-sm text-gray-700 uppercase border-b pb-1.5">
                  Add Payment
                </h4>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Amount (₹) *
                  </Label>
                  <Input
                    type="number"
                    required
                    placeholder="Amount received"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Payment Date
                  </Label>
                  <Input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Payment Method
                  </Label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full text-sm border rounded-md p-2 bg-white"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online Payment">Online Payment</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Received In Account
                  </Label>
                  <select
                    value={payAccount}
                    onChange={(e) => setPayAccount(e.target.value)}
                    className="w-full text-sm border rounded-md p-2 bg-white"
                  >
                    <option value="Main Account">Main Account</option>
                    <option value="Current Account">Current Account</option>
                    <option value="Cash Account">Cash Account</option>
                    <option value="Other Accounts">Other Accounts</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Remarks
                  </Label>
                  <Input
                    placeholder="Transaction ID, check info etc."
                    value={payRemarks}
                    onChange={(e) => setPayRemarks(e.target.value)}
                    className="bg-white"
                  />
                </div>

                <Button type="submit" disabled={savingPayment} className="w-full mt-2">
                  {savingPayment ? <Loader2 className="size-4 animate-spin" /> : "Record Payment"}
                </Button>
              </form>
            )}

            {/* Payment History List */}
            <div
              className={`${invoice.status === "Paid" ? "md:col-span-3" : "md:col-span-2"} border rounded-xl p-4 bg-white`}
            >
              <h4 className="font-bold text-sm text-gray-700 uppercase border-b pb-1.5 mb-3">
                Payment History
              </h4>

              {payments.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground">
                  No payments received for this invoice.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground bg-slate-50 uppercase text-[9px] font-bold">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Method</th>
                        <th className="p-2.5">Account</th>
                        <th className="p-2.5">Received By</th>
                        <th className="p-2.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-gray-700">
                      {payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono">{p.paymentDate}</td>
                          <td className="p-2.5 font-bold font-mono text-emerald-600">
                            ₹
                            {p.amountReceived?.toLocaleString("en-IN") ||
                              p.amount?.toLocaleString("en-IN")}
                          </td>
                          <td className="p-2.5">{p.paymentMethod || p.paymentMode}</td>
                          <td className="p-2.5">{p.receivedInAccount || "—"}</td>
                          <td className="p-2.5">{p.receivedBy}</td>
                          <td
                            className="p-2.5 text-muted-foreground max-w-[150px] truncate"
                            title={p.remarks || p.notes || ""}
                          >
                            {p.remarks || p.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {pdfError && (
          <div className="mx-6 mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            Error generating PDF: {pdfError}
          </div>
        )}

        {/* Sticky Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-2 justify-between items-center z-10">
          {session?.role === "admin" ? (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:bg-destructive/10 border-destructive/20 gap-1.5"
            >
              <Trash2 className="size-4" /> Delete Invoice
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={printWindow}>
              <Printer className="size-4 mr-2" /> Print
            </Button>
            <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF}>
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Download className="size-4 mr-2" /> Download PDF
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Admin PIN Verification Modal for Deletion */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full border text-center space-y-4">
            <div className="mx-auto size-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="size-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Secure Deletion Required</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Authorized Admin PIN and reason are required to delete invoice{" "}
                {invoice.invoiceNumber}.
              </p>
            </div>

            <div className="space-y-3 text-left">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-gray-500">Admin PIN *</Label>
                <Input
                  type="password"
                  placeholder="Enter 4-digit PIN"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="text-center font-mono tracking-[0.5em] text-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-gray-500">
                  Reason for Deletion *
                </Label>
                <Input
                  placeholder="e.g. Duplicate invoice, incorrect pricing"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setAdminPin("");
                  setDeleteReason("");
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button onClick={handleDeleteInvoice} disabled={deleting} variant="destructive">
                {deleting ? <Loader2 className="size-4 animate-spin" /> : "Verify & Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
