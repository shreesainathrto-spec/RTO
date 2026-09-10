import type { ApplicationRecord, VehicleMaster } from "@/lib/applications";

export type VahaanApplication = ApplicationRecord;
export type VahaanVehicleDetails = VehicleMaster;

export interface VahaanFilterOptions {
  searchTerm: string;
  statusFilter: string;
  paymentFilter: string;
  groupFilter: string;
}
