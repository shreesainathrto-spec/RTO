import {
  fetchAllUsers,
  subscribeAllUsers,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeAssignedTasksCount,
  setEmployeeStatus,
  resetEmployeePassword,
  logEmployeeAction,
} from "@/lib/userService";

export const employeeService = {
  fetchAllUsers,
  subscribeAllUsers,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeAssignedTasksCount,
  setEmployeeStatus,
  resetEmployeePassword,
  logEmployeeAction,
};
