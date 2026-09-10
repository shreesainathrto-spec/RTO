import { createFileRoute } from "@tanstack/react-router";
import { DrivingSchoolExpensesView } from "@/modules/school-expenses/components/SchoolExpensesView";

export const Route = createFileRoute("/dashboard/driving-school/expenses")({
  component: DrivingSchoolExpensesView,
});
