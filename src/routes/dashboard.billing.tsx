import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Plus,
  Download,
  Printer,
  Search,
  FileText,
} from "lucide-react";
import { subscribeInvoicesBySubModule, calculateBillingMetrics, migrateExistingInvoices, type Invoice } from "@/lib/billing";
import {
  generateInvoicePDF,
  printWindow,
  formatCurrency,
  formatDate,
  generatePDF,
} from "@/lib/pdfGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvoiceGenerator } from "@/components/InvoiceGenerator";
import { InvoiceViewer } from "@/components/InvoiceViewer";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingDashboard,
});

import { getSession } from "@/lib/auth";

import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";

function BillingDashboard() {
  const session = getSession();
  const isAdmin = session?.role === "admin" || session?.role === "manager";

  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState({
    totalInvoiced: 0,
    totalCollected: 0,
    outstandingAmount: 0,
    invoicesThisMonth: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    collectionRate: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<"overview" | "generate" | "history">("overview");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterBhaylubha, setFilterBhaylubha] = useState<string>("all");

  // Run on-mount migration for legacy invoices without subModule
  useEffect(() => {
    migrateExistingInvoices();
  }, []);

  // Subscribe to invoices filtered by active subModule
  useEffect(() => {
    const unsub = subscribeInvoicesBySubModule(activeSubModule, (data) => {
      setInvoices(data);
    });

    return () => unsub();
  }, [activeSubModule]);

  // Calculate metrics for active subModule
  useEffect(() => {
    (async () => {
      const m = await calculateBillingMetrics(activeSubModule);
      setMetrics(m);
    })();
  }, [invoices, activeSubModule]);

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      searchTerm === "" ||
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === "all" || inv.status === filterStatus;

    const matchesBhaylubha =
      filterBhaylubha === "all" ||
      (filterBhaylubha === "required" && inv.askBhaylubha === true) ||
      (filterBhaylubha === "completed" && !inv.askBhaylubha);

    return matchesSearch && matchesStatus && matchesBhaylubha;
  });

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

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    trend,
  }: {
    icon: any;
    label: string;
    value: string;
    trend?: number;
  }) => (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {trend !== undefined && (
            <p className={`text-xs mt-1 ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
              {trend > 0 ? "+" : ""}
              {trend}% vs last month
            </p>
          )}
        </div>
        <div className="p-2 bg-blue-100 rounded-lg">
          <Icon className="size-5 text-blue-600" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Billing & Invoicing</h2>
          <p className="text-sm text-muted-foreground">
            Professional invoice management and payment tracking
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              generatePDF("finance", {
                invoiceNumber: "FIN-REPORT-" + new Date().getFullYear(),
                invoiceDate: new Date().toLocaleDateString("en-IN"),
                clientName: "Consolidated Finance Report",
                totalAmount: metrics.totalInvoiced,
                totalPaid: metrics.totalCollected,
                status: "Summary",
                payments: invoices.map((i) => ({
                  date: i.invoiceDate || "",
                  amount: i.amountPaid || 0,
                  method: i.paymentMethod || "Bank",
                  receivedIn: "Company A/C",
                  receivedBy: "Admin",
                })),
              });
            }}
            variant="outline"
            size="sm"
            className="gap-1.5 bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
          >
            <FileText className="size-4" /> Download Finance Report PDF
          </Button>
          <Button
            onClick={() => {
              generatePDF("payment-history", {
                totalInvoiceAmount: metrics.totalInvoiced,
                totalReceived: metrics.totalCollected,
                totalOutstanding: metrics.outstandingAmount,
                payments: invoices.map((i) => ({
                  date: i.invoiceDate || "",
                  invoiceNumber: i.invoiceNumber,
                  amount: i.amountPaid || 0,
                  method: i.paymentMethod || "Bank",
                  receivedIn: "Company A/C",
                  receivedBy: "Admin",
                  remarks: i.notes || "—",
                })),
              });
            }}
            variant="outline"
            size="sm"
            className="gap-1.5 bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
          >
            <FileText className="size-4" /> Download Payment History PDF
          </Button>
        </div>
      </div>

      {/* 3 Main Sub Module Services, Licence, Driving School Tabs */}
      <div>
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setSelectedTab("overview")}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            selectedTab === "overview"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-gray-800"
          }`}
        >
          Dashboard
        </button>
        {isAdmin && (
          <button
            onClick={() => setSelectedTab("generate")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              selectedTab === "generate"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-gray-800"
            }`}
          >
            Generate Invoice
          </button>
        )}
        <button
          onClick={() => setSelectedTab("history")}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            selectedTab === "history"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-gray-800"
          }`}
        >
          Invoice History
        </button>
      </div>

      {/* Tab Content */}
      {selectedTab === "overview" && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              icon={DollarSign}
              label="Total Invoiced"
              value={formatCurrency(metrics.totalInvoiced)}
            />
            <MetricCard
              icon={CheckCircle}
              label="Total Collected"
              value={formatCurrency(metrics.totalCollected)}
            />

            <MetricCard
              icon={TrendingUp}
              label="Collection Rate"
              value={`${metrics.collectionRate.toFixed(2)}%`}
            />
            <MetricCard
              icon={Plus}
              label="This Month"
              value={`${metrics.invoicesThisMonth} invoices`}
            />
            <MetricCard
              icon={AlertCircle}
              label="Pending/Overdue"
              value={`${metrics.pendingInvoices} pending`}
            />
          </div>

          {/* Recent Invoices */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Recent Invoices</h3>
              <Button size="sm" onClick={() => setSelectedTab("history")}>
                View All
              </Button>
            </div>

            {invoices.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">
                  No invoices yet. Start by generating a new invoice.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.slice(0, 5).map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{invoice.invoiceNumber}</p>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${getStatusColor(invoice.status)}`}
                        >
                          {invoice.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {invoice.clientName} • {formatDate(invoice.invoiceDate)} •{" "}
                        {formatCurrency(invoice.totalAmount)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(invoice)}>
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTab === "generate" && (
        <InvoiceGenerator
          activeSubModule={activeSubModule}
          onInvoiceCreated={(invoice) => {
            setSelectedInvoice(invoice);
            setSelectedTab("history");
          }}
        />
      )}

      {selectedTab === "history" && (
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number or client name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">બધા</option>
                <option value="Pending">બધા બકી</option>
                <option value="Partially Paid">થોડા બકી</option>
                <option value="Paid">કુલ જામ</option>
                <option value="Cancelled">રદ કરેલ</option>
              </select>

              <select
                value={filterBhaylubha}
                onChange={(e) => setFilterBhaylubha(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Bhaylubha: Show All</option>
                <option value="required">Bhaylubha Required</option>
                <option value="completed">Bhaylubha Completed</option>
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {filteredInvoices.length} of {invoices.length} invoices
            </p>
          </div>

          {/* Invoices List */}
          <div className="space-y-3">
            {filteredInvoices.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 flex items-center justify-center">
                <p className="text-muted-foreground">No invoices found</p>
              </div>
            ) : (
              filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="bg-white rounded-lg border p-4 hover:shadow-md transition"
                >
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Client:</span> {invoice.clientName}
                        </div>
                        <div>
                          <span className="font-medium">Date:</span>{" "}
                          {formatDate(invoice.invoiceDate)}
                        </div>
                        <div>
                          <span className="font-medium">Amount:</span>{" "}
                          {formatCurrency(invoice.totalAmount)}
                        </div>
                        <div>
                          <span className="font-medium">Collection Date:</span>{" "}
                          {invoice.collectionDate
                            ? formatDate(invoice.collectionDate)
                            : "Not Scheduled"}
                        </div>
                        <div>
                          <span className="font-medium">Pending Amount:</span>{" "}
                          {formatCurrency(invoice.totalAmount - (invoice.totalPaid || 0))}
                        </div>
                        {invoice.askBhaylubha && (
                          <div className="text-amber-700 font-bold">
                            ★ Bhaylubha Approval Required
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateInvoicePDF(invoice)}
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={printWindow}>
                        <Printer className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Invoice Viewer Modal */}
      {selectedInvoice && (
        <InvoiceViewer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
    </div>
  );
}
