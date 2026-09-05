import { createFileRoute } from "@tanstack/react-router";
import { DrivingSchoolVehiclesView } from "@/components/DrivingSchoolVehiclesView";

export const Route = createFileRoute("/dashboard/driving-school/vehicles")({
  component: DrivingSchoolVehiclesView,
});
