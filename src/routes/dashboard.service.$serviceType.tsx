import { createFileRoute } from "@tanstack/react-router";
import { ServiceDashboard } from "@/components/ServiceDashboard";
import { SERVICE_ROUTE_MAP, type ServiceType } from "@/lib/records";

export const Route = createFileRoute("/dashboard/service/$serviceType")({
  component: ServiceTypePage,
});

function ServiceTypePage() {
  const { serviceType } = Route.useParams();

  const normalizedParam = serviceType.toLowerCase();

  if (normalizedParam === "all") {
    return <ServiceDashboard serviceType={"Insurance" as ServiceType} title="In RTO Services" description="All completed RTO services across all categories" />;
  }

  const mappedService = SERVICE_ROUTE_MAP[normalizedParam];

  if (!mappedService) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invalid Service Type</h2>
          <p className="text-sm text-muted-foreground">
            The service type "{serviceType}" is not recognized.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Valid services: Insurance, Fitness, Permit, Gujarat Permit, National Permit, Tax, PUC,
            License New, License Renew, RC Transfer, HP Addition, HP Termination
          </p>
        </div>
      </div>
    );
  }

  return <ServiceDashboard serviceType={mappedService} />;
}
