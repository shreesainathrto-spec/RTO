import { formatCurrency, formatDate } from "@/lib/formatting";
import type { Invoice } from "@/lib/billing";
import { getSession } from "@/lib/auth";

interface InvoiceDocumentProps {
  invoice: Invoice;
}

const COMPANY_NAME = "Shree Sainath Consultancy";
const COMPANY_ADDRESS = "Professional Consulting Services, RTO Agent Premises";
const GST_NUMBER = "24AAAAA1111A1Z1";
const CONTACT_NUMBER = "+91 98765 43210";
const CONTACT_EMAIL = "contact@sainathconsultancy.com";

function safeText(value?: string): string {
  return value && value.trim() ? value : "—";
}

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

export function InvoiceDocument({ invoice }: InvoiceDocumentProps) {
  const session = getSession();
  const isAdmin = session?.role === "admin";

  const pendingAmount = Math.max(0, invoice.totalAmount - (invoice.totalPaid || 0));

  // Determine subModule labels
  const getSubModuleLabel = (sm?: string) => {
    switch (sm) {
      case "services": return "Vahaan Billing";
      case "licence": return "Licence Billing";
      case "insurance": return "Insurance Billing";
      case "form5": return "Form 5 Billing";
      case "driving_school": return "Driving School Billing";
      default: return "General Billing";
    }
  };

  return (
    <div className="bg-white text-slate-900 font-sans leading-relaxed">
      {/* Brand Header */}
      <div className="border-b pb-6 mb-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white text-lg font-bold shadow-md">
              SS
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">INVOICE</h1>
              <p className="text-md font-bold text-slate-800 mt-1">{COMPANY_NAME}</p>
              <p className="text-xs text-slate-500 mt-0.5">{COMPANY_ADDRESS}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">GSTIN: {GST_NUMBER}</p>
            </div>
          </div>
          <div className="text-left lg:text-right space-y-1">
            <p className="text-2xl font-black text-slate-800">{safeText(invoice.invoiceNumber)}</p>
            <div className="text-xs text-slate-600 font-medium">
              <p>Invoice Date: {formatDate(invoice.invoiceDate)}</p>
              <p>
                Period: {formatDate(invoice.billingPeriodStart)} to {formatDate(invoice.billingPeriodEnd)}
              </p>
              <p className="mt-1">
                Sub Module: <span className="font-bold text-blue-600">{getSubModuleLabel(invoice.subModule)}</span>
              </p>
            </div>
            <span
              className={`inline-flex mt-2 px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(invoice.status || "")}`}
            >
              {safeText(invoice.status)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 text-xs text-slate-600 border-t pt-4">
          <div>
            <p className="font-bold text-slate-700">Contact Number</p>
            <p className="font-mono mt-0.5">{CONTACT_NUMBER}</p>
          </div>
          <div>
            <p className="font-bold text-slate-700">Email Address</p>
            <p className="font-mono mt-0.5">{CONTACT_EMAIL}</p>
          </div>
        </div>
      </div>

      {/* Customer & Application Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 pb-6 border-b mb-6 text-xs">
        <div>
          <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3">BILL TO</h3>
          <div className="space-y-1.5 text-slate-700">
            <p className="text-sm font-black text-slate-900">{safeText(invoice.clientName)}</p>
            <p><strong>Mobile:</strong> {safeText(invoice.clientMobile)}</p>
            <p><strong>Address:</strong> {safeText(invoice.clientAddress)}</p>
            {invoice.vehicleNumber && (
              <p>
                <strong>Vehicle:</strong> {safeText(invoice.vehicleNumber)} {invoice.vehicleType ? `(${invoice.vehicleType})` : ""}
              </p>
            )}
            <p className="text-slate-400 font-mono text-[10px] pt-1">Client ID: {safeText(invoice.clientId)}</p>
          </div>
        </div>
        <div>
          <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3">APPLICATION DETAILS</h3>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Assignee:</span>
              <span className="font-bold text-slate-800">{safeText(invoice.assignedEmployee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Created By:</span>
              <span className="font-medium">{safeText(invoice.createdBy)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Generated At:</span>
              <span className="font-mono">{new Date(invoice.createdAt || invoice.invoiceDate).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div className="pb-6 mb-6">
        <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3">SERVICES BREAKDOWN</h3>
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-600 font-bold uppercase text-[10px]">
                <th className="px-4 py-3 text-left">Service</th>
                <th className="px-4 py-3 text-left">Vehicle / Details</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.services?.map((service, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 text-slate-700">
                  <td className="px-4 py-3 font-semibold">{service.serviceName}</td>
                  <td className="px-4 py-3">{service.vehicleNumber || "—"}</td>
                  <td className="px-4 py-3 text-center font-mono">{service.quantity || 1}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(service.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-bold font-mono">{formatCurrency(service.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b mb-6 text-xs">
        <div>
          {/* Remarks block */}
          {invoice.notes && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h4 className="font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Remarks / Remarks Notes</h4>
              <p className="text-slate-600 leading-relaxed italic">"{invoice.notes}"</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3">FINANCIAL SUMMARY</h3>
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-mono font-semibold">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.totalTax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax (GST 18%):</span>
                <span className="font-mono font-semibold">{formatCurrency(invoice.totalTax)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 border-t pt-1.5">
              <span>Total Charges:</span>
              <span className="font-mono font-bold">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Advance Paid:</span>
              <span className="font-mono font-bold text-emerald-600">{formatCurrency(invoice.totalPaid || 0)}</span>
            </div>
            <div className="flex justify-between text-slate-600 border-b pb-1.5">
              <span>Outstanding Amount:</span>
              <span className="font-mono font-bold text-red-600">{formatCurrency(pendingAmount)}</span>
            </div>

            {/* RTO Receipt / Expense Details */}
            <div className="bg-slate-50 p-3 rounded-lg space-y-1.5 mt-2 border border-slate-100">
              <div className="flex justify-between text-slate-600">
                <span>RTO Receipt:</span>
                <span className="font-mono font-medium">{formatCurrency(invoice.rtoReceipt || 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>RTO Expense:</span>
                <span className="font-mono font-medium">{formatCurrency(invoice.rtoExpense || 0)}</span>
              </div>
              
              {/* Net Profit (Visible to Admin only) */}
              {isAdmin && (
                <div className="flex justify-between text-blue-800 font-extrabold border-t pt-1.5">
                  <span>NET PROFIT:</span>
                  <span className="font-mono">{formatCurrency(invoice.profit || 0)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between bg-blue-600 text-white p-3 rounded-xl font-black text-base shadow-sm">
              <span>GRAND TOTAL:</span>
              <span className="font-mono">{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Details */}
      <div className="bg-slate-50 p-4 rounded-xl border text-slate-500 text-[10px] leading-relaxed">
        <h4 className="font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Terms & Conditions</h4>
        <ul className="list-disc pl-4 space-y-1">
          <li>This is a computer-generated document. No physical signature is required.</li>
          <li>Branding logo and details represent professional RTO agent consultancy services.</li>
          <li>For support or billing disputes, please contact support via {CONTACT_EMAIL}.</li>
          <li>Thank you for doing business with Shree Sainath Consultancy!</li>
        </ul>
      </div>
    </div>
  );
}
