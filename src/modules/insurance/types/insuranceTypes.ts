import type { ApplicationRecord } from "@/lib/applications";

export type InsuranceApplication = ApplicationRecord;

export interface InsurancePolicyDetails {
  company?: string;
  policyNumber?: string;
  policyType?: string;
  issueDate?: string;
  expiryDate?: string;
  amount?: number;
  insurancePlace?: string;
  documentUrl?: string;
  policySubCategory?: string;
  vehicleType?: string;
  agent?: string;
  insuranceAgency?: string;
  reference?: string;
  fuelType?: string;
  vehicleRegistrationNumber?: string;
  vehicleModelDetails?: string;
  premiumExclGst?: number;
  gstAmount?: number;
  totalPremium?: number;
  insurerCommission?: number;
  clientDiscount?: number;
  netCommission?: number;
}
