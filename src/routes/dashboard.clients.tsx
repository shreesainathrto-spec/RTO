import { createFileRoute } from "@tanstack/react-router";
import { V2ClientList } from "@/components/V2ClientList";

export const Route = createFileRoute("/dashboard/clients")({
  component: () => (
    <V2ClientList
      type="client"
      title="Customers / Clients"
      description="Centralized customer master profiles, vehicle assets, change history, and completed service logs."
    />
  ),
});
