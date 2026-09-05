import { createFileRoute } from "@tanstack/react-router";
import { V2ClientList } from "@/components/V2ClientList";

export const Route = createFileRoute("/dashboard/leads")({
  component: () => (
    <V2ClientList
      type="lead"
      title="Leads"
      description="Incoming inquiries and prospects to follow up."
    />
  ),
});
