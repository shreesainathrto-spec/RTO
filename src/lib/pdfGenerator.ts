import jsPDF from "jspdf";
import { attachPdfToInvoice, type Invoice } from "./billing";
import type { RegistryRecord } from "./records";
import type { Task } from "./tasks";
import {
  staffLabel,
  getRecordServiceAmount,
  getRecordPaymentStatus,
  getRecordPendingAmount,
  getRecordTotalReceived,
} from "./records";
import { formatCurrency, formatDate, formatTime } from "./formatting";
import { renderInvoiceToCanvas } from "./pdfInvoiceRenderer";

// ─── Configuration ────────────────────────────────────────────────────────────

const COMPANY_NAME = "Shree Sainath Consultancy";
const COMPANY_ADDRESS = "Professional Consulting Services";
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// ─── Color Scheme ─────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: [41, 128, 185] as [number, number, number], // Blue
  headerText: [255, 255, 255] as [number, number, number], // White
  labelText: [52, 73, 94] as [number, number, number], // Dark blue-gray
  valueText: [44, 62, 80] as [number, number, number], // Darker blue-gray
  borderColor: [189, 195, 199] as [number, number, number], // Light gray
  accentColor: [230, 126, 34] as [number, number, number], // Orange
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Format currency as Indian Rupees.
 */
export { formatCurrency, formatDate, formatTime } from "./formatting";

/**
 * Add header section to PDF.
 */
function addHeader(doc: jsPDF, recordType: string): number {
  let yPos = MARGIN;

  // Header background
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(MARGIN - 2, yPos - 2, PAGE_WIDTH - 2 * MARGIN + 4, 35, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.headerText);
  doc.text(COMPANY_NAME, MARGIN + 5, yPos + 10);

  // Company subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY_ADDRESS, MARGIN + 5, yPos + 16);

  // Record type and date on the right
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(recordType, PAGE_WIDTH - MARGIN - 5, yPos + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, PAGE_WIDTH - MARGIN - 5, yPos + 14, {
    align: "right",
  });

  return yPos + 40;
}

/**
 * Add a key-value row to the PDF.
 */
function addRow(
  doc: jsPDF,
  yPos: number,
  label: string,
  value: string,
  columnWidth: number = CONTENT_WIDTH / 2,
): number {
  const lineHeight = 7;

  // Label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.labelText);
  doc.text(label, MARGIN + 3, yPos);

  // Value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.valueText);

  // Wrap text for long values
  const maxChars = Math.floor((columnWidth - 6) / 1.5);
  if (value.length > maxChars) {
    const wrapped = doc.splitTextToSize(value, columnWidth - 6);
    doc.text(wrapped, MARGIN + columnWidth / 2 + 2, yPos);
    return yPos + wrapped.length * lineHeight + 2;
  } else {
    doc.text(value, MARGIN + columnWidth / 2 + 2, yPos);
    return yPos + lineHeight;
  }
}

/**
 * Add a section title to the PDF.
 */
function addSectionTitle(doc: jsPDF, yPos: number, title: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.accentColor);
  doc.text(title, MARGIN, yPos);

  // Underline
  doc.setDrawColor(...COLORS.borderColor);
  doc.line(MARGIN, yPos + 1.5, MARGIN + CONTENT_WIDTH, yPos + 1.5);

  return yPos + 8;
}

/**
 * Add a table row to the PDF.
 */
function addTableRow(
  doc: jsPDF,
  yPos: number,
  columns: string[],
  columnWidths: number[],
  isBold: boolean = false,
): number {
  const lineHeight = 6;
  doc.setFont("helvetica", isBold ? "bold" : "normal");
  doc.setFontSize(8);
  doc.setTextColor(...(isBold ? COLORS.labelText : COLORS.valueText));

  let xPos = MARGIN;
  for (let i = 0; i < columns.length; i++) {
    const text = columns[i];
    const maxWidth = columnWidths[i] - 1;
    const wrapped = doc.splitTextToSize(text, maxWidth);
    doc.text(wrapped, xPos + 1, yPos);
    xPos += columnWidths[i];
  }

  return yPos + Math.max(...columns.map((c) => doc.splitTextToSize(c, 20).length)) * lineHeight + 1;
}

