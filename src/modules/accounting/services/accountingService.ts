import {
  subscribeAccountingRecords,
  saveAccountingRecord,
  syncAccountingRecord,
} from "@/lib/applications";
import {
  subscribeAndSyncFinance,
  subscribePaymentHistory,
  updateRecordCollectionDate,
  setBhaylubhaRequirement,
  approveRecordBhaylubha,
  recordPaymentEntry,
  recordMultiInvoicePayment,
  recordDirectPayment,
} from "@/lib/financeService";
import {
  subscribeOfficeExpenses,
  addOfficeExpense,
  updateOfficeExpense,
  deleteOfficeExpense,
} from "@/lib/officeExpensesService";

export const accountingService = {
  subscribeAccountingRecords,
  saveAccountingRecord,
  syncAccountingRecord,
  subscribeAndSyncFinance,
  subscribePaymentHistory,
  updateRecordCollectionDate,
  setBhaylubhaRequirement,
  approveRecordBhaylubha,
  recordPaymentEntry,
  recordMultiInvoicePayment,
  recordDirectPayment,
  subscribeOfficeExpenses,
  addOfficeExpense,
  updateOfficeExpense,
  deleteOfficeExpense,
};
