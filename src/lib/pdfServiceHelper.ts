import { generatePDF } from "@/lib/pdfGenerator";

export function generateServicePDF(
  serviceType: string,
  data: Record<string, any>,
  generatedBy: string = "system",
) {
  const pdfTypeMap: Record<string, string> = {
    Insurance: "insurance",
    Fitness: "fitness",
    "Gujarat Permit": "gujarat-permit",
    "National Permit": "national-permit",
    "National Permit(Gujrat Permit)": "national-permit",
    Tax: "tax",
    PUC: "puc",
    "License New": "license-new",
    "License Renew": "license-renew",
    "Client Details": "client-details",
    "Vehicle Details": "vehicle-details",
  };
  const templateKey = pdfTypeMap[serviceType] || serviceType.toLowerCase().replace(/\s+/g, "-");
  generatePDF(templateKey, data, generatedBy);
}
