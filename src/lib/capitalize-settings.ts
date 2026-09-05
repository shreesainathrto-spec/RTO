/**
 * Transform input value based on force capital letters setting.
 * @param value - The input value to transform
 * @param forceCaps - Whether to force capitalize the value
 * @returns Transformed value (uppercase if forceCaps is true, original otherwise)
 */
export function transformInput(value: string | undefined, forceCaps: boolean): string {
  if (!value) return value ?? "";
  return forceCaps ? value.toUpperCase() : value;
}

/**
 * Get force capital letters setting from localStorage.
 * @returns Boolean indicating if force capital letters is enabled
 */
export function getForceCapsSetting(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("force_caps");
  return stored === "true";
}

/**
 * Set force capital letters setting in localStorage.
 * @param enabled - Whether to enable force capital letters
 */
export function setForceCapsSetting(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("force_caps", enabled ? "true" : "false");
}

/**
 * Fields that should be capitalized when force caps is enabled.
 * These are human-readable text fields across the CRM.
 */
export const CAPITALIZE_FIELDS = [
  // Client / Customer fields
  "name",
  "clientName",
  "customerName",
  "ownerName",
  "fatherName",
  "company",
  "companyName",
  "groupName",
  "address",
  "city",
  "state",
  "district",
  "taluka",
  "village",
  "co",          // C/O (Care Of)

  // Vehicle fields
  "mvNo",
  "vehicleNumber",
  "vehicleType",
  "vehicleClass",
  "chassisNo",
  "engineNo",
  "maker",
  "model",
  "color",
  "bodyType",
  "fuelType",
  "mo",          // Mobile Operator / Manufacturer

  // Application / Work fields
  "application",
  "applicationType",
  "work",
  "workType",
  "serviceName",
  "serviceType",
  "remark",
  "remarks",
  "note",
  "notes",
  "description",
  "comment",
  "comments",
  "reason",

  // Insurance fields
  "insuranceCompany",
  "policyHolder",
  "insuredName",
  "agencyName",

  // Task fields
  "title",
  "taskTitle",
  "templateName",
  "assignee",
  "assigneeName",

  // Employee fields
  "displayName",
  "firstName",
  "lastName",
  "designation",
  "department",

  // Billing fields
  "partyName",
  "billTo",
  "itemName",
  "itemDescription",

  // General
  "label",
  "category",
  "subCategory",
  "source",
  "referredBy",
  "occupation",
];

/**
 * Fields that must NEVER be uppercased — system identifiers, emails, etc.
 */
export const NEVER_CAPITALIZE_FIELDS = new Set([
  "id",
  "uid",
  "docId",
  "documentId",
  "email",
  "password",
  "token",
  "apiKey",
  "url",
  "href",
  "path",
  "fileName",
  "filePath",
  "firebaseUid",
  "createdBy",
  "updatedBy",
  "assignedTo",    // typically a UID
  "phoneNumber",
  "mobile",
  "phone",
  "contact",
]);

/**
 * Transform all applicable string fields in a data object to uppercase
 * if force caps is enabled. Safe to call on any object — skips non-string
 * values and protected fields.
 */
export function transformDataObject<T extends Record<string, any>>(data: T): T {
  if (!getForceCapsSetting()) return data;
  const result = { ...data };
  const capsFieldSet = new Set(CAPITALIZE_FIELDS);
  for (const key of Object.keys(result)) {
    if (
      typeof result[key] === "string" &&
      capsFieldSet.has(key) &&
      !NEVER_CAPITALIZE_FIELDS.has(key)
    ) {
      (result as any)[key] = result[key].toUpperCase();
    }
  }
  return result;
}

export function getInsuranceGstPercentage(): number {
  if (typeof window === "undefined") return 18;
  try {
    const raw = localStorage.getItem("registry-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.insuranceGstPercentage === "number") {
        return parsed.insuranceGstPercentage;
      }
    }
  } catch {}
  return 18;
}
