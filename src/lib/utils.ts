import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ADVANCE_AMOUNT_ERROR_MESSAGE = "Advance amount must be less than total amount.";

/**
 * Validates that Advance Amount is strictly less than Total Amount.
 * Rule: Advance Amount < Total Amount
 * - advance < total (when total > 0 and advance >= 0)
 * - if total === 0, advance must be 0
 * - advance must never be negative
 * - advance must never equal total
 * - advance must never be greater than total
 */
export function isAdvanceAmountValid(
  totalAmount: number | string | undefined | null,
  advanceAmount: number | string | undefined | null
): boolean {
  const total = Number(totalAmount) || 0;
  const advance = Number(advanceAmount) || 0;

  if (advance < 0) return false;
  if (total === 0 && advance > 0) return false;
  if (total > 0 && advance >= total) return false;
  if (total === 0 && advance === 0) return true;
  return advance < total;
}

/**
 * Normalizes any appointment date representation (DD/MM/YYYY, ISO, Timestamp, Date)
 * into a unix timestamp (milliseconds).
 * Returns -Infinity if date is missing/invalid, ensuring empty dates sort to the bottom.
 */
export function parseAppointmentDateToTime(d: any): number {
  if (d === null || d === undefined) return -Infinity;
  if (typeof d === "object" && typeof d.toDate === "function") {
    try {
      const t = d.toDate().getTime();
      return isNaN(t) ? -Infinity : t;
    } catch {
      return -Infinity;
    }
  }
  if (typeof d === "object" && typeof d.seconds === "number") {
    return d.seconds * 1000;
  }
  if (d instanceof Date) {
    const t = d.getTime();
    return isNaN(t) ? -Infinity : t;
  }
  if (typeof d === "number") {
    return isNaN(d) ? -Infinity : d;
  }
  if (typeof d === "string") {
    const s = d.trim();
    if (!s || s === "—" || s === "-" || s === "undefined" || s === "null") return -Infinity;

    // 1. DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
      const year = parseInt(ddmmyyyyMatch[3], 10);
      const date = new Date(year, month, day);
      const t = date.getTime();
      return isNaN(t) ? -Infinity : t;
    }

    // 2. YYYY-MM-DD
    const yyyymmddMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)$/);
    if (yyyymmddMatch) {
      const year = parseInt(yyyymmddMatch[1], 10);
      const month = parseInt(yyyymmddMatch[2], 10) - 1;
      const day = parseInt(yyyymmddMatch[3], 10);
      const date = new Date(year, month, day);
      const t = date.getTime();
      return isNaN(t) ? -Infinity : t;
    }

    // 3. Fallback standard date parsing
    const parsed = new Date(s).getTime();
    return isNaN(parsed) ? -Infinity : parsed;
  }
  return -Infinity;
}

/**
 * Compares two records by their appointment date descending (Latest -> Oldest).
 * Records with missing/empty appointment dates are placed at the bottom.
 * If appointment dates are identical, falls back to secondary sort (createdAt descending).
 */
export function compareAppointmentDatesDescending(a: any, b: any): number {
  const timeA = parseAppointmentDateToTime(a?.appointmentDate);
  const timeB = parseAppointmentDateToTime(b?.appointmentDate);

  if (timeA !== timeB) {
    return timeB - timeA; // Larger timestamp (more recent / future) first
  }

  // Stable secondary sort by createdAt descending
  const createdA = parseAppointmentDateToTime(a?.createdAt) !== -Infinity
    ? parseAppointmentDateToTime(a?.createdAt)
    : 0;
  const createdB = parseAppointmentDateToTime(b?.createdAt) !== -Infinity
    ? parseAppointmentDateToTime(b?.createdAt)
    : 0;

  if (createdA !== createdB) {
    return createdB - createdA;
  }

  return 0;
}
