// InvoiceHistory Component - Display invoices for a client
import { useEffect, useState } from "react";
import { Download, Printer, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeToClientInvoices, type Invoice } from "@/lib/billing";
import { generateInvoicePDF, printWindow, formatCurrency, formatDate } from "@/lib/pdfGenerator";

interface InvoiceHistoryProps {
  clientId: string;
  onViewInvoice?: (invoice: Invoice) => void;
}

export function InvoiceHistory({ clientId, onViewInvoice }: InvoiceHistoryProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToClientInvoices(clientId, (data) => {
      setInvoices(data);
      setLoading(false);
    });

    return () => unsub();
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Loading invoices...</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">No invoices found</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-800";
      case "Partially Paid":
        return "bg-yellow-100 text-yellow-800";
      case "Pending":
        return "bg-orange-100 text-orange-800";
      case "Cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-4">
      {invoices.map((invoice) => (
        <div key={invoice.id} className="border rounded-lg p-4 hover:bg-gray-50 transition">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{invoice.invoiceNumber}</h4>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${getStatusColor(invoice.status)}`}
                >
                  {invoice.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Invoice Date:</span>{" "}
                  {formatDate(invoice.invoiceDate)}
                </div>
                <div>
                  <span className="font-medium">Billing Period:</span>{" "}
                  {formatDate(invoice.billingPeriodStart)} to {formatDate(invoice.billingPeriodEnd)}
                </div>
                <div>
                  <span className="font-medium">Collection Date:</span>{" "}
                  {invoice.collectionDate ? formatDate(invoice.collectionDate) : "Not Scheduled"}
                </div>
                <div>
                  <span className="font-medium">Amount:</span> {formatCurrency(invoice.totalAmount)}
                </div>
                <div>
                  <span className="font-medium">Created By:</span> {invoice.createdBy}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewInvoice?.(invoice)}
                title="View Invoice"
              >
                <Eye className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateInvoicePDF(invoice)}
                title="Download PDF"
              >
                <Download className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={printWindow} title="Print Invoice">
                <Printer className="size-4" />
              </Button>
            </div>
          </div>

          {/* Service items summary */}
          <div className="mt-3 text-xs text-muted-foreground">
            <div className="font-medium">Services:</div>
            <div>
              {invoice.services.map((svc, idx) => (
                <div key={idx}>
                  {svc.serviceName} ({svc.vehicleNumber}) - {formatCurrency(svc.total)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