function addCanvasToPdf(doc: jsPDF, canvas: HTMLCanvasElement): void {
  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = doc.internal.pageSize.getHeight();
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const pageCanvasHeight = Math.floor((pdfHeight * canvasWidth) / pdfWidth);

  let yOffsetPx = 0;
  let pageIndex = 0;

  while (yOffsetPx < canvasHeight) {
    const sliceHeight = Math.min(pageCanvasHeight, canvasHeight - yOffsetPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvasWidth;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create PDF canvas context.");
    }

    ctx.drawImage(canvas, 0, yOffsetPx, canvasWidth, sliceHeight, 0, 0, canvasWidth, sliceHeight);
    const imgData = pageCanvas.toDataURL("image/png");

    if (pageIndex > 0) {
      doc.addPage();
    }

    const pageImageHeight = (sliceHeight * pdfWidth) / canvasWidth;
    doc.addImage(imgData, "PNG", 0, 0, pdfWidth, pageImageHeight);

    pageIndex += 1;
    yOffsetPx += sliceHeight;
  }
}

// ─── Client/Lead/Customer PDF ─────────────────────────────────────────────────

/**
 * Generate a professional PDF for a client/lead/customer record.
 */
export function generateRecordPDF(
  record: RegistryRecord,
  bucket: "clients" | "leads" | "customers",
): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, `${bucket.charAt(0).toUpperCase() + bucket.slice(1)} Details`);

  // Basic Information Section
  yPos = addSectionTitle(doc, yPos, "Basic Information");

  const fields = [
    ["SR No", String(record.srNo)],
    ["Date", formatDate(record.date)],
    ["Name", record.name],
    ["Group Name", record.groupName || "—"],
    ["Mobile", record.mo || "—"],
    ["Vehicle Number", record.mvNo || "—"],
    ["Assigned Staff", staffLabel(record.assignee) || "—"],
  ];

  for (const [label, value] of fields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Work Details Section
  yPos = addSectionTitle(doc, yPos + 2, "Work Details");

  const workFields = [
    ["Application", record.application || "—"],
    ["Work Type", record.work || "—"],
    ["Status", record.status || "—"],
  ];

  for (const [label, value] of workFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Compliance Details Section
  yPos = addSectionTitle(doc, yPos + 2, "Compliance & Documents");

  const complianceFields = [
    ["Insurance", record.insurance || "—"],
    ["Fitness", record.fitness || "—"],
    ["Tax", record.tax || "—"],
    ["Certificate of Origin", record.co || "—"],
  ];

  for (const [label, value] of complianceFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Accounting Information Section
  if (getRecordServiceAmount(record) > 0 || getRecordTotalReceived(record) > 0) {
    yPos = addSectionTitle(doc, yPos + 2, "Accounting Information");

    const accountingFields = [
      ["Service Amount", formatCurrency(getRecordServiceAmount(record))],
      ["Amount Received", formatCurrency(getRecordTotalReceived(record))],
      ["Payment Status", getRecordPaymentStatus(record)],
      ["Payment Date", formatDate(record.paymentDate)],
    ];

    for (const [label, value] of accountingFields) {
      yPos = addRow(doc, yPos, label, value);
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, {
    align: "center",
  });

  // File name
  const fileName = `${bucket.toUpperCase()}_${record.name.replace(/\s+/g, "_").substring(0, 30)}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ─── Task PDF ──────────────────────────────────────────────────────────────────

/**
 * Generate a professional PDF for a task.
 */
export function generateTaskPDF(task: Task): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, "Task Details");

  // Task Header
  yPos = addSectionTitle(doc, yPos, "Task Information");

  const taskFields = [
    ["Title", task.title],
    ["Assignee", staffLabel(task.assignee) || task.assignee],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Due Date", formatDate(task.dueDate)],
    ["Created On", formatDate(task.createdAt)],
    ["Created By", task.createdBy],
  ];

  for (const [label, value] of taskFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Description
  if (task.description) {
    yPos = addSectionTitle(doc, yPos + 2, "Description");
    const wrapped = doc.splitTextToSize(task.description, CONTENT_WIDTH - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.valueText);
    doc.text(wrapped, MARGIN + 3, yPos);
    yPos += wrapped.length * 5 + 3;
  }

  // Read Status
  if (task.readBy || task.readAt) {
    yPos = addSectionTitle(doc, yPos + 2, "Read Status");

    const readFields = [
      ["Read By", staffLabel(task.readBy) || "Pending"],
      ["Read On", formatTime(task.readAt) || "Not read yet"],
    ];

    for (const [label, value] of readFields) {
      yPos = addRow(doc, yPos, label, value);
    }
  }

  // Subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    yPos = addSectionTitle(doc, yPos + 2, "Subtasks");

    // Progress bar
    const progress = task.progress ?? 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.labelText);
    doc.text(`Progress: ${progress}%`, MARGIN + 3, yPos);

    // Progress bar background
    doc.setDrawColor(...COLORS.borderColor);
    doc.rect(MARGIN + 50, yPos - 3, 40, 3);

    // Progress bar fill
    doc.setFillColor(...COLORS.accentColor);
    doc.rect(MARGIN + 50, yPos - 3, (40 * progress) / 100, 3, "F");

    yPos += 6;

    // Subtask list
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const subtask of task.subtasks) {
      const status = subtask.completed ? "✓" : "○";
      const text = `${status} ${subtask.title}`;
      const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - 10);
      doc.setTextColor(...COLORS.valueText);
      doc.text(wrapped, MARGIN + 5, yPos);
      yPos += wrapped.length * 4 + 1;
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, {
    align: "center",
  });

  // File name
  const fileName = `TASK_${task.id.substring(0, 8)}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Generate a professional invoice PDF, upload to storage, and trigger download.
 * Returns the uploaded URL when successful.
 */
export async function generateInvoicePDF(invoice: Invoice): Promise<string | void> {
  try {
    const canvas = await renderInvoiceToCanvas(invoice);
    const doc = new jsPDF("p", "mm", "a4");
    addCanvasToPdf(doc, canvas);

    const blob = doc.output("blob") as Blob;

    // Always try to download first (blob URL)
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("[PDF] PDF Saved");

    // Then upload to Firebase (non-blocking)
    setTimeout(async () => {
      try {
        await attachPdfToInvoice(invoice.id, blob);
      } catch (uploadError) {
        console.warn("Failed to upload PDF to Firebase:", uploadError);
      }
    }, 100);

    // Clean up blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);

    return blobUrl;
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);
    throw error;
  }
}

// ─── Accounting Report PDF ────────────────────────────────────────────────────

/**
 * Generate an accounting report PDF.
 */
export function generateAccountingPDF(
  records: RegistryRecord[],
  summary: {
    totalServiceAmount: number;
    totalAmountReceived: number;
    totalPendingAmount: number;
    collectionRate: number;
  },
): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, "Accounting Report");

  // Summary Section
  yPos = addSectionTitle(doc, yPos, "Financial Summary");

  const summaryFields = [
    ["Total Revenue", formatCurrency(summary.totalServiceAmount)],
    ["Amount Collected", formatCurrency(summary.totalAmountReceived)],
    ["Pending Revenue", formatCurrency(summary.totalPendingAmount)],
    ["Collection Rate", `${summary.collectionRate.toFixed(2)}%`],
  ];

  for (const [label, value] of summaryFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Detailed Records Section
  if (records.length > 0) {
    yPos = addSectionTitle(doc, yPos + 3, "Detailed Records");

    // Table headers
    const colWidths = [30, 40, 25, 25, 25, 25];
    const headers = ["SR No", "Name", "Service Amt", "Received", "Pending", "Status"];

    doc.setDrawColor(...COLORS.borderColor);
    doc.setFillColor(...COLORS.headerBg);
    yPos = addTableRow(doc, yPos, headers, colWidths, true);

    // Add border line
    doc.line(MARGIN, yPos - 1, MARGIN + CONTENT_WIDTH, yPos - 1);

    // Table rows
    for (const record of records.slice(0, 20)) {
      const pending = getRecordPendingAmount(record);
      const row = [
        String(record.srNo),
        record.name.substring(0, 20),
        formatCurrency(getRecordServiceAmount(record)).substring(0, 12),
        formatCurrency(getRecordTotalReceived(record)).substring(0, 12),
        formatCurrency(pending).substring(0, 12),
        getRecordPaymentStatus(record),
      ];

      yPos = addTableRow(doc, yPos, row, colWidths, false);

      // Page break if needed
      if (yPos > PAGE_HEIGHT - MARGIN - 10) {
        doc.addPage();
        yPos = MARGIN;
      }
    }

    if (records.length > 20) {
      yPos = addRow(doc, yPos + 2, "Records shown", `First 20 of ${records.length}`);
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, {
    align: "center",
  });

  // File name
  const fileName = `ACCOUNTING_REPORT_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ─── Print Helpers ────────────────────────────────────────────────────────────

/**
 * Open browser print dialog for a PDF.
 * Note: This prints the current page, not a generated PDF.
 */
export function printWindow(): void {
  window.print();
}

// ─── Centralized PDF Generation Engine ──────────────────────────────────────

class RegistryPDFEngine {
  private doc: jsPDF;
  private y: number = MARGIN;
  private currentPage: number = 1;
  private generatedBy: string = "system";
  private generatedOn: string = "";

  constructor(title: string, actor: string = "system") {
    this.doc = new jsPDF("p", "mm", "a4");
    this.generatedBy = actor;
    this.generatedOn = new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    this.setupPage(title);
  }

  private setupPage(title: string) {
    // 1. Company Branding Header (Logo/Text) on every page
    this.doc.setFillColor(41, 128, 185); // Primary Professional Brand Color
    this.doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 20, "F");

    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.text("SHREE SAINATH CONSULTANCY", MARGIN + 6, MARGIN + 7);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.text(
      "Office Address: Professional Consulting Services, RTO Agent Premises",
      MARGIN + 6,
      MARGIN + 12,
    );
    this.doc.text(
      "Mobile: +91 98765 43210  |  Email: contact@sainathconsultancy.com  |  GST: 24AAAAA1111A1Z1",
      MARGIN + 6,
      MARGIN + 16,
    );

    // 2. Document Title
    this.doc.setTextColor(52, 73, 94);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.text(title.toUpperCase(), MARGIN, MARGIN + 28);

    // Metadata
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.text(
      `Generated By: ${this.generatedBy} | Date: ${this.generatedOn}`,
      PAGE_WIDTH - MARGIN,
      MARGIN + 28,
      { align: "right" },
    );

    // Divider Line
    this.doc.setDrawColor(189, 195, 199);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN, MARGIN + 31, PAGE_WIDTH - MARGIN, MARGIN + 31);

    this.y = MARGIN + 37;
  }

  public ensureSpace(heightNeeded: number, title: string) {
    if (this.y + heightNeeded > PAGE_HEIGHT - MARGIN - 15) {
      this.drawFooter();
      this.doc.addPage();
      this.currentPage++;
      this.setupPage(title);
    }
  }

  public drawFooter() {
    this.doc.setDrawColor(189, 195, 199);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 8, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 8);

    this.doc.setTextColor(127, 140, 141);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(8);
    this.doc.text("Generated by Registry Pro CRM", MARGIN, PAGE_HEIGHT - MARGIN - 3);
    this.doc.text(`Page ${this.currentPage}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 3, {
      align: "right",
    });
  }

  public drawKeyValueRow(pairs: { label: string; value: string }[], title: string) {
    this.ensureSpace(8, title);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);

    const colWidth = CONTENT_WIDTH / pairs.length;
    pairs.forEach((p, idx) => {
      const x = MARGIN + idx * colWidth;
      this.doc.setTextColor(127, 140, 141);
      this.doc.text(`${p.label}:`, x, this.y);
      this.doc.setTextColor(44, 62, 80);
      this.doc.setFont("helvetica", "bold");
      this.doc.text(String(p.value || "—"), x + colWidth * 0.4, this.y);
      this.doc.setFont("helvetica", "normal");
    });
    this.y += 7;
  }

  public drawTable(
    headers: string[],
    rows: string[][],
    alignments: ("left" | "right" | "center")[],
    colWidths: number[],
    title: string,
  ) {
    // 1. Draw Table Header
    this.ensureSpace(8, title);
    this.doc.setFillColor(245, 247, 250);
    this.doc.rect(MARGIN, this.y - 4, CONTENT_WIDTH, 6, "F");

    this.doc.setTextColor(52, 73, 94);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);

    let currentX = MARGIN;
    headers.forEach((h, idx) => {
      const align = alignments[idx] || "left";
      const w = colWidths[idx] || CONTENT_WIDTH / headers.length;
      const textX =
        align === "right" ? currentX + w - 2 : align === "center" ? currentX + w / 2 : currentX + 2;
      this.doc.text(h, textX, this.y, { align });
      currentX += w;
    });
    this.y += 4;

    // 2. Draw Rows
    this.doc.setFont("helvetica", "normal");
    rows.forEach((row, rIdx) => {
      this.ensureSpace(6, title);

      // Alternating background colors
      if (rIdx % 2 === 1) {
        this.doc.setFillColor(250, 250, 250);
        this.doc.rect(MARGIN, this.y - 4, CONTENT_WIDTH, 5.5, "F");
      }

      this.doc.setTextColor(44, 62, 80);
      let rX = MARGIN;
      row.forEach((val, cIdx) => {
        const align = alignments[cIdx] || "left";
        const w = colWidths[cIdx] || CONTENT_WIDTH / headers.length;
        const textX = align === "right" ? rX + w - 2 : align === "center" ? rX + w / 2 : rX + 2;
        this.doc.text(String(val || "—"), textX, this.y, { align });
        rX += w;
      });
      this.y += 5.5;
    });

    // Bottom Border Line
    this.doc.setDrawColor(189, 195, 199);
    this.doc.setLineWidth(0.25);
    this.doc.line(MARGIN, this.y - 2, PAGE_WIDTH - MARGIN, this.y - 2);
    this.y += 4;
  }

  public save(filename: string) {
    this.drawFooter();
    this.doc.save(filename);
  }
}

