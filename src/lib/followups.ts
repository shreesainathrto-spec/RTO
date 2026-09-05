import { type RegistryRecord, getRecordServiceDetails, type ServiceDetail } from "./records";

export interface FollowUpEntry {
  clientId: string;
  clientName: string;
  mvNo?: string;
  mobile?: string;
  assignee?: string;
  serviceType: string;
  dueDate?: string; // ISO or YYYY-MM-DD
  status?: string;
  daysRemaining?: number; // negative => overdue
}

function toDate(d?: string): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function daysBetween(a: Date, b: Date) {
  const start = new Date(a);
  const end = new Date(b);
  const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function flattenServices(records: RegistryRecord[]): FollowUpEntry[] {
  const now = new Date();
  const out: FollowUpEntry[] = [];

  for (const r of records) {
    const services = getRecordServiceDetails(r) as ServiceDetail[];
    for (const s of services) {
      const due = toDate(s.dueDate || "");
      const entry: FollowUpEntry = {
        clientId: r.id,
        clientName: r.name,
        mvNo: r.mvNo,
        mobile: r.mo,
        assignee: r.assignee,
        serviceType: s.serviceType,
        dueDate: s.dueDate || undefined,
        status: s.status,
      };

      if (due) {
        entry.daysRemaining = daysBetween(now, new Date(due));
      }

      out.push(entry);
    }
  }

  return out;
}

export function computeFollowUps(records: RegistryRecord[]) {
  const flat = flattenServices(records);
  const today: FollowUpEntry[] = [];
  const upcoming7: FollowUpEntry[] = [];
  const upcoming15: FollowUpEntry[] = [];
  const upcoming30: FollowUpEntry[] = [];
  const overdue: FollowUpEntry[] = [];

  for (const e of flat) {
    if (e.dueDate && typeof e.daysRemaining === "number") {
      const d = e.daysRemaining;
      if (d === 0) today.push(e);
      else if (d > 0 && d <= 7) upcoming7.push(e);
      else if (d > 7 && d <= 15) upcoming15.push(e);
      else if (d > 15 && d <= 30) upcoming30.push(e);
      else if (d < 0) overdue.push(e);
    }
  }

  const totalActiveServices = flat.filter((f) => (f.status || "") !== "Completed").length;

  return {
    flat,
    today,
    upcoming7,
    upcoming15,
    upcoming30,
    overdue,
    totals: {
      today: today.length,
      upcoming7: upcoming7.length,
      upcoming15: upcoming15.length,
      upcoming30: upcoming30.length,
      overdue: overdue.length,
      totalActiveServices,
    },
  };
}

export function computeVehicleDocFollowUps(
  vehicleDocs: any[],
  vehicles: any[],
  clients: any[],
  leads: any[]
) {
  const now = new Date();
  const flat: any[] = [];
  
  const today: any[] = [];
  const upcoming7: any[] = [];
  const upcoming15: any[] = [];
  const upcoming30: any[] = [];
  const overdue: any[] = [];
  
  for (const docObj of vehicleDocs) {
    if (!docObj.expiryDate) continue;
    
    const expiry = new Date(docObj.expiryDate);
    if (isNaN(expiry.getTime())) continue;
    
    const vehicle = vehicles.find((v) => v.id === docObj.vehicleId);
    const vehicleNo = vehicle?.vehicleNumber || "—";
    
    const clientId = docObj.clientId || vehicle?.clientId;
    const client = clients.find((c) => c.id === clientId) || leads.find((l) => l.id === clientId);
    const clientName = client?.name || "Unknown Client";
    
    const docLabels: Record<string, string> = {
      rc_book: "RC Book",
      insurance: "Insurance Copy",
      fitness: "Fitness Certificate",
      gujarat_permit: "Gujarat Permit",
      national_permit: "National Permit(Gujrat Permit)",
      tax: "Tax Documents",
      puc: "PUC Certificate",
      other: "Other Vehicle Documents",
    };
    const documentName = docLabels[docObj.documentType] || docObj.documentType || "Vehicle Document";
    
    const daysRemaining = daysBetween(now, expiry);
    
    const entry = {
      clientId: clientId || "",
      clientName,
      mvNo: vehicleNo,
      serviceType: documentName,
      dueDate: docObj.expiryDate,
      daysRemaining,
      assignee: docObj.uploadedBy || "System",
      status: daysRemaining < 0 ? "Expired" : "Active",
    };
    
    flat.push(entry);
    
    if (daysRemaining === 0) {
      today.push(entry);
    } else if (daysRemaining > 0 && daysRemaining <= 7) {
      upcoming7.push(entry);
    } else if (daysRemaining > 7 && daysRemaining <= 15) {
      upcoming15.push(entry);
    } else if (daysRemaining > 15 && daysRemaining <= 30) {
      upcoming30.push(entry);
    } else if (daysRemaining < 0) {
      overdue.push(entry);
    }
  }
  
  return {
    flat,
    today,
    upcoming7,
    upcoming15,
    upcoming30,
    overdue,
    totals: {
      today: today.length,
      upcoming7: upcoming7.length,
      upcoming15: upcoming15.length,
      upcoming30: upcoming30.length,
      overdue: overdue.length,
      totalActiveServices: flat.length,
    },
  };
}

export default { flattenServices, computeFollowUps, computeVehicleDocFollowUps };
