// InvoiceGenerator Component - Create invoices from client services
import { useState, useEffect } from "react";
import { Search, Loader2, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeToRecords, type RegistryRecord, type Bucket } from "@/lib/records";
import {
  createInvoice,
  validateBillingPeriodSequence,
  getLatestBillingPeriod,
  getNextBillingStartDate,
  calculateInvoiceAmount,
  type InvoiceServiceItem,
  type Invoice,
} from "@/lib/billing";
import { getSession } from "@/lib/auth";
import { subscribeDrivingSchoolApplications } from "@/lib/drivingSchool";
import { subscribeAllClients } from "@/lib/hierarchy";

import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface InvoiceGeneratorProps {
  activeSubModule: string;
  onInvoiceCreated?: (invoice: Invoice) => void;
}

export function InvoiceGenerator({ activeSubModule, onInvoiceCreated }: InvoiceGeneratorProps) {
  const [applications, setApplications] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<any | null>(null);
  const [accountingRecord, setAccountingRecord] = useState<any | null>(null);
  const [billingStartDate, setBillingStartDate] = useState("");
  const [billingEndDate, setBillingEndDate] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [checkedServiceIds, setCheckedServiceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [collectionDate, setCollectionDate] = useState("");
  const [askBhaylubha, setAskBhaylubha] = useState(false);

  const session = getSession();
  const createdBy = session?.username || "system";

  // Load applications belonging to this submodule
  useEffect(() => {
    setSelectedApplication(null);
    setSearchTerm("");
    setBillingStartDate("");
    setBillingEndDate("");
    setUnitPrice("0");
    setSelectedServices([]);
    setBreakdown([]);

    if (activeSubModule === "driving_school") {
      const unsub = subscribeDrivingSchoolApplications((data) => {
        setApplications(data);
      });
      return unsub;
    } else {
      const q = query(
        collection(db, "registry_applications_v1"),
        where("subModule", "==", activeSubModule)
      );
      const unsub = onSnapshot(q, (snap) => {
        setApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => {
        console.error("Error loading applications for subModule:", activeSubModule, err);
      });
      return unsub;
    }
  }, [activeSubModule]);

  // Fetch accounting record when application changes
  useEffect(() => {
    if (selectedApplication) {
      const accRef = doc(db, "registry_accounting", selectedApplication.id);
      getDoc(accRef).then((snap) => {
        if (snap.exists()) {
          const accData = snap.data();
          setAccountingRecord(accData);
          setAskBhaylubha(!!accData.askBhaylubha);
        } else {
          setAccountingRecord(null);
          setAskBhaylubha(false);
        }
      }).catch((err) => {
        console.error("Failed to load accounting record:", err);
      });
    } else {
      setAccountingRecord(null);
      setAskBhaylubha(false);
    }
  }, [selectedApplication]);

  // Pre-populate fields automatically when application is selected
  useEffect(() => {
    if (selectedApplication) {
      const start = selectedApplication.joiningDate || selectedApplication.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      const end = selectedApplication.courseEndDate || selectedApplication.expiryDate || new Date().toISOString().slice(0, 10);
      setBillingStartDate(start);
      setBillingEndDate(end);

      const appAmt = Number(selectedApplication.amount) || Number(selectedApplication.totalCourseFees) || 0;
      const accAmt = Number(accountingRecord?.totalPayment) || Number(accountingRecord?.totalAmount) || 0;
      const finalAmt = appAmt || accAmt || 0;

      if (activeSubModule === "driving_school") {
        const fees = finalAmt || Number(selectedApplication.totalCourseFees) || 9500;
        setUnitPrice(String(fees));
        setSelectedServices([selectedApplication.courseType || "Driving School Course"]);
        setBreakdown([{
          serviceId: "course",
          serviceName: selectedApplication.courseType || "Driving School Course",
          vehicleNumber: "—",
          vehicleType: "—",
          amount: fees,
        }]);
      } else {
        const servicesList = selectedApplication.services || [];
        setSelectedServices(servicesList);

        // Derive amount from accountingRecord or selectedApplication
        let derivedAmt = finalAmt;
        if (derivedAmt <= 0) {
          // If total amount is 0, let's sum up individual service fees if available
          if (selectedApplication.serviceFees) {
            derivedAmt = Object.values(selectedApplication.serviceFees).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
          }
        }
        if (derivedAmt <= 0) {
          // Fallback to total amount / estimated amount fields
          derivedAmt = Number(selectedApplication.totalAmount) || Number(selectedApplication.estimatedAmount) || Number(selectedApplication.amount) || 0;
        }

        setUnitPrice(String(derivedAmt));

        const breakdownList = servicesList.map((srv: string) => {
          const srvAmount = Number(selectedApplication.serviceFees?.[srv]) || (servicesList.length > 0 ? derivedAmt / servicesList.length : derivedAmt);
          return {
            serviceId: srv,
            serviceName: srv,
            vehicleNumber: selectedApplication.vehicleNumber || "—",
            vehicleType: selectedApplication.vehicleDetails?.vehicleClass || "—",
            amount: srvAmount,
          };
        });
        if (breakdownList.length === 0 && derivedAmt > 0) {
          breakdownList.push({
            serviceId: "default",
            serviceName: selectedApplication.serviceType || "RTO Service",
            vehicleNumber: selectedApplication.vehicleNumber || "—",
            vehicleType: selectedApplication.vehicleDetails?.vehicleClass || "—",
            amount: derivedAmt,
          });
        }
        setBreakdown(breakdownList);
      }
    } else {
      setBillingStartDate("");
      setBillingEndDate("");
      setUnitPrice("0");
      setSelectedServices([]);
      setBreakdown([]);
    }
  }, [selectedApplication, accountingRecord, activeSubModule]);

  // Validate billing period
  useEffect(() => {
    if (selectedApplication && billingStartDate && billingEndDate) {
      (async () => {
        try {
          const validation = await validateBillingPeriodSequence(
            selectedApplication.id,
            billingStartDate,
            billingEndDate,
          );

          if (!validation.valid) {
            setValidationMsg(`❌ ${validation.reason}`);
          } else {
            setValidationMsg("✓ Valid billing period");
          }
        } catch (err: any) {
          console.error("VALIDATION_ERROR", err);
          setValidationMsg(`❌ ${err?.message || "Billing validation failed."}`);
        }
      })();
    } else {
      setValidationMsg(null);
    }
  }, [selectedApplication, billingStartDate, billingEndDate]);

  // Filter applications by search term
  const filteredApplications = applications.filter((app) => {
    if (searchTerm === "") return false;
    const term = searchTerm.toLowerCase();

    if (activeSubModule === "services") {
      // Vahaan lookup: primary lookup by vehicleNumber
      return app.vehicleNumber?.toLowerCase().includes(term);
    } else if (activeSubModule === "driving_school") {
      // Driving School lookup: primary lookup by studentName
      return app.studentName?.toLowerCase().includes(term);
    } else {
      // Licence, Insurance, Form 5 lookup: primary lookup by ownerName/clientName
      return (
        app.ownerName?.toLowerCase().includes(term) ||
        app.clientName?.toLowerCase().includes(term)
      );
    }
  });

  const isFormValid =
    !!selectedApplication &&
    !!billingStartDate &&
    !!billingEndDate &&
    Number(unitPrice) > 0;

  // Create invoice
  const handleCreateInvoice = async () => {
    console.log({
      step: "BUTTON_CLICKED",
      selectedApplication,
      billingStartDate,
      billingEndDate,
      selectedServices,
      unitPrice,
      isFormValid,
    });

    if (!selectedApplication) {
      setError("Please select an application");
      return;
    }
    if (!billingStartDate || !billingEndDate) {
      setError("Please select billing period");
      return;
    }
    if (!unitPrice || Number(unitPrice) <= 0 || Number.isNaN(Number(unitPrice))) {
      setError("Calculation returned no services or 0 amount.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    const services: InvoiceServiceItem[] = breakdown.map((item) => {
      const price = item.amount;
      const tax = 0;
      return {
        serviceId:
          item.serviceId ||
          `svc-${Date.now()}-${item.serviceName.replace(/\s+/g, "-")}-${item.vehicleNumber}`,
        serviceName: item.serviceName,
        vehicleNumber: item.vehicleNumber,
        quantity: 1,
        unitPrice: price,
        amount: price,
        tax,
        total: price,
      };
    });
    console.log({
      step: "INVOICE_PAYLOAD_PREPARED",
      selectedApplicationId: selectedApplication.id,
      selectedApplicationName: selectedApplication.studentName || selectedApplication.ownerName || selectedApplication.name,
      billingStartDate,
      billingEndDate,
      selectedServices,
      services,
      isFormValid,
    });

    try {
      const invoice = await createInvoice(
        selectedApplication,
        services,
        billingStartDate,
        billingEndDate,
        createdBy,
        collectionDate,
        askBhaylubha,
        activeSubModule,
      );

      console.log({ step: "INVOICE_CREATED", invoice });

      setSuccess(`✓ Invoice ${invoice.invoiceNumber} created successfully!`);
      setSelectedApplication(null);
      setBillingStartDate("");
      setBillingEndDate("");
      setUnitPrice("");
      setSelectedServices([]);
      setValidationMsg(null);
      setBreakdown([]);
      setCollectionDate("");
      setAskBhaylubha(false);

      onInvoiceCreated?.(invoice);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("INVOICE_CREATE_FAILED", err);
      setError(err?.message || "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  const serviceNames = [
    "Insurance",
    "Fitness",
    "Gujarat Permit",
    "National Permit(Gujrat Permit)",
    "Tax",
    "PUC",
    "License New",
    "License Renew",
    "RC Transfer",
    "HP Addition",
    "HP Termination",
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Generate New Invoice</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="size-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {validationMsg && (
          <div
            className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${validationMsg.includes("✓") ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            <AlertCircle
              className={`size-5 mt-0.5 flex-shrink-0 ${validationMsg.includes("✓") ? "text-green-600" : "text-red-600"}`}
            />
            <p
              className={`text-sm ${validationMsg.includes("✓") ? "text-green-700" : "text-red-700"}`}
            >
              {validationMsg}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Application Selection Lookup */}
          <div>
            <label className="text-sm font-medium uppercase tracking-wide text-gray-500 text-xs font-bold">
              {activeSubModule === "services"
                ? "Look up by Vehicle Number *"
                : activeSubModule === "driving_school"
                ? "Look up by Student Name *"
                : "Look up by Client / Owner Name *"}
            </label>
            <div className="mt-2 relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                placeholder={
                  activeSubModule === "services"
                    ? "Enter vehicle number (e.g. GJ01XX1234)..."
                    : activeSubModule === "driving_school"
                    ? "Enter student name..."
                    : "Enter client or owner name..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm font-semibold"
              />
            </div>
            {searchTerm && (
              <div className="mt-2 border rounded-lg max-h-56 overflow-y-auto bg-white shadow-lg z-20 relative">
                {filteredApplications.slice(0, 30).map((app) => (
                  <button
                    key={app.id}
                    onClick={() => {
                      setSelectedApplication(app);
                      setSearchTerm("");
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 transition duration-150"
                  >
                    {activeSubModule === "services" ? (
                      <div>
                        <div className="font-bold text-sm text-blue-600">{app.vehicleNumber}</div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-1">
                          <span>Owner: {app.ownerName}</span>
                          <span>ID: {app.applicationId}</span>
                        </div>
                      </div>
                    ) : activeSubModule === "driving_school" ? (
                      <div>
                        <div className="font-bold text-sm text-green-700">{app.studentName}</div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-1">
                          <span>Course: {app.courseType}</span>
                          <span>ID: {app.applicationId}</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-bold text-sm text-indigo-700">{app.ownerName || app.clientName}</div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-1">
                          <span>Services: {app.services?.join(", ")}</span>
                          <span>ID: {app.applicationId}</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedApplication && (
              <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex justify-between items-start border-b pb-2">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      {selectedApplication.studentName || selectedApplication.ownerName || selectedApplication.clientName}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Phone: {selectedApplication.mobileNumber || selectedApplication.mobile || "—"}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {activeSubModule}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block font-medium">Application ID</span>
                    <span className="font-bold text-slate-700">{selectedApplication.applicationId || selectedApplication.id}</span>
                  </div>
                  {selectedApplication.vehicleNumber && (
                    <div>
                      <span className="text-slate-400 block font-medium">Vehicle Number</span>
                      <span className="font-bold text-slate-700">{selectedApplication.vehicleNumber}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block font-medium">Total Charges</span>
                    <span className="font-bold text-slate-700">₹{(selectedApplication.amount || selectedApplication.totalCourseFees || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Advance Paid</span>
                    <span className="font-bold text-emerald-600">₹{(selectedApplication.totalPaid || selectedApplication.advancePaid || 0).toLocaleString("en-IN")}</span>
                  </div>
                  {accountingRecord && (
                    <>
                      <div>
                        <span className="text-slate-400 block font-medium">RTO Receipt</span>
                        <span className="font-bold text-slate-700">₹{(accountingRecord.rtoReceipt || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">RTO Expense</span>
                        <span className="font-bold text-slate-700">₹{(accountingRecord.rtoExpense || 0).toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Billing Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Billing Start Date *</label>
              <Input
                type="date"
                value={billingStartDate}
                onChange={(e) => setBillingStartDate(e.target.value)}
                className="mt-1 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Billing End Date *</label>
              <Input
                type="date"
                value={billingEndDate}
                onChange={(e) => setBillingEndDate(e.target.value)}
                className="mt-1 text-sm font-semibold"
              />
            </div>
          </div>

          {/* Invoice Breakdown display (Read-Only) */}
          {selectedApplication && breakdown.length > 0 && (
            <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-border space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wide">
                Invoice Breakdown
              </h4>
              <div className="space-y-2.5 text-xs">
                {breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="border-b border-gray-200/60 pb-1.5 last:border-b-0 last:pb-0 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{item.serviceName}</div>
                      {item.vehicleNumber && item.vehicleNumber !== "—" && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Vehicle: {item.vehicleNumber} ({item.vehicleType})
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-700">
                      ₹{item.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-gray-300 flex justify-between font-bold text-foreground text-xs">
                  <span>Grand Total</span>
                  <span>₹{Number(unitPrice).toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Service Amount */}
          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Total Invoice Amount (₹) *</label>
            <Input
              type="number"
              value={unitPrice}
              onChange={(e) => {
                const val = e.target.value;
                setUnitPrice(val);
                
                const numericVal = Number(val) || 0;
                setBreakdown(prev => {
                  if (prev.length === 1) {
                    return [{ ...prev[0], amount: numericVal }];
                  } else if (prev.length > 1) {
                    const part = numericVal / prev.length;
                    return prev.map(item => ({ ...item, amount: part }));
                  } else {
                    return [{
                      serviceId: "default",
                      serviceName: selectedApplication?.serviceType || "RTO Service",
                      vehicleNumber: selectedApplication?.vehicleNumber || "—",
                      vehicleType: selectedApplication?.vehicleDetails?.vehicleClass || "—",
                      amount: numericVal,
                    }];
                  }
                });
              }}
              className="mt-1 font-bold text-foreground"
            />
            {(!unitPrice || Number(unitPrice) <= 0) && (
              <p className="text-xs text-red-500 mt-1 font-medium">Invoice amount is required and must be greater than 0.</p>
            )}
          </div>

          {/* Collection Date & Ask Bhaylubha Checkbox */}
          <div className="grid gap-4 sm:grid-cols-2 bg-slate-50 p-4 border rounded-lg">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                Planned Collection Date
              </label>
              <Input
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <input
                id="generatorAskBhay"
                type="checkbox"
                checked={askBhaylubha}
                onChange={(e) => setAskBhaylubha(e.target.checked)}
                className="size-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="generatorAskBhay"
                className="text-sm font-medium text-gray-700 cursor-pointer select-none"
              >
                Require Bhaylubha Approval
              </label>
            </div>
          </div>

          {/* Create Button */}
          <Button
            onClick={handleCreateInvoice}
            disabled={loading || !isFormValid}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Creating Invoice...
              </>
            ) : (
              "Generate Invoice"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