export function generatePDF(type: string, data: any, actor: string = "system"): void {
  try {
    switch (type) {
      case "client-details": {
        const engine = new RegistryPDFEngine("Client Details Profile", actor);
        engine.drawKeyValueRow(
          [
            { label: "Client Name", value: data.name },
            { label: "Mobile", value: data.mo },
          ],
          "Client Details Profile",
        );
        engine.drawKeyValueRow(
          [
            { label: "Email", value: data.email || "—" },
            { label: "Group", value: data.group || "—" },
          ],
          "Client Details Profile",
        );
        engine.drawKeyValueRow(
          [
            { label: "Address", value: data.address || "—" },
            { label: "Created By", value: data.createdBy || "—" },
          ],
          "Client Details Profile",
        );

        const vRows = (data.vehicles || []).map((v: any) => [
          v.vehicleNumber || "—",
          v.vehicleType || "Commercial",
          v.status || "Active",
          (v.services || []).join(", ") || "None",
        ]);
        engine.drawTable(
          ["Vehicle Number", "Vehicle Type", "Status", "Linked Services"],
          vRows,
          ["left", "left", "center", "left"],
          [40, 40, 30, 70],
          "Client Details Profile",
        );
        engine.save(`CLIENT_DETAILS_${(data.name || "profile").replace(/\s+/g, "_")}.pdf`);
        break;
      }

      case "insurance": {
        const engine = new RegistryPDFEngine("Insurance Policy details", actor);
        engine.drawKeyValueRow(
          [
            { label: "Policy Number", value: data.policyNumber },
            { label: "Insurance Company", value: data.company },
          ],
          "Insurance Policy details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Start Date", value: data.startDate },
            { label: "Expiry Date", value: data.expiryDate },
          ],
          "Insurance Policy details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Premium Amount", value: formatCurrency(data.premiumAmount || 0) },
            { label: "Status", value: data.status },
          ],
          "Insurance Policy details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Assigned Employee", value: data.assignee },
            { label: "Remarks", value: data.remarks || "No remarks" },
          ],
          "Insurance Policy details",
        );
        engine.save(`INSURANCE_POLICY_${data.policyNumber || "export"}.pdf`);
        break;
      }

      case "fitness": {
        const engine = new RegistryPDFEngine("Fitness Certificate Details", actor);
        engine.drawKeyValueRow(
          [
            { label: "Vehicle Number", value: data.vehicleNumber },
            { label: "Inspection Date", value: data.inspectionDate },
          ],
          "Fitness Certificate Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Expiry Date", value: data.expiryDate },
            { label: "Status", value: data.status },
          ],
          "Fitness Certificate Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Payment Amount", value: formatCurrency(data.paymentAmount || 0) },
            { label: "Payment Status", value: data.paymentStatus || "Paid" },
          ],
          "Fitness Certificate Details",
        );
        engine.save(`FITNESS_CERTIFICATE_${data.vehicleNumber || "export"}.pdf`);
        break;
      }

      case "gujarat-permit":
      case "national-permit": {
        const engine = new RegistryPDFEngine(
          `${type.replace("-", " ").toUpperCase()} REPORT`,
          actor,
        );
        engine.drawKeyValueRow(
          [
            { label: "Permit Number", value: data.permitNo || "—" },
            { label: "Vehicle Number", value: data.vehicleNumber || "—" },
          ],
          `${type.replace("-", " ")} Details`,
        );
        engine.drawKeyValueRow(
          [
            { label: "Issue Date", value: data.issueDate || "—" },
            { label: "Expiry Date", value: data.expiryDate || "—" },
          ],
          `${type.replace("-", " ")} Details`,
        );
        engine.drawKeyValueRow(
          [
            { label: "Amount Paid", value: formatCurrency(data.amount || 0) },
            { label: "Status", value: data.status || "—" },
          ],
          `${type.replace("-", " ")} Details`,
        );
        engine.save(`${type.toUpperCase()}_${data.vehicleNumber || "export"}.pdf`);
        break;
      }

      case "tax": {
        const engine = new RegistryPDFEngine("Tax Payment Statement", actor);
        engine.drawKeyValueRow(
          [
            { label: "Tax Period", value: data.period || "—" },
            { label: "Vehicle Number", value: data.vehicleNumber || "—" },
          ],
          "Tax Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Tax Amount", value: formatCurrency(data.amount || 0) },
            { label: "Paid Amount", value: formatCurrency(data.paidAmount || 0) },
          ],
          "Tax Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Pending Amount", value: formatCurrency(data.pendingAmount || 0) },
            { label: "Status", value: data.status || "—" },
          ],
          "Tax Details",
        );
        engine.save(`TAX_STATEMENT_${data.vehicleNumber || "export"}.pdf`);
        break;
      }

      case "puc": {
        const engine = new RegistryPDFEngine("PUC Certificate Export", actor);
        engine.drawKeyValueRow(
          [
            { label: "PUC Certificate No", value: data.pucNo || "—" },
            { label: "Vehicle Number", value: data.vehicleNumber || "—" },
          ],
          "PUC Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Issue Date", value: data.issueDate || "—" },
            { label: "Expiry Date", value: data.expiryDate || "—" },
          ],
          "PUC Details",
        );
        engine.drawKeyValueRow(
          [{ label: "Emission Status", value: data.status || "—" }],
          "PUC Details",
        );
        engine.save(`PUC_CERTIFICATE_${data.vehicleNumber || "export"}.pdf`);
        break;
      }

      case "license-new":
      case "license-renew": {
        const engine = new RegistryPDFEngine(
          `Driving License ${type.split("-")[1].toUpperCase()} Export`,
          actor,
        );
        engine.drawKeyValueRow(
          [
            { label: "License Number", value: data.licenseNo || "—" },
            { label: "License Type", value: data.licenseType || "—" },
          ],
          "License Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Applicant Name", value: data.applicantName || "—" },
            { label: "Application Number", value: data.applicationNo || "—" },
          ],
          "License Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Status", value: data.status || "—" },
            { label: "Due/Expiry Date", value: data.dueDate || "—" },
          ],
          "License Details",
        );
        engine.save(`DRIVING_LICENSE_${type.toUpperCase()}.pdf`);
        break;
      }

      case "finance": {
        const engine = new RegistryPDFEngine("Invoice Financial Statement", actor);
        engine.drawKeyValueRow(
          [
            { label: "Invoice Number", value: data.invoiceNumber },
            { label: "Invoice Date", value: data.invoiceDate },
          ],
          "Invoice Summary",
        );
        engine.drawKeyValueRow(
          [
            { label: "Client Name", value: data.clientName },
            { label: "Vehicle Number", value: data.vehicleNumber || "—" },
          ],
          "Invoice Summary",
        );
        engine.drawKeyValueRow(
          [
            { label: "Invoice Amount", value: formatCurrency(data.totalAmount || 0) },
            { label: "Received Amount", value: formatCurrency(data.totalPaid || 0) },
          ],
          "Invoice Summary",
        );
        engine.drawKeyValueRow(
          [
            {
              label: "Pending Amount",
              value: formatCurrency((data.totalAmount || 0) - (data.totalPaid || 0)),
            },
            { label: "Collection Date", value: data.collectionDate || "—" },
          ],
          "Invoice Summary",
        );

        const pRows = (data.payments || []).map((p: any) => [
          p.date || "",
          formatCurrency(p.amount || 0),
          p.method || "",
          p.receivedIn || "",
          p.receivedBy || "",
        ]);
        engine.drawTable(
          ["Payment Date", "Amount Received", "Payment Method", "Account", "Received By"],
          pRows,
          ["left", "right", "left", "left", "left"],
          [35, 35, 30, 40, 40],
          "Invoice Summary",
        );
        engine.save(`INVOICE_FINANCE_${data.invoiceNumber || "export"}.pdf`);
        break;
      }

      case "accounting-reports": {
        const engine = new RegistryPDFEngine("Company Accounting Statement", actor);
        engine.drawKeyValueRow(
          [
            { label: "Total Revenue", value: formatCurrency(data.totalRevenue || 0) },
            { label: "Total Received", value: formatCurrency(data.totalReceived || 0) },
          ],
          "Financial Summary",
        );
        engine.drawKeyValueRow(
          [
            { label: "Total Outstanding", value: formatCurrency(data.totalOutstanding || 0) },
            { label: "Collection Rate", value: `${(data.collectionRate || 0).toFixed(2)}%` },
          ],
          "Financial Summary",
        );

        const accRows = (data.rows || []).map((row: any) => [
          row.month || "",
          formatCurrency(row.revenue || 0),
          formatCurrency(row.collected || 0),
          formatCurrency(row.pending || 0),
        ]);
        engine.drawTable(
          ["Reporting Period", "Gross Revenue", "Total Collected", "Total Outstanding"],
          accRows,
          ["left", "right", "right", "right"],
          [50, 40, 40, 40],
          "Company Accounting Statement",
        );
        engine.save(`ACCOUNTING_STATEMENT_${new Date().toISOString().split("T")[0]}.pdf`);
        break;
      }

      case "payment-history": {
        const engine = new RegistryPDFEngine("General Payment History", actor);
        engine.drawKeyValueRow(
          [
            { label: "Total Invoice Amount", value: formatCurrency(data.totalInvoiceAmount || 0) },
            { label: "Total Received", value: formatCurrency(data.totalReceived || 0) },
          ],
          "Statement Totals",
        );
        engine.drawKeyValueRow(
          [{ label: "Total Outstanding", value: formatCurrency(data.totalOutstanding || 0) }],
          "Statement Totals",
        );

        const histRows = (data.payments || []).map((p: any) => [
          p.date || "",
          p.invoiceNumber || "",
          formatCurrency(p.amount || 0),
          p.method || "",
          p.receivedIn || "",
          p.receivedBy || "",
          p.remarks || "",
        ]);
        engine.drawTable(
          ["Payment Date", "Invoice No", "Amount", "Method", "Account", "Received By", "Remarks"],
          histRows,
          ["left", "left", "right", "left", "left", "left", "left"],
          [25, 25, 25, 25, 25, 25, 30],
          "General Payment History",
        );
        engine.save(`PAYMENT_HISTORY_STATEMENT.pdf`);
        break;
      }

      case "vehicle-details": {
        const engine = new RegistryPDFEngine("Vehicle Profile Details", actor);
        engine.drawKeyValueRow(
          [
            { label: "Vehicle Number", value: data.vehicleNumber },
            { label: "Make / Model", value: data.makeModel || "—" },
          ],
          "Vehicle Information",
        );
        engine.drawKeyValueRow(
          [
            { label: "Owner Name", value: data.ownerName || "—" },
            { label: "Chassis Number", value: data.chassisNo || "—" },
          ],
          "Vehicle Information",
        );
        engine.drawKeyValueRow(
          [
            { label: "Engine Number", value: data.engineNo || "—" },
            { label: "Registration Date", value: data.regDate || "—" },
          ],
          "Vehicle Information",
        );
        engine.save(`VEHICLE_PROFILE_${data.vehicleNumber || "export"}.pdf`);
        break;
      }

      case "invoice-receipts": {
        const engine = new RegistryPDFEngine("Invoice Receipt Export", actor);
        engine.drawKeyValueRow(
          [
            { label: "Invoice Number", value: data.invoiceNumber },
            { label: "Invoice Date", value: data.invoiceDate },
          ],
          "Invoice Details",
        );
        engine.drawKeyValueRow(
          [
            { label: "Client Name", value: data.clientName },
            { label: "Invoice Total", value: formatCurrency(data.totalAmount || 0) },
          ],
          "Invoice Details",
        );
        engine.save(`INVOICE_RECEIPT_${data.invoiceNumber || "export"}.pdf`);
        break;
      }

      default:
        console.warn("[PDF Generator] Unknown document type:", type);
        break;
    }
  } catch (err) {
    console.error("Centralized generatePDF failed for type:", type, err);
  }
}

export default {};
