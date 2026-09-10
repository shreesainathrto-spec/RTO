import {
  subscribeApplications,
  saveApplicationAndVehicle,
  deleteApplication,
} from "@/lib/applications";
import { getInsuranceGstPercentage } from "@/lib/capitalize-settings";

export const insuranceService = {
  subscribeApplications,
  saveInsuranceApplication: saveApplicationAndVehicle,
  deleteInsuranceApplication: deleteApplication,
  getInsuranceGstPercentage,
};
