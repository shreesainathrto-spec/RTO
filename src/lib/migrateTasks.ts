import { db } from "./firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";

async function runMigration() {
  console.log("🚀 Starting Tasks Assigned Employee Display Migration...");

  try {
    // 1. Load all employees
    const usersSnap = await getDocs(collection(db, "users"));
    const employees = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as any));
    console.log(`Loaded ${employees.length} employees from users collection.`);
    if (employees.length > 0) {
      console.log("Sample employee keys:", Object.keys(employees[0]), employees[0]);
    }

    // Helper to find matching employee
    const findEmployee = (val: string) => {
      const normalized = val?.trim() ?? "";
      if (!normalized) return null;
      return employees.find(
        (e: any) =>
          e.uid === normalized ||
          e.employeeId === normalized ||
          e.username === normalized ||
          e.fullName === normalized ||
          e.name === normalized
      );
    };

    // Helper to clean undefined values
    const cleanFields = (obj: any) => {
      const res: any = {};
      for (const k of Object.keys(obj)) {
        if (obj[k] !== undefined) {
          res[k] = obj[k];
        }
      }
      return res;
    };

    // 2. Migrate registry_tasks
    console.log("\n--- Migrating registry_tasks ---");
    const tasksSnap = await getDocs(collection(db, "registry_tasks"));
    let updatedTasksCount = 0;

    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data() as any;
      const currentAssignee = task.assignee || task.assignedEmployeeId || task.assignedEmployeeUid;
      const emp = findEmployee(currentAssignee);
      if (emp) {
        const empName = emp.fullName || emp.name || emp.displayName || emp.username || "";
        const updateObj = cleanFields({
          assignee: emp.uid,
          assignedEmployeeId: emp.employeeId || emp.uid,
          assignedEmployeeUid: emp.uid,
          assignedEmployeeName: empName,
          assignedEmployeeRole: emp.role || "",
        });
        await updateDoc(doc(db, "registry_tasks", taskDoc.id), updateObj);
        console.log(`Updated task "${task.title}" -> Assigned to ${empName}`);
        updatedTasksCount++;
      } else {
        console.log(`⚠️ Match not found for task "${task.title}" (assignee: "${task.assignee}")`);
      }
    }
    console.log(`Registry tasks migration completed. Updated: ${updatedTasksCount} tasks.`);

    // 3. Migrate registry_services_v2
    console.log("\n--- Migrating registry_services_v2 ---");
    const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
    let updatedServicesCount = 0;

    for (const serviceDoc of servicesSnap.docs) {
      const s = serviceDoc.data() as any;
      const currentAssignee = s.assignedTo || s.employeeId || s.assignee || s.assignedStaff || s.assignedEmployeeUid;
      const emp = findEmployee(currentAssignee);
      if (emp) {
        const empName = emp.fullName || emp.name || emp.displayName || emp.username || "";
        const updateObj = cleanFields({
          assignee: emp.uid,
          assignedTo: emp.uid,
          employeeId: emp.uid,
          assignedStaff: emp.uid,
          assignedEmployeeId: emp.employeeId || emp.uid,
          assignedEmployeeUid: emp.uid,
          assignedEmployeeName: empName,
          assignedEmployeeRole: emp.role || "",
        });
        await updateDoc(doc(db, "registry_services_v2", serviceDoc.id), updateObj);
        console.log(`Updated service task "${s.serviceType || "Service"}" -> Assigned to ${empName}`);
        updatedServicesCount++;
      } else {
        console.log(`⚠️ Match not found for service "${s.serviceType || "Service"}" (assignee: "${currentAssignee}")`);
      }
    }
    console.log(`Service tasks migration completed. Updated: ${updatedServicesCount} services.`);
    console.log("\n🎉 Migration process completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed with error:", error);
  }
}

runMigration();
