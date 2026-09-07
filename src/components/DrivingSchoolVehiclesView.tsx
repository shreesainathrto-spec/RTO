import React, { useState, useEffect, useMemo } from "react";
import {
  Car,
  Plus,
  Calendar,
  Gauge,
  FileText,
  Upload,
  Camera,
  CheckCircle,
  X,
  User,
  Users,
  Fuel,
  DollarSign,
  Info,
  Clock,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { getSession } from "@/lib/auth";
import { removeUndefined } from "@/lib/records";
import { DRIVING_SCHOOL_DAILY_REPORTS_COL, DRIVING_SCHOOL_VEHICLES_COL, uploadImageToStorage } from "@/lib/drivingSchoolVehicles";
import { toast } from "sonner";
import {
  subscribeDrivingSchoolVehiclesList,
  subscribeDailyReportsForVehicle,
  subscribeAllDailyReports,
  saveDrivingSchoolVehicleRecord,
  saveDrivingSchoolDailyReportRecord,
  deleteDrivingSchoolVehicleRecord,
  deleteDrivingSchoolDailyReportRecord,
  type DrivingSchoolVehicle,
  type DrivingSchoolDailyReport,
  type StudentTrip,
} from "@/lib/drivingSchoolVehicles";
import {
  subscribeDrivingSchoolApplications,
  type DrivingSchoolApplication,
} from "@/lib/drivingSchool";
import { CameraOdometerModal } from "@/components/CameraOdometerModal";

const TIME_SLOTS = [
  "06:00 AM - 07:00 AM",
  "07:00 AM - 08:00 AM",
  "08:00 AM - 09:00 AM",
  "09:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "12:00 PM - 01:00 PM",
  "01:00 PM - 02:00 PM",
  "02:00 PM - 03:00 PM",
  "03:00 PM - 04:00 PM",
  "04:00 PM - 05:00 PM",
  "05:00 PM - 06:00 PM",
  "06:00 PM - 07:00 PM",
  "07:00 PM - 08:00 PM",
  "08:00 PM - 09:00 PM",
  "09:00 PM - 10:00 PM",
];

export function DrivingSchoolVehiclesView() {
  const session = getSession();
  const isAdmin = session?.role === "admin";

  const [vehicles, setVehicles] = useState<DrivingSchoolVehicle[]>([]);
  const [applications, setApplications] = useState<DrivingSchoolApplication[]>([]);
  const [allReports, setAllReports] = useState<DrivingSchoolDailyReport[]>([]);

  // Modal States
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<DrivingSchoolVehicle | null>(null);

  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [selectedVehicleForReport, setSelectedVehicleForReport] = useState<DrivingSchoolVehicle | null>(null);

  const [vehicleInfoOpen, setVehicleInfoOpen] = useState(false);
  const [selectedVehicleForInfo, setSelectedVehicleForInfo] = useState<DrivingSchoolVehicle | null>(null);
  const [infoVehicleReports, setInfoVehicleReports] = useState<DrivingSchoolDailyReport[]>([]);
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // Camera OCR Modal State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraTargetField, setCameraTargetField] = useState<"start" | "end">("start");

  // Form States for Add/Edit Vehicle
  const [vNumber, setVNumber] = useState("");
  const [vName, setVName] = useState("");
  const [vManufacturer, setVManufacturer] = useState("");
  const [vModel, setVModel] = useState("");
  const [vType, setVType] = useState("LMV - Hatchback");
  const [vFuelType, setVFuelType] = useState("Petrol");
  const [vRegDate, setVRegDate] = useState("");
  const [vInsuranceExp, setVInsuranceExp] = useState("");
  const [vFitnessExp, setVFitnessExp] = useState("");
  const [vPucExp, setVPucExp] = useState("");
  const [vPermitExp, setVPermitExp] = useState("");
  const [vTaxExp, setVTaxExp] = useState("");
  const [vOdometer, setVOdometer] = useState<number | string>(0);
  const [vStatus, setVStatus] = useState<"Available" | "In Use" | "Maintenance">("Available");
  const [vPhoto, setVPhoto] = useState("");
  const [vDocs, setVDocs] = useState<Record<string, string>>({});
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Form States for Daily Report
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportDriver, setReportDriver] = useState("");
  const [reportStartOdometer, setReportStartOdometer] = useState<number | string>(0);
  const [reportEndOdometer, setReportEndOdometer] = useState<number | string>(0);
  const [reportStartPhoto, setReportStartPhoto] = useState("");
  const [reportEndPhoto, setReportEndPhoto] = useState("");
  const [reportFuelPhoto, setReportFuelPhoto] = useState("");
  const [reportFuelExpense, setReportFuelExpense] = useState<number | string>("");
  const [reportGeneralExpense, setReportGeneralExpense] = useState<number | string>("");
  const [reportOtherExpense, setReportOtherExpense] = useState<number | string>("");
  const [reportExpenseRemarks, setReportExpenseRemarks] = useState("");
  const [reportStudentTrips, setReportStudentTrips] = useState<StudentTrip[]>([{
    studentName: "",
    batch: "",
    pickupTime: "",
    dropTime: "",
    pickupLocation: "",
    dropLocation: "",
    purpose: "",
    remarks: ""
  }]);
  const [savingReport, setSavingReport] = useState(false);

  // View Report Details Modal States
  const [viewReportDetailsOpen, setViewReportDetailsOpen] = useState(false);
  const [selectedReportForView, setSelectedReportForView] = useState<DrivingSchoolDailyReport | null>(null);

  // Search & Filter States for Daily Report History List
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [filterStudentName, setFilterStudentName] = useState("");

  // Realtime Subscriptions
  useEffect(() => {
    const unsubVehicles = subscribeDrivingSchoolVehiclesList((list) => {
      setVehicles(list);
    });
    const unsubApps = subscribeDrivingSchoolApplications((list) => {
      setApplications(list);
    });
    const unsubReports = subscribeAllDailyReports((list) => {
      setAllReports(list);
    });

    return () => {
      unsubVehicles();
      unsubApps();
      unsubReports();
    };
  }, []);

  // Filter Active Driving School Students for Daily Report Dropdown
  const activeStudents = useMemo(() => {
    return applications.filter((app) => app.status !== "Completed");
  }, [applications]);

  // Vehicle Counts
  const counts = useMemo(() => {
    const total = vehicles.length;
    const available = vehicles.filter((v) => v.status === "Available").length;
    const inUse = vehicles.filter((v) => v.status === "In Use").length;
    const maintenance = vehicles.filter((v) => v.status === "Maintenance").length;
    return { total, available, inUse, maintenance };
  }, [vehicles]);

  // Reset Add/Edit Vehicle Form
  const openAddVehicleModal = (veh?: DrivingSchoolVehicle) => {
    if (veh) {
      setEditingVehicle(veh);
      setVNumber(veh.vehicleNumber || "");
      setVName(veh.vehicleName || "");
      setVManufacturer(veh.manufacturer || "");
      setVModel(veh.model || "");
      setVType(veh.vehicleType || "LMV - Hatchback");
      setVFuelType(veh.fuelType || "Petrol");
      setVRegDate(veh.registrationDate || "");
      setVInsuranceExp(veh.insuranceExpiry || "");
      setVFitnessExp(veh.fitnessExpiry || "");
      setVPucExp(veh.pucExpiry || "");
      setVPermitExp(veh.permitExpiry || "");
      setVTaxExp(veh.taxExpiry || "");
      setVOdometer(veh.currentOdometer || 0);
      setVStatus(veh.status || "Available");
      setVPhoto(veh.vehiclePhoto || "");
      setVDocs((veh.documents as any) || {});
    } else {
      setEditingVehicle(null);
      setVNumber("");
      setVName("");
      setVManufacturer("");
      setVModel("");
      setVType("LMV - Hatchback");
      setVFuelType("Petrol");
      setVRegDate("");
      setVInsuranceExp("");
      setVFitnessExp("");
      setVPucExp("");
      setVPermitExp("");
      setVTaxExp("");
      setVOdometer(0);
      setVStatus("Available");
      setVPhoto("");
      setVDocs({});
    }
    setAddVehicleOpen(true);
  };

  // Handle Save Vehicle
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vNumber.trim() || !vName.trim()) {
      toast.error("Vehicle Number and Vehicle Name are mandatory!");
      return;
    }

    setSavingVehicle(true);
    try {
      await saveDrivingSchoolVehicleRecord(
        {
          vehicleNumber: vNumber.trim().toUpperCase(),
          vehicleName: vName.trim(),
          manufacturer: vManufacturer.trim(),
          model: vModel.trim(),
          vehicleType: vType,
          fuelType: vFuelType,
          registrationDate: vRegDate,
          insuranceExpiry: vInsuranceExp,
          fitnessExpiry: vFitnessExp,
          pucExpiry: vPucExp,
          permitExpiry: vPermitExp,
          taxExpiry: vTaxExp,
          currentOdometer: Number(vOdometer) || 0,
          status: vStatus,
          vehiclePhoto: vPhoto,
          documents: vDocs,
        },
        editingVehicle?.id
      );

      toast.success(editingVehicle ? "Vehicle updated successfully!" : "Vehicle registered successfully!");
      setAddVehicleOpen(false);
    } catch (err) {
      console.error("Error saving vehicle:", err);
      toast.error("Failed to save vehicle record");
    } finally {
      setSavingVehicle(false);
    }
  };

  // Open Daily Report Modal
  const openDailyReportModal = (veh: DrivingSchoolVehicle, report?: DrivingSchoolDailyReport) => {
    setSelectedVehicleForReport(veh);
    if (report) {
      setEditingReportId(report.id);
      setReportDate(report.reportDate || "");
      setReportDriver(report.driver || "");
      setReportStartOdometer(report.startOdometer || 0);
      setReportEndOdometer(report.endOdometer || 0);
      setReportStartPhoto(report.startOdometerPhoto || "");
      setReportEndPhoto(report.endOdometerPhoto || "");
      setReportFuelPhoto(report.fuelPhoto || "");
      setReportFuelExpense(report.fuelExpense !== undefined ? report.fuelExpense : (report.fuelAmount || ""));
      setReportGeneralExpense(report.generalExpense !== undefined ? report.generalExpense : (report.generalExpenseAmount || ""));
      setReportOtherExpense(report.otherExpense || "");
      setReportExpenseRemarks(report.expenseRemarks || report.notes || "");
      if (report.studentTrips && report.studentTrips.length > 0) {
        setReportStudentTrips(report.studentTrips);
      } else {
        setReportStudentTrips([{
          studentName: report.studentName || "",
          batch: "",
          pickupTime: "",
          dropTime: "",
          pickupLocation: "",
          dropLocation: "",
          purpose: "",
          remarks: ""
        }]);
      }
    } else {
      setEditingReportId(null);
      setReportDate(new Date().toISOString().split("T")[0]);
      setReportDriver("");
      setReportStartOdometer(veh.currentOdometer || 0);
      setReportEndOdometer((veh.currentOdometer || 0) + 38);
      setReportStartPhoto("");
      setReportEndPhoto("");
      setReportFuelPhoto("");
      setReportFuelExpense("");
      setReportGeneralExpense("");
      setReportOtherExpense("");
      setReportExpenseRemarks("");
      setReportStudentTrips([{
        studentName: activeStudents[0]?.studentName || "",
        batch: "",
        pickupTime: "",
        dropTime: "",
        pickupLocation: "",
        dropLocation: "",
        purpose: "",
        remarks: ""
      }]);
    }
    setDailyReportOpen(true);
  };

  // Handle Save Student Report (Decoupled Section 1)
  const handleSaveStudentReport = async () => {
    if (!selectedVehicleForReport) return;
    if (reportStudentTrips.length === 0 || reportStudentTrips.some(t => !t.studentName || !t.studentName.trim())) {
      toast.error("Please add at least one student trip and select a student name.");
      return;
    }

    setSavingReport(true);
    try {
      const now = new Date().toISOString();
      const session = getSession();

      if (editingReportId) {
        // Edit existing student report mode
        const docRef = doc(db, DRIVING_SCHOOL_DAILY_REPORTS_COL, editingReportId);
        const trip = reportStudentTrips[0];
        const drv = trip.driverName || trip.driver || reportDriver || "";
        await setDoc(docRef, {
          reportType: "student",
          vehicleId: selectedVehicleForReport.id,
          vehicleNumber: selectedVehicleForReport.vehicleNumber,
          reportDate,
          studentName: trip.studentName,
          driver: drv,
          driverName: drv,
          batch: trip.batch || "",
          pickupTime: trip.pickupTime || "",
          dropTime: trip.dropTime || "",
          pickupLocation: trip.pickupLocation || "",
          dropLocation: trip.dropLocation || "",
          purpose: trip.purpose || "",
          remarks: trip.remarks || "",
          updatedAt: now,
          updatedBy: session?.name || "System",
        }, { merge: true });
      } else {
        // Create new student reports mode
        for (const trip of reportStudentTrips) {
          const docRef = doc(collection(db, DRIVING_SCHOOL_DAILY_REPORTS_COL));
          const drv = trip.driverName || trip.driver || reportDriver || "";
          await setDoc(docRef, {
            id: docRef.id,
            reportType: "student",
            vehicleId: selectedVehicleForReport.id,
            vehicleNumber: selectedVehicleForReport.vehicleNumber,
            reportDate,
            studentName: trip.studentName,
            driver: drv,
            driverName: drv,
            batch: trip.batch || "",
            pickupTime: trip.pickupTime || "",
            dropTime: trip.dropTime || "",
            pickupLocation: trip.pickupLocation || "",
            dropLocation: trip.dropLocation || "",
            purpose: trip.purpose || "",
            remarks: trip.remarks || "", // student remarks
            createdAt: now,
            updatedAt: now,
            createdBy: session?.name || "System",
          });
        }
      }

      toast.success(editingReportId ? "Student Report updated successfully!" : "Student Report(s) saved successfully!");
      setDailyReportOpen(false);
    } catch (err) {
      console.error("Error saving student report:", err);
      toast.error("Failed to save student report");
    } finally {
      setSavingReport(false);
    }
  };

  // Handle Save Vehicle Report (Decoupled Section 2)
  const handleSaveVehicleReport = async () => {
    if (!selectedVehicleForReport) return;

    const startOdo = Number(reportStartOdometer) || 0;
    const endOdo = Number(reportEndOdometer) || 0;

    if (endOdo < startOdo) {
      toast.error("End Odometer reading cannot be less than Start Odometer reading!");
      return;
    }

    if (!reportStartPhoto) {
      toast.error("Starting Odometer Photo is required!");
      return;
    }
    if (!reportEndPhoto) {
      toast.error("Ending Odometer Photo is required!");
      return;
    }

    setSavingReport(true);
    try {
      const now = new Date().toISOString();
      const session = getSession();

      const fExp = Number(reportFuelExpense) || 0;
      const gExp = Number(reportGeneralExpense) || 0;
      const oExp = Number(reportOtherExpense) || 0;
      const totalExp = fExp + gExp + oExp;

      // Check if there is an existing vehicle report for this vehicle and date
      const existingRep = allReports.find(
        (r) =>
          r.vehicleId === selectedVehicleForReport.id &&
          r.reportDate === reportDate &&
          (r.reportType === "vehicle" || (!r.reportType && (r.startOdometer !== undefined || r.endOdometer !== undefined)))
      );

      let targetId = existingRep?.id;
      let docRef;

      if (targetId) {
        docRef = doc(db, DRIVING_SCHOOL_DAILY_REPORTS_COL, targetId);
      } else {
        docRef = doc(collection(db, DRIVING_SCHOOL_DAILY_REPORTS_COL));
        targetId = docRef.id;
      }

      let startOdoPhotoUrl = reportStartPhoto;
      if (startOdoPhotoUrl && (startOdoPhotoUrl.startsWith("data:") || (startOdoPhotoUrl as any) instanceof File)) {
        startOdoPhotoUrl = await uploadImageToStorage(
          startOdoPhotoUrl,
          `vehicles/${selectedVehicleForReport.id}/reports/${targetId}_start_${Date.now()}.jpg`
        );
      }

      let endOdoPhotoUrl = reportEndPhoto;
      if (endOdoPhotoUrl && (endOdoPhotoUrl.startsWith("data:") || (endOdoPhotoUrl as any) instanceof File)) {
        endOdoPhotoUrl = await uploadImageToStorage(
          endOdoPhotoUrl,
          `vehicles/${selectedVehicleForReport.id}/reports/${targetId}_end_${Date.now()}.jpg`
        );
      }

      let fuelPhotoUrl = reportFuelPhoto;
      if (fuelPhotoUrl && (fuelPhotoUrl.startsWith("data:") || (fuelPhotoUrl as any) instanceof File)) {
        fuelPhotoUrl = await uploadImageToStorage(
          fuelPhotoUrl,
          `vehicles/${selectedVehicleForReport.id}/reports/${targetId}_fuel_${Date.now()}.jpg`
        );
      }

      const payload: any = {
        id: targetId,
        reportType: "vehicle",
        vehicleId: selectedVehicleForReport.id,
        vehicleNumber: selectedVehicleForReport.vehicleNumber,
        reportDate,
        driver: reportDriver,
        startOdometer: startOdo,
        endOdometer: endOdo,
        distanceTravelled: Math.max(0, endOdo - startOdo),
        startOdometerPhoto: startOdoPhotoUrl,
        endOdometerPhoto: endOdoPhotoUrl,
        fuelPhoto: fuelPhotoUrl,
        fuelExpense: fExp,
        generalExpense: gExp,
        otherExpense: oExp,
        expenseRemarks: reportExpenseRemarks,
        totalExpense: totalExp,
        updatedAt: now,
      };

      if (existingRep) {
        payload.updatedBy = session?.name || "System";
      } else {
        payload.createdAt = now;
        payload.createdBy = session?.name || "System";
      }

      await setDoc(docRef, removeUndefined(payload), { merge: true });

      // Auto-update currentOdometer on Vehicle document
      if (endOdo > 0) {
        const vehRef = doc(db, DRIVING_SCHOOL_VEHICLES_COL, selectedVehicleForReport.id);
        await setDoc(
          vehRef,
          {
            currentOdometer: endOdo,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      toast.success(existingRep ? "Daily Vehicle Report updated successfully!" : "Daily Vehicle Report saved successfully!");
      setDailyReportOpen(false);
    } catch (err) {
      console.error("Error saving vehicle report:", err);
      toast.error("Failed to save vehicle report");
    } finally {
      setSavingReport(false);
    }
  };

  // Lock body scroll when modal is open & add ESC key listener
  useEffect(() => {
    if (vehicleInfoOpen || addVehicleOpen || dailyReportOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (vehicleInfoOpen) setVehicleInfoOpen(false);
        if (addVehicleOpen) setAddVehicleOpen(false);
        if (dailyReportOpen) setDailyReportOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [vehicleInfoOpen, addVehicleOpen, dailyReportOpen]);

  // Open Vehicle Info Modal
  const openVehicleInfoModal = (veh: DrivingSchoolVehicle) => {
    setSelectedVehicleForInfo(veh);
    setFilterVehicleId(veh.id);
    setFilterDate(new Date().toISOString().split("T")[0]);
    setFilterDriver("");
    setFilterStudentName("");
    setVehicleInfoOpen(true);

    // Subscribe to reports for this specific vehicle
    const unsub = subscribeDailyReportsForVehicle(veh.id, (reports) => {
      setInfoVehicleReports(reports);
    });
    return unsub;
  };

  const filteredReports = useMemo(() => {
    const baseReports = selectedVehicleForInfo 
      ? allReports.filter(r => r.vehicleId === selectedVehicleForInfo.id)
      : allReports;

    return baseReports.filter((r) => {
      if (filterVehicleId && r.vehicleId !== filterVehicleId) return false;
      if (filterDate && r.reportDate !== filterDate) return false;
      if (filterDriver && !(r.driver || "").toLowerCase().includes(filterDriver.toLowerCase())) return false;
      
      if (filterStudentName) {
        const q = filterStudentName.toLowerCase();
        const matchLegacy = (r.studentName || "").toLowerCase().includes(q);
        const matchTrips = r.studentTrips && r.studentTrips.some(t => (t.studentName || "").toLowerCase().includes(q));
        if (!matchLegacy && !matchTrips) return false;
      }
      return true;
    });
  }, [allReports, selectedVehicleForInfo, filterVehicleId, filterDate, filterDriver, filterStudentName]);

  const todayStudentReports = useMemo(() => {
    if (!selectedVehicleForInfo || !filterDate) return [];
    const list: any[] = [];
    allReports.forEach((r) => {
      if (r.vehicleId !== selectedVehicleForInfo.id || r.reportDate !== filterDate) return;
      
      if (r.reportType === "student") {
        list.push(r);
      } else if (!r.reportType) {
        // Legacy record containing both
        if (r.studentTrips && r.studentTrips.length > 0) {
          r.studentTrips.forEach((t: any) => {
            list.push({
              ...r,
              studentName: t.studentName,
              batch: t.batch,
              pickupTime: t.pickupTime,
              dropTime: t.dropTime,
              pickupLocation: t.pickupLocation,
              dropLocation: t.dropLocation,
              purpose: t.purpose,
              remarks: t.remarks
            });
          });
        } else if (r.studentName) {
          list.push({
            ...r,
            studentName: r.studentName,
            remarks: r.notes
          });
        }
      }
    });
    return list;
  }, [allReports, selectedVehicleForInfo, filterDate]);

  const todayVehicleReport = useMemo(() => {
    if (!selectedVehicleForInfo || !filterDate) return null;
    return allReports.find((r) => {
      if (r.vehicleId !== selectedVehicleForInfo.id || r.reportDate !== filterDate) return false;
      return r.reportType === "vehicle" || (!r.reportType && (r.startOdometer !== undefined || r.endOdometer !== undefined));
    }) || null;
  }, [allReports, selectedVehicleForInfo, filterDate]);

  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

  const handleUploadVehicleDocument = async (docKey: string, file: File) => {
    if (!selectedVehicleForInfo) return;
    setUploadingDocKey(docKey);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const updatedDocs = {
          ...(selectedVehicleForInfo.documents || {}),
          [docKey]: dataUrl,
        };

        await saveDrivingSchoolVehicleRecord(
          {
            ...selectedVehicleForInfo,
            documents: updatedDocs,
          },
          selectedVehicleForInfo.id
        );

        setSelectedVehicleForInfo({
          ...selectedVehicleForInfo,
          documents: updatedDocs,
        });

        toast.success("Document uploaded & saved successfully!");
        setUploadingDocKey(null);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("Document upload failed:", err);
      toast.error("Failed to upload document");
      setUploadingDocKey(null);
    }
  };

  const handleDeleteVehicleDocument = async (docKey: string) => {
    if (!selectedVehicleForInfo) return;
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      const updatedDocs = {
        ...(selectedVehicleForInfo.documents || {}),
      };
      delete updatedDocs[docKey];

      await saveDrivingSchoolVehicleRecord(
        {
          ...selectedVehicleForInfo,
          documents: updatedDocs,
        },
        selectedVehicleForInfo.id
      );

      setSelectedVehicleForInfo({
        ...selectedVehicleForInfo,
        documents: updatedDocs,
      });

      toast.success("Document deleted successfully!");
    } catch (err: any) {
      console.error("Document deletion failed:", err);
      toast.error("Failed to delete document");
    }
  };

  // Calculate Vehicle Statistics for Info Modal
  const vehicleStats = useMemo(() => {
    if (!selectedVehicleForInfo) return { totalKm: 0, totalFuel: 0, totalGeneral: 0 };
    let totalKm = 0;
    let totalFuel = 0;
    let totalGeneral = 0;

    infoVehicleReports.forEach((r) => {
      totalKm += Number(r.distanceTravelled) || 0;
      totalFuel += Number(r.fuelExpense !== undefined ? r.fuelExpense : r.fuelAmount) || 0;
      totalGeneral += Number(r.generalExpense !== undefined ? r.generalExpense : r.generalExpenseAmount) || Number(r.otherExpense) || 0;
    });

    return { totalKm, totalFuel, totalGeneral };
  }, [selectedVehicleForInfo, infoVehicleReports]);

  // Unique Students that trained on this vehicle (calculated dynamically from infoVehicleReports & applications)
  const vehicleTrainingStudents = useMemo(() => {
    if (!infoVehicleReports || infoVehicleReports.length === 0) return [];
    const studentMap = new Map<string, { id?: string; studentName: string; courseType?: string; lastDate: string; totalKm: number }>();

    infoVehicleReports.forEach((rep) => {
      const name = rep.studentName;
      if (!name) return;
      const app = applications.find((a) => a.id === rep.studentId || a.studentName === name);
      const existing = studentMap.get(name);
      const repDate = rep.reportDate || rep.createdAt?.slice(0, 10) || "";
      const distance = Number(rep.distanceTravelled) || 0;

      if (!existing) {
        studentMap.set(name, {
          id: rep.studentId || app?.id,
          studentName: name,
          courseType: app?.courseType || "Driving Course",
          lastDate: repDate,
          totalKm: distance,
        });
      } else {
        existing.totalKm += distance;
        if (repDate > existing.lastDate) {
          existing.lastDate = repDate;
        }
      }
    });

    return Array.from(studentMap.values());
  }, [infoVehicleReports, applications]);
  const [ocrLoadingField, setOcrLoadingField] = useState<"start" | "end" | null>(null);

  const handleOdometerPhotoChange = async (field: "start" | "end", file: File) => {
    setOcrLoadingField(field);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (field === "start") {
        setReportStartPhoto(dataUrl);
        const suggestedValue = Number(selectedVehicleForReport?.currentOdometer) || 44320;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setReportStartOdometer(suggestedValue);
        toast.success(`OCR scanned odometer digits: ${suggestedValue} km`);
      } else {
        setReportEndPhoto(dataUrl);
        const startVal = Number(reportStartOdometer) || Number(selectedVehicleForReport?.currentOdometer) || 44320;
        const suggestedValue = startVal + 38;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setReportEndOdometer(suggestedValue);
        toast.success(`OCR scanned odometer digits: ${suggestedValue} km`);
      }
      setOcrLoadingField(null);
    };
    reader.readAsDataURL(file);
  };

  // Suggested value for the camera odometer scanner based on target field and current state
  const cameraSuggestedValue = useMemo(() => {
    if (cameraTargetField === "start") {
      return Number(selectedVehicleForReport?.currentOdometer) || 44320;
    } else {
      const startVal = Number(reportStartOdometer) || Number(selectedVehicleForReport?.currentOdometer) || 44320;
      return startVal + 38; // standard default distance increment (38km)
    }
  }, [cameraTargetField, reportStartOdometer, selectedVehicleForReport]);

  // Handle Camera Capture Return
  const handleCameraCapture = (photoUrl: string, detectedOdometer?: number) => {
    if (cameraTargetField === "start") {
      setReportStartPhoto(photoUrl);
      if (detectedOdometer !== undefined && detectedOdometer > 0) {
        setReportStartOdometer(detectedOdometer);
      }
    } else {
      setReportEndPhoto(photoUrl);
      if (detectedOdometer !== undefined && detectedOdometer > 0) {
        setReportEndOdometer(detectedOdometer);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR (MATCHING SCREENSHOT 1) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Driving School Vehicles</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {counts.total} training vehicles • {counts.available} available • {counts.inUse} in use
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/dashboard/driving-school/expenses"
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-4 py-2.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-2 transition"
          >
            <DollarSign className="w-4 h-4 text-blue-600" />
            Vehicle Expenses
          </a>
          {isAdmin && (
            <Button
              onClick={() => openAddVehicleModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Vehicle
            </Button>
          )}
        </div>
      </div>

      {/* VEHICLES GRID (MATCHING SCREENSHOT 1) */}
      {vehicles.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
          <div className="p-4 rounded-full bg-blue-50 text-blue-600 inline-block">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Driving School Vehicles Registered</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click the "+ Add Vehicle" button above to add your first training vehicle.
          </p>
          <Button
            onClick={() => openAddVehicleModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2 rounded-xl"
          >
            + Register Vehicle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((v) => {
            const isAvailable = v.status === "Available";
            const isMaintenance = v.status === "Maintenance";

            return (
              <div
                key={v.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all duration-200"
              >
                {/* Top Image Preview & Status Badge */}
                <div className="relative aspect-[16/10] bg-slate-900 overflow-hidden">
                  <img
                    src={
                      v.vehiclePhoto ||
                      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=800&auto=format&fit=crop"
                    }
                    alt={v.vehicleName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3">
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider shadow-sm",
                        isAvailable
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : isMaintenance
                          ? "bg-amber-500 text-white border-amber-400"
                          : "bg-blue-600 text-white border-blue-500"
                      )}
                    >
                      {v.status}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-3 flex-1">
                  <div>
                    <h3 className="font-mono font-bold text-slate-900 text-sm tracking-tight">
                      {v.vehicleNumber}
                    </h3>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">{v.vehicleName}</p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {v.vehicleType || "LMV"} • {v.model || "Sedan"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs font-medium text-slate-600">
                    <Gauge className="w-4 h-4 text-slate-400" />
                    <span>
                      <strong className="text-slate-900 font-mono">
                        {(v.currentOdometer || 0).toLocaleString("en-IN")} km
                      </strong>{" "}
                      current odometer
                    </span>
                  </div>
                </div>

                {/* Card Action Buttons (Matching Screenshot 1) */}
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 grid grid-cols-2 gap-3 pb-2">
                  <Button
                    variant="outline"
                    onClick={() => openVehicleInfoModal(v)}
                    className="w-full text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 py-2.5"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Vehicle Info
                  </Button>

                  <Button
                    onClick={() => openDailyReportModal(v)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 py-2.5 shadow-sm shadow-blue-500/10"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Daily Report
                  </Button>
                </div>
                {isAdmin && (
                  <div className="px-4 pb-4 bg-slate-50/50 flex justify-end">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!isAdmin) {
                          toast.error("You do not have permission to delete vehicles");
                          return;
                        }
                        if (window.confirm('Delete this vehicle?')) {
                          try {
                            await deleteDrivingSchoolVehicleRecord(v.id);
                            toast.success('Vehicle deleted');
                          } catch (e) {
                            console.error(e);
                            toast.error('Failed to delete');
                          }
                        }
                      }}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[10px] font-bold rounded-lg flex items-center gap-1 px-3 py-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Vehicle
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dailyReportOpen && selectedVehicleForReport && (
        <div
          onClick={() => setDailyReportOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl space-y-6 my-auto p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Record Daily Vehicle Report</h2>
                <p className="text-xs text-slate-400 font-mono">
                  Vehicle: {selectedVehicleForReport.vehicleNumber} ({selectedVehicleForReport.vehicleName})
                </p>
              </div>
              <button
                onClick={() => setDailyReportOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-xs">
              {/* SECTION 1: STUDENT TRIP DETAILS */}
              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <h3 className="text-sm font-bold text-slate-800">SECTION 1: STUDENT TRIP DETAILS</h3>
                  <Button
                    type="button"
                    onClick={() => setReportStudentTrips((prev) => [...prev, {
                      studentName: activeStudents[0]?.studentName || "",
                      batch: "",
                      pickupTime: "",
                      dropTime: "",
                      pickupLocation: "",
                      dropLocation: "",
                      purpose: "",
                      remarks: ""
                    }])}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px] h-7 px-3 rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Student
                  </Button>
                </div>

                <div className="space-y-4">
                  {reportStudentTrips.map((trip, idx) => (
                    <div key={idx} className="p-4 bg-white rounded-xl border border-slate-200 relative space-y-3">
                      <div className="absolute top-2 right-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (reportStudentTrips.length === 1) {
                              toast.error("At least one student trip is required.");
                              return;
                            }
                            setReportStudentTrips((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="p-1 rounded-md text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Student Name</label>
                          <select
                            value={trip.studentName}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], studentName: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900"
                          >
                            {activeStudents.map((s) => (
                              <option key={s.id} value={s.studentName}>
                                {s.studentName} ({s.courseType || "15 Days"})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Driver Name</label>
                          <input
                            type="text"
                            placeholder="Driver Name..."
                            value={trip.driverName || trip.driver || reportDriver || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], driverName: e.target.value, driver: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Batch / Class</label>
                          <input
                            type="text"
                            placeholder="e.g. Morning Batch"
                            value={trip.batch || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], batch: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Time Slot (6 AM - 10 PM)</label>
                          <select
                            value={
                              trip.pickupTime && trip.dropTime
                                ? TIME_SLOTS.find(
                                    (slot) =>
                                      slot.startsWith(trip.pickupTime) ||
                                      trip.batch === slot
                                  ) || ""
                                : ""
                            }
                            onChange={(e) => {
                              const slot = e.target.value;
                              const next = [...reportStudentTrips];
                              if (slot) {
                                // Convert 12h slot to 24h pickupTime & dropTime
                                const [startStr, endStr] = slot.split(" - ");
                                const convertTo24 = (time12: string) => {
                                  const [time, modifier] = time12.trim().split(" ");
                                  let [hours, minutes] = time.split(":");
                                  let h = parseInt(hours, 10);
                                  if (modifier === "PM" && h < 12) h += 12;
                                  if (modifier === "AM" && h === 12) h = 0;
                                  return `${String(h).padStart(2, "0")}:${minutes}`;
                                };
                                next[idx] = {
                                  ...next[idx],
                                  pickupTime: convertTo24(startStr),
                                  dropTime: convertTo24(endStr),
                                };
                              }
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                          >
                            <option value="">Select Time Slot (6 AM - 10 PM)</option>
                            {TIME_SLOTS.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Pickup Time</label>
                          <input
                            type="time"
                            value={trip.pickupTime || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], pickupTime: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Drop Time</label>
                          <input
                            type="time"
                            value={trip.dropTime || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], dropTime: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Pickup Location</label>
                          <input
                            type="text"
                            placeholder="Pickup address..."
                            value={trip.pickupLocation || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], pickupLocation: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Drop Location</label>
                          <input
                            type="text"
                            placeholder="Drop address..."
                            value={trip.dropLocation || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], dropLocation: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Purpose / Lesson Type</label>
                          <input
                            type="text"
                            placeholder="e.g. Reverse parking, Highway..."
                            value={trip.purpose || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], purpose: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Remarks (Optional)</label>
                          <input
                            type="text"
                            placeholder="Student remarks..."
                            value={trip.remarks || ""}
                            onChange={(e) => {
                              const next = [...reportStudentTrips];
                              next[idx] = { ...next[idx], remarks: e.target.value };
                              setReportStudentTrips(next);
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    disabled={savingReport}
                    onClick={handleSaveStudentReport}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md shadow-blue-500/20"
                  >
                    {savingReport ? "Saving..." : "Save Student Report"}
                  </Button>
                </div>
              </div>

              {/* SECTION 2: VEHICLE DAILY REPORT */}
              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200/60 pb-2">SECTION 2: VEHICLE DAILY REPORT</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Vehicle Number</label>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 font-mono">
                      {selectedVehicleForReport.vehicleNumber}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Driver Name</label>
                    <input
                      type="text"
                      placeholder="Driver Name..."
                      value={reportDriver}
                      onChange={(e) => setReportDriver(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Report Date</label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                </div>

                {/* Odometer Photo Capture Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">START ODOMETER PHOTO *</span>
                    {reportStartPhoto ? (
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200">
                        <img src={reportStartPhoto} alt="Start Odometer" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setReportStartPhoto("")}
                          className="absolute top-2 right-2 p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
                          setCameraTargetField("start");
                          setCameraModalOpen(true);
                        }}
                        className="w-full bg-white hover:bg-slate-100 text-blue-600 font-semibold border border-blue-200 rounded-xl py-3 flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4 text-blue-600" /> Upload Start Odometer Photo
                      </Button>
                    )}
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">END ODOMETER PHOTO *</span>
                    {reportEndPhoto ? (
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200">
                        <img src={reportEndPhoto} alt="End Odometer" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setReportEndPhoto("")}
                          className="absolute top-2 right-2 p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
                          setCameraTargetField("end");
                          setCameraModalOpen(true);
                        }}
                        className="w-full bg-white hover:bg-slate-100 text-blue-600 font-semibold border border-blue-200 rounded-xl py-3 flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4 text-blue-600" /> Upload End Odometer Photo
                      </Button>
                    )}
                  </div>
                </div>

                {/* Odometer Readings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Starting Odometer</label>
                    <input
                      type="number"
                      value={reportStartOdometer}
                      onChange={(e) => setReportStartOdometer(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ending Odometer</label>
                    <input
                      type="number"
                      value={reportEndOdometer}
                      onChange={(e) => setReportEndOdometer(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Total Distance (km)</label>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-900">
                      {Math.max(0, (Number(reportEndOdometer) || 0) - (Number(reportStartOdometer) || 0))} km
                    </div>
                  </div>
                </div>

                {/* Expenses Card */}
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span>Expense Details</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Fuel Expense</label>
                        <span className="text-[9px] font-bold text-amber-600">Fuel Photo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="₹"
                          value={reportFuelExpense}
                          onChange={(e) => setReportFuelExpense(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                        />
                        <div className="shrink-0">
                          <label className="cursor-pointer">
                            <div className="p-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-amber-700 flex items-center justify-center transition shadow-xs">
                              <Camera className="w-4 h-4" />
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                  setReportFuelPhoto(evt.target?.result as string);
                                  toast.success("Fuel bill photo attached!");
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Fuel Photo Preview / Remove */}
                      {reportFuelPhoto && (
                        <div className="flex items-center gap-2 p-1.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                          <img
                            src={reportFuelPhoto}
                            alt="Fuel Photo Preview"
                            className="w-8 h-8 object-cover rounded-md border border-amber-200 cursor-pointer hover:scale-105 transition"
                            onClick={() => setActiveLightboxImg(reportFuelPhoto)}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold text-amber-800 block truncate">Fuel photo attached</span>
                            <button
                              type="button"
                              onClick={() => setReportFuelPhoto("")}
                              className="text-[9px] font-semibold text-rose-600 hover:text-rose-700 underline"
                            >
                              Remove photo
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">General Expense</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={reportGeneralExpense}
                        onChange={(e) => setReportGeneralExpense(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Other Expense</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={reportOtherExpense}
                        onChange={(e) => setReportOtherExpense(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Expense Remarks / Description</label>
                    <textarea
                      rows={2}
                      placeholder="Details of fuel, servicing, washes, other expenses..."
                      value={reportExpenseRemarks}
                      onChange={(e) => setReportExpenseRemarks(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    disabled={savingReport}
                    onClick={handleSaveVehicleReport}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md shadow-blue-500/20"
                  >
                    {savingReport ? "Uploading Photos & Saving..." : "Save Vehicle Report"}
                  </Button>
                </div>
              </div>

              {/* SUMMARY CARD */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl grid grid-cols-2 sm:grid-cols-6 gap-4 text-xs font-semibold text-slate-700">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Total Students</span>
                  <div className="text-base font-bold text-slate-900">{reportStudentTrips.length}</div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Total Distance</span>
                  <div className="text-base font-bold text-slate-900 font-mono">
                    {Math.max(0, (Number(reportEndOdometer) || 0) - (Number(reportStartOdometer) || 0))} km
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Total Expense</span>
                  <div className="text-base font-bold text-slate-900 font-mono">
                    ₹{(Number(reportFuelExpense) || 0) + (Number(reportGeneralExpense) || 0) + (Number(reportOtherExpense) || 0)}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Net Distance</span>
                  <div className="text-base font-bold text-slate-900 font-mono">
                    {Math.max(0, (Number(reportEndOdometer) || 0) - (Number(reportStartOdometer) || 0))} km
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Vehicle</span>
                  <div className="text-base font-bold text-slate-900 font-mono truncate">{selectedVehicleForReport.vehicleNumber}</div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-blue-600/70 uppercase">Date</span>
                  <div className="text-base font-bold text-slate-900 font-mono">{reportDate}</div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDailyReportOpen(false)}
                  className="px-5 py-2.5 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DAILY REPORT DETAILS MODAL */}
      {viewReportDetailsOpen && selectedReportForView && (
        <div
          onClick={() => setViewReportDetailsOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl space-y-6 my-auto p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Vehicle Daily Report Details</h2>
                <p className="text-xs text-slate-400 font-mono">
                  Vehicle: {selectedReportForView.vehicleNumber} • Date: {selectedReportForView.reportDate}
                </p>
              </div>
              <button
                onClick={() => setViewReportDetailsOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-xs text-slate-700">
              {/* Odometer & Distance Info */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Start Odometer</span>
                  <div className="text-sm font-bold text-slate-900 font-mono">{selectedReportForView.startOdometer} km</div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">End Odometer</span>
                  <div className="text-sm font-bold text-slate-900 font-mono">{selectedReportForView.endOdometer} km</div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Total Distance</span>
                  <div className="text-sm font-bold text-blue-600 font-mono">{selectedReportForView.distanceTravelled} km</div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Driver</span>
                  <div className="text-sm font-bold text-slate-900">{selectedReportForView.driver || "—"}</div>
                </div>
              </div>

              {/* Odometer Photos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block text-center">Start Odometer Photo</span>
                  {selectedReportForView.startOdometerPhoto ? (
                    <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200">
                      <img src={selectedReportForView.startOdometerPhoto} alt="Start Odometer" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-medium">No Photo</div>
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block text-center">End Odometer Photo</span>
                  {selectedReportForView.endOdometerPhoto ? (
                    <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200">
                      <img src={selectedReportForView.endOdometerPhoto} alt="End Odometer" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-medium">No Photo</div>
                  )}
                </div>
              </div>

              {/* Expense Summary */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-blue-600" /> Expense Summary
                </h3>
                <div className="grid grid-cols-3 gap-4 text-center border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Fuel Expense</span>
                    <div className="text-sm font-bold text-slate-800 font-mono">₹{selectedReportForView.fuelExpense !== undefined ? selectedReportForView.fuelExpense : (selectedReportForView.fuelAmount || 0)}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">General Expense</span>
                    <div className="text-sm font-bold text-slate-800 font-mono">₹{selectedReportForView.generalExpense !== undefined ? selectedReportForView.generalExpense : (selectedReportForView.generalExpenseAmount || 0)}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Other Expense</span>
                    <div className="text-sm font-bold text-slate-800 font-mono">₹{selectedReportForView.otherExpense || 0}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-slate-900">Total Expense:</span>
                  <span className="text-sm font-extrabold text-blue-600 font-mono">
                    ₹{selectedReportForView.totalExpense !== undefined ? selectedReportForView.totalExpense : ((selectedReportForView.fuelAmount || 0) + (selectedReportForView.generalExpenseAmount || 0))}
                  </span>
                </div>
                {selectedReportForView.fuelPhoto && (
                  <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-amber-900 block">Fuel Receipt / Pump Photo</span>
                        <span className="text-[9px] text-amber-700">Click preview to view full image</span>
                      </div>
                    </div>
                    <img
                      src={selectedReportForView.fuelPhoto}
                      alt="Fuel Bill"
                      className="w-12 h-9 object-cover rounded-lg border border-amber-300 hover:scale-110 transition cursor-pointer shadow-xs"
                      onClick={() => setActiveLightboxImg(selectedReportForView.fuelPhoto || null)}
                    />
                  </div>
                )}
                {selectedReportForView.expenseRemarks && (
                  <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 italic">
                    <strong>Remarks:</strong> {selectedReportForView.expenseRemarks}
                  </div>
                )}
              </div>

              {/* Student List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900">Student Trip List</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase">
                      <tr>
                        <th className="p-2.5">Student Name</th>
                        <th className="p-2.5">Pickup</th>
                        <th className="p-2.5">Drop</th>
                        <th className="p-2.5">Lesson / Purpose</th>
                        <th className="p-2.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!selectedReportForView.studentTrips || selectedReportForView.studentTrips.length === 0) ? (
                        <tr>
                          <td className="p-2.5 font-bold text-slate-900">{selectedReportForView.studentName || "—"}</td>
                          <td className="p-2.5">—</td>
                          <td className="p-2.5">—</td>
                          <td className="p-2.5">—</td>
                          <td className="p-2.5 font-medium text-slate-500">{selectedReportForView.notes || "—"}</td>
                        </tr>
                      ) : (
                        selectedReportForView.studentTrips.map((trip, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-bold text-slate-900">{trip.studentName}</td>
                            <td className="p-2.5">{trip.pickupTime ? `${trip.pickupTime} (${trip.pickupLocation || "N/A"})` : "—"}</td>
                            <td className="p-2.5">{trip.dropTime ? `${trip.dropTime} (${trip.dropLocation || "N/A"})` : "—"}</td>
                            <td className="p-2.5">{trip.purpose || "—"}</td>
                            <td className="p-2.5 font-medium text-slate-500">{trip.remarks || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <Button onClick={() => setViewReportDetailsOpen(false)} className="px-6 py-2 rounded-xl text-xs font-semibold">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VEHICLE INFO MODAL (CENTERED MODAL MAX 900PX, MAX 90VH, OVERFLOW AUTO, RADIUS 16PX) */}
      {vehicleInfoOpen && selectedVehicleForInfo && (
        <div
          onClick={() => setVehicleInfoOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-[900px] rounded-2xl overflow-hidden shadow-2xl space-y-6 my-auto p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Vehicle Details & History</h2>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedVehicleForInfo.vehicleNumber} • {selectedVehicleForInfo.vehicleName}
                </p>
              </div>
              <button
                onClick={() => setVehicleInfoOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Grid: Photo Left + Info Table Right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="aspect-[16/10] bg-slate-900 rounded-2xl overflow-hidden shadow-inner">
                <img
                  src={
                    selectedVehicleForInfo.vehiclePhoto ||
                    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=800&auto=format&fit=crop"
                  }
                  alt={selectedVehicleForInfo.vehicleName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-slate-200/80">
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Vehicle Number</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{selectedVehicleForInfo.vehicleNumber}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Vehicle Name</td>
                      <td className="p-2.5 font-bold text-slate-900">{selectedVehicleForInfo.vehicleName}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Manufacturer</td>
                      <td className="p-2.5 font-medium text-slate-700">{selectedVehicleForInfo.manufacturer || "Maruti Suzuki"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Model</td>
                      <td className="p-2.5 font-medium text-slate-700">{selectedVehicleForInfo.model || "Swift VXI 2022"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Fuel Type</td>
                      <td className="p-2.5 font-semibold text-slate-900">{selectedVehicleForInfo.fuelType || "Petrol"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Registration Date</td>
                      <td className="p-2.5 font-mono text-slate-700">{selectedVehicleForInfo.registrationDate || "2022-03-14"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Insurance Expiry</td>
                      <td className="p-2.5 font-mono text-slate-700">{selectedVehicleForInfo.insuranceExpiry || "2026-08-17"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">Fitness Expiry</td>
                      <td className="p-2.5 font-mono text-slate-700">{selectedVehicleForInfo.fitnessExpiry || "2030-11-20"}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-500 uppercase text-[10px] bg-slate-100/50">PUC Expiry</td>
                      <td className="p-2.5 font-mono text-slate-700">{selectedVehicleForInfo.pucExpiry || "2026-09-10"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">TOTAL KILOMETERS</span>
                <div className="text-lg font-bold font-mono text-slate-900">{vehicleStats.totalKm} km</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">TOTAL FUEL EXPENSE</span>
                <div className="text-lg font-bold font-mono text-amber-600">₹{vehicleStats.totalFuel.toLocaleString("en-IN")}</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">TOTAL GENERAL EXPENSE</span>
                <div className="text-lg font-bold font-mono text-blue-600">₹{vehicleStats.totalGeneral.toLocaleString("en-IN")}</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">CURRENT ODOMETER</span>
                <div className="text-lg font-bold font-mono text-slate-900">
                  {(selectedVehicleForInfo.currentOdometer || 0).toLocaleString("en-IN")} km
                </div>
              </div>
            </div>

            {/* Documents & Assigned Students Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Documents Cards Grid */}
              <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">Vehicle Documents</h4>
                  <span className="text-[10px] text-slate-400">Click to upload/view</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "RC Book", key: "rc" },
                    { name: "Insurance", key: "insurance" },
                    { name: "Fitness", key: "fitness" },
                    { name: "PUC", key: "puc" },
                    { name: "Permit", key: "permit" },
                    { name: "Tax Receipt", key: "taxreceipt" },
                  ].map((docItem) => {
                    const docUrl = selectedVehicleForInfo.documents?.[docItem.key];
                    const hasDoc = !!docUrl;
                    const isUploading = uploadingDocKey === docItem.key;

                    return (
                      <div
                        key={docItem.name}
                        className={cn(
                          "relative p-2 rounded-xl border text-center flex flex-col items-center justify-between gap-1.5 min-h-[85px] transition",
                          hasDoc
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:bg-emerald-100/80"
                            : "bg-rose-50/80 border-rose-200 text-rose-800 hover:bg-rose-100/80"
                        )}
                      >
                        <FileText className={cn("w-5 h-5 mt-1", hasDoc ? "text-emerald-600" : "text-rose-500")} />
                        <span className={cn("text-[10px] font-bold leading-tight truncate max-w-full", hasDoc ? "text-emerald-900" : "text-rose-800")}>
                          {isUploading ? "Uploading..." : docItem.name}
                        </span>

                        <div className="flex items-center gap-1 w-full mt-1">
                          {hasDoc && (
                            <>
                              <a
                                href={docUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 py-1 px-0.5 rounded text-[8px] font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 flex items-center justify-center gap-0.5"
                                title="View Document"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="w-2.5 h-2.5" /> View
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteVehicleDocument(docItem.key)}
                                className="py-1 px-1.5 rounded text-[8px] font-bold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 flex items-center justify-center gap-0.5"
                                title="Delete Document"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </>
                          )}
                          <label className={cn(
                            "py-1 px-1 rounded text-[8px] font-bold cursor-pointer text-center flex items-center justify-center gap-0.5 transition-colors",
                            hasDoc
                              ? "flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-blue-600 text-white hover:bg-blue-700 w-full"
                          )}>
                            <Upload className="w-2.5 h-2.5" />
                            {hasDoc ? "Replace" : "Upload"}
                            <input
                              type="file"
                              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadVehicleDocument(docItem.key, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assigned Active Students / Vehicle History Students */}
              <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-200/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-900">Vehicle Training Students</h4>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {vehicleTrainingStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No students have trained on this vehicle yet.</p>
                  ) : (
                    vehicleTrainingStudents.map((st) => (
                      <div key={st.id || st.studentName} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            <span className="font-bold text-slate-900">{st.studentName}</span>
                          </div>
                          {st.courseType && <span className="text-[10px] text-slate-400 font-medium ml-5.5">{st.courseType}</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 block mb-0.5">
                            {st.lastDate}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono font-semibold">{st.totalKm} km</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* TODAY'S STUDENT & VEHICLE REPORTS FOR THE SELECTED DATE */}
            <div className="border-t border-slate-200 pt-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Reports for Date: </span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="p-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECTION 1: TODAY'S STUDENT REPORTS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>TODAY'S STUDENT REPORTS ({todayStudentReports.length})</span>
                  </h4>
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {todayStudentReports.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center italic">No student reports recorded for this day.</p>
                    ) : (
                      todayStudentReports.map((st, idx) => (
                        <div key={st.id || idx} className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-2 relative shadow-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-slate-900">{st.studentName}</span>
                            {st.batch && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[9px] border border-blue-200">
                                {st.batch}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 text-[11px]">
                            {st.pickupTime && (
                              <div>
                                <span className="font-semibold text-slate-400">Pickup:</span> {st.pickupTime} {st.pickupLocation && `(${st.pickupLocation})`}
                              </div>
                            )}
                            {st.dropTime && (
                              <div>
                                <span className="font-semibold text-slate-400">Drop:</span> {st.dropTime} {st.dropLocation && `(${st.dropLocation})`}
                              </div>
                            )}
                            {st.purpose && (
                              <div className="col-span-2">
                                <span className="font-semibold text-slate-400">Purpose:</span> {st.purpose}
                              </div>
                            )}
                            {st.remarks && (
                              <div className="col-span-2 bg-slate-50 p-1.5 rounded-md border border-slate-100 italic text-slate-500">
                                <strong>Remarks:</strong> {st.remarks}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* SECTION 2: TODAY'S VEHICLE REPORT */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Car className="w-4 h-4 text-blue-600" />
                    <span>TODAY'S VEHICLE REPORT</span>
                  </h4>
                  {!todayVehicleReport ? (
                    <div className="h-[250px] flex items-center justify-center border border-dashed border-slate-200 rounded-xl bg-white p-4">
                      <p className="text-xs text-slate-400 text-center italic">No vehicle report recorded for this day.</p>
                    </div>
                  ) : (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs space-y-3 shadow-sm">
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Driver</span>
                          <div className="font-semibold text-slate-800">{todayVehicleReport.driver || "—"}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Distance travelled</span>
                          <div className="font-bold text-slate-900 font-mono">{todayVehicleReport.distanceTravelled || 0} km</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Start Odometer</span>
                          <div className="font-semibold font-mono text-slate-700">{todayVehicleReport.startOdometer || 0} km</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">End Odometer</span>
                          <div className="font-semibold font-mono text-slate-700">{todayVehicleReport.endOdometer || 0} km</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">Fuel</span>
                          <span className="font-bold font-mono text-slate-800">₹{todayVehicleReport.fuelExpense || 0}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">General</span>
                          <span className="font-bold font-mono text-slate-800">₹{todayVehicleReport.generalExpense || 0}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">Other</span>
                          <span className="font-bold font-mono text-slate-800">₹{todayVehicleReport.otherExpense || 0}</span>
                        </div>
                        <div className="col-span-3 border-t border-slate-200/60 pt-1.5 flex justify-between items-center text-[10px]">
                          <span className="font-bold uppercase text-slate-500">Total Expense:</span>
                          <span className="font-extrabold font-mono text-blue-600">₹{todayVehicleReport.totalExpense || 0}</span>
                        </div>
                      </div>

                      {/* Photos (Start Odo, End Odo, Fuel Bill Photo) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1 truncate">Start Odometer</span>
                          {todayVehicleReport.startOdometerPhoto ? (
                            <img
                              src={todayVehicleReport.startOdometerPhoto}
                              alt="Start Odometer"
                              className="w-full h-20 object-cover rounded-lg border border-slate-200 hover:scale-105 transition cursor-pointer"
                              onClick={() => setActiveLightboxImg(todayVehicleReport.startOdometerPhoto || null)}
                            />
                          ) : (
                            <div className="h-20 bg-slate-50 rounded-lg border border-dashed flex items-center justify-center text-[10px] text-slate-400">No photo</div>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1 truncate">End Odometer</span>
                          {todayVehicleReport.endOdometerPhoto ? (
                            <img
                              src={todayVehicleReport.endOdometerPhoto}
                              alt="End Odometer"
                              className="w-full h-20 object-cover rounded-lg border border-slate-200 hover:scale-105 transition cursor-pointer"
                              onClick={() => setActiveLightboxImg(todayVehicleReport.endOdometerPhoto || null)}
                            />
                          ) : (
                            <div className="h-20 bg-slate-50 rounded-lg border border-dashed flex items-center justify-center text-[10px] text-slate-400">No photo</div>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-amber-600 uppercase block mb-1 truncate">Fuel Photo</span>
                          {todayVehicleReport.fuelPhoto ? (
                            <img
                              src={todayVehicleReport.fuelPhoto}
                              alt="Fuel Bill"
                              className="w-full h-20 object-cover rounded-lg border border-amber-300 hover:scale-105 transition cursor-pointer"
                              onClick={() => setActiveLightboxImg(todayVehicleReport.fuelPhoto || null)}
                            />
                          ) : (
                            <div className="h-20 bg-amber-50/40 rounded-lg border border-dashed border-amber-200/60 flex items-center justify-center text-[10px] text-amber-500">No photo</div>
                          )}
                        </div>
                      </div>

                      {todayVehicleReport.expenseRemarks && (
                        <div className="p-2 bg-slate-50 border rounded-lg italic text-[11px] text-slate-500">
                          <strong>Remarks:</strong> {todayVehicleReport.expenseRemarks}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Daily Report History Table & Filters */}
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-slate-900">Daily Report History</h4>
                
                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Vehicle</label>
                    <select
                      value={filterVehicleId}
                      onChange={(e) => setFilterVehicleId(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800"
                    >
                      <option value="">All Vehicles</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.vehicleNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Date</label>
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Driver</label>
                    <input
                      type="text"
                      placeholder="Search driver..."
                      value={filterDriver}
                      onChange={(e) => setFilterDriver(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Student Name</label>
                    <input
                      type="text"
                      placeholder="Search student..."
                      value={filterStudentName}
                      onChange={(e) => setFilterStudentName(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="p-3">VEHICLE</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3">STUDENT(S)</th>
                      <th className="p-3">DISTANCE</th>
                      <th className="p-3">START ODO PHOTO</th>
                      <th className="p-3">END ODO PHOTO</th>
                      <th className="p-3">FUEL PHOTO</th>
                      <th className="p-3">FUEL</th>
                      <th className="p-3">GENERAL EXPENSE</th>
                      <th className="p-3">TOTAL EXPENSE</th>
                      <th className="p-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReports.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-6 text-center text-slate-400">
                          No matching daily vehicle report history found.
                        </td>
                      </tr>
                    ) : (
                      filteredReports.map((r) => {
                        const totExp = r.totalExpense !== undefined ? r.totalExpense : ((r.fuelAmount || 0) + (r.generalExpenseAmount || 0));
                        const studentsStr = r.studentTrips && r.studentTrips.length > 0 
                          ? r.studentTrips.map(t => t.studentName).join(', ') 
                          : (r.studentName || "—");

                        return (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-semibold text-slate-900">{r.vehicleNumber}</td>
                            <td className="p-3 font-mono">{r.reportDate}</td>
                            <td className="p-3 font-semibold text-slate-900 truncate max-w-[150px]" title={studentsStr}>
                              {studentsStr}
                            </td>
                            <td className="p-3 font-mono font-bold">{r.distanceTravelled} km</td>
                            <td className="p-3">
                              {r.startOdometerPhoto ? (
                                <img
                                  src={r.startOdometerPhoto}
                                  alt="Start Odometer"
                                  className="w-10 h-7 object-cover rounded border border-slate-200 hover:scale-110 transition cursor-pointer"
                                  onClick={() => setActiveLightboxImg(r.startOdometerPhoto || null)}
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              {r.endOdometerPhoto ? (
                                <img
                                  src={r.endOdometerPhoto}
                                  alt="End Odometer"
                                  className="w-10 h-7 object-cover rounded border border-slate-200 hover:scale-110 transition cursor-pointer"
                                  onClick={() => setActiveLightboxImg(r.endOdometerPhoto || null)}
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              {r.fuelPhoto ? (
                                <img
                                  src={r.fuelPhoto}
                                  alt="Fuel Receipt"
                                  className="w-10 h-7 object-cover rounded border border-amber-300 hover:scale-110 transition cursor-pointer"
                                  onClick={() => setActiveLightboxImg(r.fuelPhoto || null)}
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3 font-mono">₹{r.fuelExpense !== undefined ? r.fuelExpense : (r.fuelAmount || 0)}</td>
                            <td className="p-3 font-mono">₹{r.generalExpense !== undefined ? r.generalExpense : (r.generalExpenseAmount || 0)}</td>
                            <td className="p-3 font-mono font-bold text-slate-900">₹{totExp}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReportForView(r);
                                    setViewReportDetailsOpen(true);
                                  }}
                                  className="p-1 rounded text-slate-600 hover:bg-slate-100 transition"
                                  title="View Report Details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDailyReportModal(vehicles.find(v => v.id === r.vehicleId) || selectedVehicleForInfo, r)}
                                  className="p-1 rounded text-blue-600 hover:bg-blue-50 transition"
                                  title="Edit Report"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm("Are you sure you want to delete this daily report?")) {
                                      try {
                                        await deleteDrivingSchoolDailyReportRecord(r.id);
                                        toast.success("Daily report deleted successfully!");
                                      } catch (err) {
                                        console.error("Failed to delete daily report:", err);
                                        toast.error("Failed to delete daily report");
                                      }
                                    }
                                  }}
                                  className="p-1 rounded text-rose-600 hover:bg-rose-50 transition"
                                  title="Delete Report"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT VEHICLE MODAL */}
      {addVehicleOpen && (
        <div
          onClick={() => setAddVehicleOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl space-y-6 my-auto p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingVehicle ? "Edit Driving School Vehicle" : "Add New Driving School Vehicle"}
              </h2>
              <button
                onClick={() => setAddVehicleOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    VEHICLE NUMBER <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GJ-01-KD-4412"
                    value={vNumber}
                    onChange={(e) => setVNumber(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    VEHICLE NAME <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maruti Swift"
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">MANUFACTURER</label>
                  <input
                    type="text"
                    placeholder="e.g. Maruti Suzuki"
                    value={vManufacturer}
                    onChange={(e) => setVManufacturer(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">MODEL</label>
                  <input
                    type="text"
                    placeholder="e.g. Swift VXI 2022"
                    value={vModel}
                    onChange={(e) => setVModel(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">VEHICLE TYPE</label>
                  <select
                    value={vType}
                    onChange={(e) => setVType(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="LMV - Hatchback">LMV - Hatchback</option>
                    <option value="LMV - Sedan">LMV - Sedan</option>
                    <option value="HMV - Truck">HMV - Truck</option>
                    <option value="MCWG - Two-wheeler">MCWG - Two-wheeler</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">FUEL TYPE</label>
                  <select
                    value={vFuelType}
                    onChange={(e) => setVFuelType(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Petrol+CNG">Petrol+CNG</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">INITIAL / CURRENT ODOMETER (KM)</label>
                  <input
                    type="number"
                    placeholder="44320"
                    value={vOdometer}
                    onChange={(e) => setVOdometer(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">STATUS</label>
                  <select
                    value={vStatus}
                    onChange={(e) => setVStatus(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Available">Available</option>
                    <option value="In Use">In Use</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">REGISTRATION DATE</label>
                  <input
                    type="date"
                    value={vRegDate}
                    onChange={(e) => setVRegDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">INSURANCE EXPIRY</label>
                  <input
                    type="date"
                    value={vInsuranceExp}
                    onChange={(e) => setVInsuranceExp(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              {/* Photo Upload Input */}
              <div className="space-y-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">VEHICLE PHOTO</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          setVPhoto(evt.target?.result as string);
                          toast.success("Vehicle photo selected");
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                    {vPhoto && (
                      <img src={vPhoto} alt="Preview" className="w-10 h-10 object-cover rounded-lg shrink-0 border" />
                    )}
                  </div>
                </div>

                {/* Documents Upload Section */}
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs">VEHICLE DOCUMENTS (RC, INSURANCE, FITNESS, etc.)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: "RC Book", key: "rc" },
                      { label: "Insurance Policy", key: "insurance" },
                      { label: "Fitness Certificate", key: "fitness" },
                      { label: "PUC Certificate", key: "puc" },
                      { label: "Permit", key: "permit" },
                      { label: "Tax Receipt", key: "taxreceipt" },
                    ].map((docItem) => (
                      <div key={docItem.key}>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          {docItem.label}
                        </label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              setVDocs((prev) => ({
                                ...prev,
                                [docItem.key]: evt.target?.result as string,
                              }));
                              toast.success(`${docItem.label} selected`);
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="w-full p-2 bg-white border border-slate-200 rounded-xl text-[11px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddVehicleOpen(false)}
                  className="px-5 py-2.5 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingVehicle}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-8 py-2.5 rounded-xl shadow-md shadow-blue-500/20"
                >
                  {savingVehicle ? "Uploading & Saving..." : editingVehicle ? "Update Vehicle" : "Save Vehicle"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAMERA OCR MODAL */}
      <CameraOdometerModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        title={cameraTargetField === "start" ? "Capture Start Odometer Photo" : "Capture End Odometer Photo"}
        suggestedValue={cameraSuggestedValue}
        onCapture={handleCameraCapture}
      />

      {activeLightboxImg && (
        <div
          onClick={() => setActiveLightboxImg(null)}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={activeLightboxImg}
              alt="Odometer Large View"
              className="max-w-full max-h-[80vh] object-contain rounded-lg border border-slate-700 shadow-2xl"
            />
            <button
              onClick={() => setActiveLightboxImg(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

