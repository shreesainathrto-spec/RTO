import { createFileRoute } from "@tanstack/react-router";
import { DrivingSchoolVehiclesView } from "@/modules/school-vehicles/components/SchoolVehiclesView";

export const Route = createFileRoute("/dashboard/driving-school/vehicles")({
  component: DrivingSchoolVehiclesView,
});
