import {
  subscribeApplications,
  saveApplicationAndVehicle,
  deleteApplication,
} from "@/lib/applications";

export const form5Service = {
  subscribeApplications,
  saveForm5Application: saveApplicationAndVehicle,
  deleteForm5Application: deleteApplication,
};
