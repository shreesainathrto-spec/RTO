import {
  subscribeToAllInvoices,
  subscribeInvoicesBySubModule,
  createInvoice,
  deleteInvoiceById,
  syncInvoice,
  calculateBillingMetrics,
  migrateExistingInvoices,
} from "@/lib/billing";

export const billingService = {
  subscribeToAllInvoices,
  subscribeInvoicesBySubModule,
  createInvoice,
  deleteInvoiceById,
  syncInvoice,
  calculateBillingMetrics,
  migrateExistingInvoices,
};
