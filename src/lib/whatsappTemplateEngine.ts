export interface ClientData {
  clientName: string;
  mobileNumber: string;
  vehicleNumber: string;
  serviceName?: string;
  dueDate?: string;
  pendingAmount?: number;
  invoiceNumber?: string;
}

type TemplateFn = (data: ClientData) => string;

export const templates: Record<string, TemplateFn> = {
  "Insurance Renewal Due": (d) =>
    `Dear ${d.clientName},\n\nYour vehicle insurance for ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease contact us to complete the renewal process.\n\nThank you.`,
  "Fitness Renewal Due": (d) =>
    `Dear ${d.clientName},\n\nThe fitness certificate for vehicle ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease contact us for renewal.\n\nThank you.`,
  "Gujarat Permit Renewal Due": (d) =>
    `Dear ${d.clientName},\n\nYour Gujarat Permit for vehicle ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease contact us for renewal assistance.`,
  "National Permit(Gujrat Permit) Renewal Due": (d) =>
    `Dear ${d.clientName},\n\nYour National Permit(Gujrat Permit) for vehicle ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease contact us for renewal assistance.`,
  "Tax Due Reminder": (d) =>
    `Dear ${d.clientName},\n\nVehicle tax for ${d.vehicleNumber} is due on ${d.dueDate}.\n\nKindly arrange payment to avoid penalties.`,
  "PUC Renewal Reminder": (d) =>
    `Dear ${d.clientName},\n\nYour PUC for vehicle ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease schedule the renewal at your earliest convenience.`,
  "License Renewal Reminder": (d) =>
    `Dear ${d.clientName},\n\nYour license renewal for vehicle ${d.vehicleNumber} is due on ${d.dueDate}.\n\nPlease contact us to complete the process.`,
  "Payment Reminder": (d) =>
    `Dear ${d.clientName},\n\nA payment of ₹${d.pendingAmount} is pending against Invoice ${d.invoiceNumber}.\n\nPlease make payment at your earliest convenience.\n\nThank you.`,
  "Thank You Message": (d) =>
    `Dear ${d.clientName},\n\nThank you for choosing our services.\n\nWe appreciate your trust and support.`,
  "Birthday Wishes": (d) =>
    `Happy Birthday ${d.clientName}!\n\nWishing you happiness, success and good health.`,
  "Anniversary Wishes": (d) =>
    `Dear ${d.clientName},\n\nWishing you a very happy anniversary.\n\nThank you for being a valued customer.`,
  "Feedback Request": (d) =>
    `Dear ${d.clientName},\n\nThank you for using our services.\n\nWe would appreciate your feedback regarding your experience.`,
  "Custom Message": () => "",
};

export const renderTemplate = (key: string, data: ClientData): string => {
  const fn = templates[key];
  return fn ? fn(data) : "";
};
