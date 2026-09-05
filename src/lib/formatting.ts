const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return inrFormatter.format(0);
  }
  return inrFormatter.format(Number(amount));
}

export function formatDate(iso?: string | Date | null | any): string {
  return formatDateDDMMYYYY(iso);
}

export function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateTime(iso?: string | Date | null | any): string {
  if (!iso) return "—";
  const dateStr = formatDateDDMMYYYY(iso);
  if (dateStr === "—") return "—";
  
  let d: Date;
  try {
    if (iso && typeof iso.toDate === "function") {
      d = iso.toDate();
    } else if (iso && iso.seconds !== undefined && iso.nanoseconds !== undefined) {
      d = new Date(iso.seconds * 1000);
    } else {
      d = new Date(iso);
    }
    if (isNaN(d.getTime())) return dateStr;
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateStr;
  }
}

export function formatPaymentStatus(status?: string): string {
  if (!status) return "—";
  const s = status.trim().toLowerCase();
  if (s === "paid") return "કુલ જામ";
  if (s === "partially paid" || s === "partial") return "થોડા બકી";
  if (s === "pending" || s === "pending invoice" || s === "unpaid") return "બધા બકી";
  if (s === "overdue") return "સમય મર્યાદા";
  return status;
}

export function formatDateDDMMYYYY(val?: string | Date | null | any): string {
  if (!val) return "—";
  try {
    if (typeof val === "string") {
      const cleaned = val.trim();
      if (!cleaned || cleaned === "—" || cleaned.toLowerCase() === "invalid date") return "—";
      
      // Handle ISO strings with timezone offsets (e.g. 2026-08-31T00:00:00.000Z or 2026-08-31T11:17:43+05:30)
      if (cleaned.includes("T")) {
        const datePart = cleaned.split("T")[0];
        const matchISO = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (matchISO) {
          const year = parseInt(matchISO[1], 10);
          const month = parseInt(matchISO[2], 10);
          const day = parseInt(matchISO[3], 10);
          if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
          }
        }
      }
      
      const matchYMD = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (matchYMD) {
        const year = parseInt(matchYMD[1], 10);
        const month = parseInt(matchYMD[2], 10);
        const day = parseInt(matchYMD[3], 10);
        if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
        }
      }

      // Check if already in DD/MM/YYYY format or similar
      const matchDMY = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (matchDMY) {
        const day = parseInt(matchDMY[1], 10);
        const month = parseInt(matchDMY[2], 10);
        const year = parseInt(matchDMY[3], 10);
        if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
        }
      }

      // Try parsing malformed legacy formats or dates with invalid day/month ranges (like MM/DD/YYYY if valid, or just match numbers)
      // Check for malformed strings like 0020-22-61, 0615-27-20, 20/27/0818
      // If we see 20/27/0818, it could be DD/MM/YYYY where MM=27 (invalid). We will treat it as invalid and show blank/invalid state
    }

    let d: Date;
    if (val && typeof val.toDate === "function") {
      d = val.toDate();
    } else if (val && val.seconds !== undefined && val.nanoseconds !== undefined) {
      d = new Date(val.seconds * 1000);
    } else if (val instanceof Date) {
      d = val;
    } else {
      // Explicitly construct local date for YYYY-MM-DD to avoid UTC timezone shifts
      if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
        const [y, m, dPart] = val.trim().split("-").map(Number);
        d = new Date(y, m - 1, dPart);
      } else {
        d = new Date(val);
      }
    }
    
    if (isNaN(d.getTime())) {
      return "—";
    }
    
    // Check if the year is absurdly low (like 0020 or 0615) to prevent displaying invalid/malformed dates
    if (d.getFullYear() < 1000) {
      return "—";
    }

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return "—";
  }
}

export function parseDateDDMMYYYY(val?: string | null): Date | null {
  if (!val) return null;
  const cleaned = val.trim();
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const year = parseInt(match[3], 10);
  
  if (year < 1000 || month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }
  
  const d = new Date(year, month, day);
  if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
    return d;
  }
  return null;
}

export function isValidDateDDMMYYYY(val?: string | null): boolean {
  if (!val) return false;
  return parseDateDDMMYYYY(val) !== null;
}

export function ensureYYYYMMDD(val: any): string {
  if (!val) return "";
  if (typeof val === "string") {
    const cleaned = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      const [y, m, d] = cleaned.split("-").map(Number);
      if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return cleaned;
      }
      return "";
    }
    
    // Check if format is DD/MM/YYYY or D/M/YYYY
    const matchDMY = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (matchDMY) {
      const day = parseInt(matchDMY[1], 10);
      const month = parseInt(matchDMY[2], 10);
      const year = parseInt(matchDMY[3], 10);
      if (year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      return "";
    }
    
    // Check if format is YYYY/MM/DD
    const matchYMD = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (matchYMD) {
      const year = parseInt(matchYMD[1], 10);
      const month = parseInt(matchYMD[2], 10);
      const day = parseInt(matchYMD[3], 10);
      if (year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      return "";
    }
    if (cleaned.includes("T")) {
      const datePart = cleaned.split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split("-").map(Number);
        if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return datePart;
        }
      }
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1000) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}
  return "";
}


