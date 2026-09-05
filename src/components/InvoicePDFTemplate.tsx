import * as React from "react";
import { formatCurrency, formatDate, formatPaymentStatus } from "@/lib/formatting";
import type { Invoice } from "@/lib/billing";
import { getSession } from "@/lib/auth";

interface InvoicePDFTemplateProps {
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

export const InvoicePDFTemplate = React.forwardRef<HTMLDivElement, InvoicePDFTemplateProps>(
  ({ invoice }, ref) => {
    const session = getSession();
    const isAdmin = session?.role === "admin";

    const pendingAmount = Math.max(0, invoice.totalAmount - (invoice.totalPaid || 0));

    const getStatusStyle = (status: string) => {
      switch (status) {
        case "Paid":
          return { backgroundColor: "#bbf7d0", color: "#14532d", border: "1px solid #86efac" };
        case "Partially Paid":
          return { backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
        case "Pending":
          return { backgroundColor: "#ffedd5", color: "#9a3412", border: "1px solid #fed7aa" };
        case "Cancelled":
          return { backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" };
        default:
          return { backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" };
      }
    };

    const statusStyle = getStatusStyle(invoice.status || "");

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
      <div
        ref={ref}
        id="invoice-pdf"
        style={{
          backgroundColor: "#ffffff",
          color: "#1e293b",
          fontFamily: "Inter, Arial, sans-serif",
          padding: "40px",
          boxSizing: "border-box",
          width: "100%",
          minHeight: "297mm",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER SECTION */}
        <div
          style={{
            borderBottom: "2px solid #e2e8f0",
            paddingBottom: "20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                height: "64px",
                width: "64px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "16px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "24px",
                fontWeight: "bold",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            >
              SS
            </div>
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#2563eb", margin: 0, letterSpacing: "-0.025em" }}>
                INVOICE
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: "#1e293b",
                  margin: "4px 0 0 0",
                }}
              >
                {COMPANY_NAME}
              </p>
              <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 0 0" }}>
                {COMPANY_ADDRESS}
              </p>
              <p style={{ fontSize: "10px", color: "#64748b", margin: "2px 0 0 0", fontFamily: "monospace" }}>
                GSTIN: {GST_NUMBER}
              </p>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "20px", fontWeight: "900", color: "#1e293b", margin: 0 }}>
              {safeText(invoice.invoiceNumber)}
            </p>
            <div
              style={{ marginTop: "6px", fontSize: "11px", color: "#475569", lineHeight: "1.4" }}
            >
              <p style={{ margin: 0 }}>Invoice Date: {formatDate(invoice.invoiceDate)}</p>
              <p style={{ margin: 0 }}>
                Period: {formatDate(invoice.billingPeriodStart)} to {formatDate(invoice.billingPeriodEnd)}
              </p>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#2563eb" }}>
                Sub Module: {getSubModuleLabel(invoice.subModule)}
              </p>
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: "10px",
                padding: "3px 10px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontWeight: "700",
                ...statusStyle,
              }}
            >
              {safeText(formatPaymentStatus(invoice.status))}
            </span>
          </div>
        </div>

        {/* SENDER & RECEIVER DETAILS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            marginBottom: "24px",
            fontSize: "12px",
            color: "#334155",
          }}
        >
          {/* SENDER INFO */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "#f8fafc",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "800",
                color: "#1e293b",
                margin: "0 0 8px 0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              CONTACT DETAILS
            </h3>
            <p style={{ margin: "3px 0" }}>
              <strong>Phone:</strong> {CONTACT_NUMBER}
            </p>
            <p style={{ margin: "3px 0" }}>
              <strong>Email:</strong> {CONTACT_EMAIL}
            </p>
          </div>

          {/* BILL TO */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "#f8fafc",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "800",
                color: "#1e293b",
                margin: "0 0 8px 0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              BILL TO
            </h3>
            <p style={{ margin: "3px 0", fontSize: "13px", fontWeight: "800", color: "#0f172a" }}>
              {safeText(invoice.clientName)}
            </p>
            <p style={{ margin: "3px 0" }}>
              <strong>Mobile:</strong> {safeText(invoice.clientMobile)}
            </p>
            <p style={{ margin: "3px 0" }}>
              <strong>Address:</strong> {safeText(invoice.clientAddress)}
            </p>
            {invoice.vehicleNumber && (
              <p style={{ margin: "3px 0" }}>
                <strong>Vehicle:</strong> {safeText(invoice.vehicleNumber)} {invoice.vehicleType ? `(${invoice.vehicleType})` : ""}
              </p>
            )}
          </div>
        </div>

        {/* APPLICATION METADATA */}
        <div
          style={{
            marginBottom: "24px",
            padding: "12px 14px",
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            fontSize: "11px",
            color: "#475569",
            lineHeight: "1.5",
            border: "1px dashed #cbd5e1",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <strong>Assignee:</strong> {safeText(invoice.assignedEmployee)}
            </div>
            <div>
              <strong>Created By:</strong> {safeText(invoice.createdBy)}
            </div>
            <div>
              <strong>Generated At:</strong> {new Date(invoice.createdAt || invoice.invoiceDate).toLocaleString("en-IN")}
            </div>
            <div>
              <strong>Client ID:</strong> {safeText(invoice.clientId)}
            </div>
          </div>
        </div>

        {/* SERVICE BREAKDOWN TABLE */}
        <div style={{ flex: 1, marginBottom: "24px" }}>
          <h3
            style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a", margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            SERVICES BREAKDOWN
          </h3>

          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: "bold" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left" }}>Service</th>
                  <th style={{ padding: "10px 14px", textAlign: "left" }}>Vehicle / Details</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Unit Price</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.services?.map((service, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < invoice.services.length - 1 ? "1px solid #e2e8f0" : "none", color: "#334155" }}>
                    <td style={{ padding: "10px 14px", fontWeight: "600" }}>{service.serviceName}</td>
                    <td style={{ padding: "10px 14px" }}>{service.vehicleNumber || "—"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>{service.quantity || 1}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace" }}>{formatCurrency(service.unitPrice)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: "bold", fontFamily: "monospace" }}>{formatCurrency(service.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FINANCIAL SUMMARY & REMARKS */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", marginBottom: "24px", fontSize: "11px" }}>
          {/* Remarks */}
          <div>
            {invoice.notes && (
              <div style={{ backgroundColor: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "11px", fontWeight: "800", color: "#475569", margin: "0 0 6px 0", textTransform: "uppercase" }}>Remarks / Notes</h4>
                <p style={{ margin: 0, color: "#64748b", fontStyle: "italic" }}>"{invoice.notes}"</p>
              </div>
            )}
          </div>

          {/* Financial calculations */}
          <div style={{ lineHeight: "1.8", color: "#334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: "600", fontFamily: "monospace" }}>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.totalTax > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>GST (18%):</span>
                <span style={{ fontWeight: "600", fontFamily: "monospace" }}>{formatCurrency(invoice.totalTax)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "4px", marginTop: "4px" }}>
              <span>Total Charges:</span>
              <span style={{ fontWeight: "bold", fontFamily: "monospace" }}>{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Advance Paid:</span>
              <span style={{ fontWeight: "bold", color: "#16a34a", fontFamily: "monospace" }}>{formatCurrency(invoice.totalPaid || 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px", marginBottom: "4px" }}>
              <span>Outstanding:</span>
              <span style={{ fontWeight: "bold", color: "#dc2626", fontFamily: "monospace" }}>{formatCurrency(pendingAmount)}</span>
            </div>

            {/* RTO metrics */}
            <div style={{ backgroundColor: "#f8fafc", padding: "8px", borderRadius: "8px", marginTop: "6px", border: "1px solid #e2e8f0", fontSize: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>RTO Receipt:</span>
                <span style={{ fontFamily: "monospace" }}>{formatCurrency(invoice.rtoReceipt || 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>RTO Expense:</span>
                <span style={{ fontFamily: "monospace" }}>{formatCurrency(invoice.rtoExpense || 0)}</span>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: "4px", marginTop: "4px", fontWeight: "800", color: "#1e3a8a" }}>
                  <span>NET PROFIT:</span>
                  <span style={{ fontFamily: "monospace" }}>{formatCurrency(invoice.profit || 0)}</span>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                backgroundColor: "#eff6ff",
                padding: "8px 12px",
                borderRadius: "8px",
                fontWeight: "900",
                fontSize: "14px",
                color: "#1e3a8a",
                marginTop: "10px",
                border: "1px solid #bfdbfe",
              }}
            >
              <span>GRAND TOTAL:</span>
              <span style={{ fontFamily: "monospace" }}>{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "12px",
            textAlign: "center",
            fontSize: "9px",
            color: "#94a3b8",
            marginTop: "auto",
          }}
        >
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>Thank you for doing business with Shree Sainath Consultancy!</p>
          <p style={{ margin: "2px 0" }}>Office Address: Professional Consulting Services, RTO Agent Premises • Support: {CONTACT_EMAIL}</p>
          <p style={{ margin: "2px 0", fontSize: "8px", color: "#cbd5e1" }}>
            Invoice ID: {invoice.id}
          </p>
        </div>
      </div>
    );
  },
);

InvoicePDFTemplate.displayName = "InvoicePDFTemplate";
