import type { ApplicationRecord } from "@/lib/applications";

export type LicenceApplication = ApplicationRecord;

export interface LicenceDetailsData {
  licenceNumber?: string;
  applicantName?: string;
  fatherHusbandName?: string;
  dob?: string;
  bloodGroup?: string;
  mobileNumber?: string;
  address?: string;
  rtoCode?: string;
  classOfVehicles?: string[];
  licenceType?: "Learner Licence" | "Permanent Licence" | "Renewal" | "Duplicate" | "Add Class" | "International" | string;
  issueDate?: string;
  expiryDate?: string;
  learningLicenceNumber?: string;
  learningIssueDate?: string;
  learningExpiryDate?: string;
  testSlotDate?: string;
  testSlotTime?: string;
}
