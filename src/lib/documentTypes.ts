import type { ServiceType } from "./records";

export const CLIENT_DOCUMENT_TYPES = [
  "Aadhaar Card",
  "PAN Card",
  "Passport",
  "Driving License",
  "Photo",
  "Address Proof",
  "Other Client Documents",
] as const;

export const VEHICLE_DOCUMENT_TYPES = [
  "RC Book",
  "Insurance Copy",
  "Fitness Certificate",
  "Permit Documents",
  "Tax Documents",
  "PUC Certificate",
  "Other Vehicle Documents",
] as const;

export type ClientDocumentType = (typeof CLIENT_DOCUMENT_TYPES)[number];
export type VehicleDocumentType = (typeof VEHICLE_DOCUMENT_TYPES)[number];

export type ServiceDocumentType =
  | "Vehicle Photos"
  | "Previous Fitness Certificate"
  | "Existing Insurance Copy"
  | "Existing License"
  | "Required License Documents"
  | "Other Renewal Documents";

export type DocumentType = ClientDocumentType | VehicleDocumentType | ServiceDocumentType;

export const SERVICE_SPECIFIC_DOCUMENT_TYPES: Record<ServiceType, string[]> = {
  Insurance: ["RC Book", "Existing Insurance Copy", "Vehicle Photos"],
  Fitness: ["RC Book", "Previous Fitness Certificate"],
  "Gujarat Permit": ["RC Book", "Permit Documents"],
  "National Permit": ["RC Book", "Permit Documents"],
  "National Permit(Gujrat Permit)": ["RC Book", "Permit Documents"],
  Tax: ["RC Book", "Tax Documents"],
  PUC: ["RC Book", "PUC Certificate"],
  "License New": ["Aadhaar Card", "PAN Card", "Photo", "Required License Documents"],
  "License Renew": ["Existing License", "Aadhaar Card", "Other Renewal Documents"],
  "RC Transfer": ["RC Book", "Insurance Copy", "Tax Documents"],
  "HP Addition": ["RC Book", "Insurance Copy"],
  "HP Termination": ["RC Book", "Insurance Copy"],
};

export function isLicenseRenewal(application?: string, work?: string): boolean {
  const value = `${application ?? ""} ${work ?? ""}`.toLowerCase();
  return /renew|renewal/.test(value);
}

export function getServiceSpecificDocumentTypes(
  serviceType: ServiceType,
  application?: string,
  work?: string,
): string[] {
  // Service-specific mapping now includes 'License New' and 'License Renew'.
  // If a legacy 'License' value is passed, determine renewal status and map accordingly.
  if ((serviceType as string) === "License") {
    const renewal = isLicenseRenewal(application, work);
    return renewal
      ? SERVICE_SPECIFIC_DOCUMENT_TYPES["License Renew"]
      : SERVICE_SPECIFIC_DOCUMENT_TYPES["License New"];
  }

  return SERVICE_SPECIFIC_DOCUMENT_TYPES[serviceType] ?? [];
}

export const ALL_CLIENT_DOCUMENT_TYPES = [...CLIENT_DOCUMENT_TYPES] as readonly string[];
export const ALL_VEHICLE_DOCUMENT_TYPES = [...VEHICLE_DOCUMENT_TYPES] as readonly string[];

export type DocumentCategory = "Client Documents" | "Vehicle Documents" | "Service Documents";

export function getDocumentCategory(type: string): DocumentCategory {
  if (CLIENT_DOCUMENT_TYPES.includes(type as ClientDocumentType)) {
    return "Client Documents";
  }
  if (VEHICLE_DOCUMENT_TYPES.includes(type as VehicleDocumentType)) {
    return "Vehicle Documents";
  }
  return "Service Documents";
}

export function isRepeatableDocumentType(type: string): boolean {
  return [
    "Other Client Documents",
    "Other Vehicle Documents",
    "Vehicle Photos",
    "Previous Fitness Certificate",
    "Existing Insurance Copy",
    "Existing License",
    "Required License Documents",
    "Other Renewal Documents",
  ].includes(type);
}
