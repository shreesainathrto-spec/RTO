import {
  subscribeApplications,
  saveApplicationAndVehicle,
  deleteApplication,
} from "@/lib/applications";

export const licenceService = {
  subscribeApplications,
  saveLicenceApplication: saveApplicationAndVehicle,
  deleteLicenceApplication: deleteApplication,
};
