// src/routes/dashboard.task-templates.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  GripVertical,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Copy,
  Eye,
  RotateCcw,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  subscribeToTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  deleteAllTemplates,
  restoreDefaultTemplates,
  type TaskTemplate,
} from "@/lib/tasks";
import { verifyAdminPin } from "@/lib/adminSecurity";
import { toast } from "sonner";
import { formatDate } from "@/lib/pdfGenerator";

export const Route = createFileRoute("/dashboard/task-templates")({
  component: TaskTemplatesPage,
});

const SERVICE_OPTIONS = [
  "Insurance",
  "Fitness",
  "Tax",
  "PUC",
  "National Permit(Gujrat Permit)",
  "Gujarat Permit",
  "License Renewal",
  "RC Transfer",
  "HP Termination",
  "Custom Service",
];

type SubModuleType = "vahaan" | "insurance" | "licence" | "form5" | "driving_school";

const SUB_MODULES: { value: SubModuleType; label: string }[] = [
  { value: "vahaan", label: "Vahaan" },
  { value: "insurance", label: "Insurance" },
  { value: "licence", label: "Licence" },
  { value: "form5", label: "Form 5" },
  { value: "driving_school", label: "Driving School" },
];

function TaskTemplatesPage() {
  const [session] = useState(() => getSession());
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("vahaan");

  // Form / Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [templateSubModule, setTemplateSubModule] = useState<string>("vahaan");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [editingSubtaskIndex, setEditingSubtaskIndex] = useState<number | null>(null);
  const [editingSubtaskValue, setEditingSubtaskValue] = useState("");

  const isAdmin = session?.role === "admin";
  const actor = session?.name || session?.username || "system";

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToTemplates((data) => {
      setTemplates(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const getTemplateSubModule = (tpl: TaskTemplate): string => {
    if (tpl.subModule) return tpl.subModule;
    const name = tpl.templateName.toLowerCase();
    if (name.includes("insurance")) return "insurance";
    if (name.includes("licence") || name.includes("license")) return "licence";
    if (name.includes("form 5") || name.includes("form5")) return "form5";
    if (name.includes("school") || name.includes("driving")) return "driving_school";
    return "vahaan";
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const sub = tpl.subModule || getTemplateSubModule(tpl);
      return sub.toLowerCase() === activeSubModule.toLowerCase();
    });
  }, [templates, activeSubModule]);

  const handleOpenCreate = () => {
    if (!isAdmin) return toast.error("Only admins can manage templates.");
    setEditingTemplate(null);
    setViewOnly(false);
    setTemplateName("");
    setDescription("");
    setTemplateSubModule(activeSubModule);
    setSubtasks([]);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (tpl: TaskTemplate) => {
    if (!isAdmin) return toast.error("Only admins can manage templates.");
    setEditingTemplate(tpl);
    setViewOnly(false);
    setTemplateName(tpl.templateName);
    setDescription(tpl.description || "");
    setTemplateSubModule(getTemplateSubModule(tpl));
    setSubtasks(tpl.subtasks || []);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleOpenView = (tpl: TaskTemplate) => {
    setEditingTemplate(tpl);
    setViewOnly(true);
    setTemplateName(tpl.templateName);
    setDescription(tpl.description || "");
    setTemplateSubModule(getTemplateSubModule(tpl));
    setSubtasks(tpl.subtasks || []);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleDuplicate = async (tpl: TaskTemplate) => {
    if (!isAdmin) return toast.error("Only admins can duplicate templates.");
    try {
      const name = `Copy of ${tpl.templateName}`;
      await createTemplate(name, tpl.description || "", tpl.subtasks || [], actor, getTemplateSubModule(tpl));
      toast.success("Template duplicated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate template");
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, newSubtask.trim()]);
    setNewSubtask("");
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (viewOnly) return;
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (viewOnly) return;
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    const list = [...subtasks];
    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);
    setSubtasks(list);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) return;
    if (!templateName.trim()) return toast.error("Template name is required");

    try {
      if (editingTemplate) {
        await updateTemplate(
          editingTemplate.id,
          {
            templateName: templateName.trim(),
            description: description.trim(),
            subModule: templateSubModule,
            subtasks,
          },
          actor,
        );
        toast.success("Template updated successfully!");
      } else {
        await createTemplate(templateName.trim(), description.trim(), subtasks, actor, templateSubModule);
        toast.success("Template created successfully!");
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    }
  };

  const handleDelete = async (tpl: TaskTemplate) => {
    if (!isAdmin) return toast.error("Only admins can delete templates.");

    const pin = prompt(`Enter Admin PIN to delete template "${tpl.templateName}":`);
    if (!pin) return;

    const ok = await verifyAdminPin(pin);
    if (!ok) return toast.error("Invalid Admin PIN");

    try {
      await deleteTemplate(tpl.id, actor);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      toast.success("Template deleted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete template");
    }
  };

  const handleDeleteAll = async () => {
    if (!isAdmin) return toast.error("Only admins can delete templates.");
    if (templates.length === 0) return toast.error("No templates to delete.");

    const confirmed = window.confirm(
      "Warning: This will permanently delete ALL task templates. Are you sure you want to proceed?"
    );
    if (!confirmed) {
      return toast.info("Deletion cancelled.");
    }

    const pin = prompt("Enter Admin PIN to confirm deletion of all templates:");
    if (pin === null) {
      return toast.info("Deletion cancelled.");
    }

    const ok = await verifyAdminPin(pin);
    if (!ok) return toast.error("Invalid Admin PIN");

    try {
      await deleteAllTemplates(actor);
      toast.success("All templates deleted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete templates");
    }
  };

  const handleRestoreDefaults = async () => {
    if (!isAdmin) return toast.error("Only admins can restore templates.");
    const confirmed = window.confirm(
      "Are you sure you want to restore the default task templates? This will add back all initial templates."
    );
    if (!confirmed) {
      return toast.info("Operation cancelled.");
    }

    const pin = prompt("Enter Admin PIN to confirm restoring default templates:");
    if (pin === null) {
      return toast.info("Operation cancelled.");
    }

    const ok = await verifyAdminPin(pin);
    if (!ok) return toast.error("Invalid Admin PIN");

    try {
      await restoreDefaultTemplates(actor);
      toast.success("Default templates restored successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to restore default templates");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800 flex items-center gap-2">
            <FileText className="size-6 text-primary" /> Centralized Task Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure default and custom subtask checklists.
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={handleRestoreDefaults}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <RotateCcw className="size-4" /> Restore Defaults
            </Button>
            <Button
              onClick={handleDeleteAll}
              variant="destructive"
              size="sm"
              className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              disabled={templates.length === 0}
            >
              <Trash2 className="size-4" /> Delete All
            </Button>
            <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
              <Plus className="size-4" /> Create Template
            </Button>
          </div>
        )}
      </div>

      {/* Mode Notification */}
      {!isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> Staff users can view templates, but only Admin users can add, edit, or delete them.
          </span>
        </div>
      )}

      {/* Sub-module Filter Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs select-none mb-4">
        {SUB_MODULES.map((tab) => {
          const isActive = activeSubModule === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveSubModule(tab.value)}
              className={`pb-2 font-bold transition-all relative ${
                isActive ? "text-primary font-extrabold" : "text-muted-foreground hover:text-slate-700"
              }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Table view */}
      <Card className="shadow-sm border border-slate-100">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-20 text-muted-foreground">Loading templates...</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-20 border border-dashed rounded-2xl bg-muted/5">
              <FileText className="size-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No task templates configured for this sub-module yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 uppercase text-[9px] font-bold text-muted-foreground">
                    <th className="p-3.5">Template Name</th>
                    <th className="p-3.5">Description</th>
                    <th className="p-3.5">Sub-Module</th>
                    <th className="p-3.5 text-center">Subtasks Count</th>
                    <th className="p-3.5">Created By</th>
                    <th className="p-3.5">Created Date</th>
                    <th className="p-3.5">Last Updated</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {filteredTemplates.map((tpl) => {
                    const subMod = tpl.subModule || getTemplateSubModule(tpl);
                    const subModLabel = SUB_MODULES.find(m => m.value === subMod)?.label || subMod;
                    return (
                      <tr key={tpl.id} className="hover:bg-slate-50 transition">
                        <td className="p-3.5 font-bold text-gray-900 flex items-center gap-1.5">
                          {tpl.templateName}
                          {tpl.isDefault && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-blue-100 text-blue-800">
                              Default
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-medium text-slate-500 max-w-xs truncate">{tpl.description || "—"}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            {subModLabel}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-gray-800">{tpl.subtasks?.length || 0}</td>
                        <td className="p-3.5 font-medium text-slate-600">{tpl.createdBy}</td>
                        <td className="p-3.5 font-mono text-slate-500">{formatDate(tpl.createdAt)}</td>
                      <td className="p-3.5 font-mono text-slate-500">{tpl.updatedAt ? formatDate(tpl.updatedAt) : "—"}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex gap-1.5 justify-center">
                          <Button onClick={() => handleOpenView(tpl)} variant="ghost" size="icon" className="size-7 hover:bg-slate-100" title="View">
                            <Eye className="size-3.5 text-slate-600" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button onClick={() => handleOpenEdit(tpl)} variant="ghost" size="icon" className="size-7 hover:bg-slate-100" title="Edit">
                                <Edit className="size-3.5 text-indigo-600" />
                              </Button>
                              <Button onClick={() => handleDuplicate(tpl)} variant="ghost" size="icon" className="size-7 hover:bg-slate-100" title="Duplicate">
                                <Copy className="size-3.5 text-emerald-600" />
                              </Button>
                              <Button
                                onClick={() => handleDelete(tpl)}
                                variant="ghost"
                                size="icon"
                                className="size-7 hover:bg-rose-50 text-rose-600"
                                title="Delete"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit / View Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] border"
          >
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-gray-800">
                {viewOnly ? "View Template" : editingTemplate ? "Edit Template" : "Create Task Template"}
              </h3>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-1">
                <Label htmlFor="tplName" className="text-xs font-bold uppercase text-gray-500">
                  Template Name *
                </Label>
                <Input
                  id="tplName"
                  required
                  disabled={viewOnly}
                  placeholder="e.g. Corporate Insurance"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tplDesc" className="text-xs font-bold uppercase text-gray-500">
                  Description
                </Label>
                <Input
                  id="tplDesc"
                  disabled={viewOnly}
                  placeholder="Describe what this template is for (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tplSubModule" className="text-xs font-bold uppercase text-gray-500">
                  Sub Module *
                </Label>
                <select
                  id="tplSubModule"
                  disabled={viewOnly}
                  value={templateSubModule}
                  onChange={(e) => setTemplateSubModule(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-white text-xs"
                >
                  {SUB_MODULES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subtasks Configurator */}
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs font-bold uppercase text-gray-500 block">
                  Configure Subtask Checklist
                </Label>
                {!viewOnly && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter checklist item (e.g. Call Client)"
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSubtask();
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddSubtask}>
                      Add
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5 mt-3 max-h-60 overflow-y-auto bg-slate-50 p-2.5 border rounded-lg">
                  {subtasks.map((st, index) => {
                    const isEditing = editingSubtaskIndex === index;
                    return (
                      <div
                        key={index}
                        draggable={!viewOnly && !isEditing}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`flex items-center justify-between gap-2 bg-white p-2 rounded border shadow-sm ${
                          viewOnly || isEditing ? "" : "cursor-move hover:border-primary/40"
                        } active:opacity-60 transition`}
                      >
                        <div className="flex items-center gap-2 text-xs text-gray-700 truncate flex-1">
                          {!viewOnly && !isEditing && (
                            <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs flex-1"
                              value={editingSubtaskValue}
                              onChange={(e) => setEditingSubtaskValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const updated = [...subtasks];
                                  updated[index] = editingSubtaskValue.trim();
                                  setSubtasks(updated);
                                  setEditingSubtaskIndex(null);
                                } else if (e.key === "Escape") {
                                  setEditingSubtaskIndex(null);
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="truncate">
                              {index + 1}. {st}
                            </span>
                          )}
                        </div>
                        {!viewOnly && (
                          <div className="flex gap-1.5 shrink-0">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...subtasks];
                                  updated[index] = editingSubtaskValue.trim();
                                  setSubtasks(updated);
                                  setEditingSubtaskIndex(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded"
                              >
                                <Save className="size-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubtaskIndex(index);
                                  setEditingSubtaskValue(st);
                                }}
                                className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded"
                              >
                                <Edit className="size-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveSubtask(index)}
                              className="text-rose-600 hover:text-rose-800 p-0.5 rounded"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {subtasks.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
                      <AlertCircle className="size-4 text-muted-foreground" /> Configure subtasks to populate automatically.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                {viewOnly ? "Close" : "Cancel"}
              </Button>
              {!viewOnly && (
                <Button type="submit" className="gap-1">
                  <Save className="size-4" /> {editingTemplate ? "Save Template" : "Create Template"}
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
