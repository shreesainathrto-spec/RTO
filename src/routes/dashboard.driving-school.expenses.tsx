import { createFileRoute } from "@tanstack/react-router";
import { DrivingSchoolExpensesView } from "@/components/DrivingSchoolExpensesView";

export const Route = createFileRoute("/dashboard/driving-school/expenses")({
  component: DrivingSchoolExpensesView,
});
