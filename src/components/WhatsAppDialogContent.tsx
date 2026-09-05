import { useState, useEffect } from "react";
import { Plus, Trash2, Gift, Heart, MessageSquare, Award, Coins, FileText, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";

interface CustomTemplate {
  id: string;
  name: string;
  message: string;
}

interface WhatsAppDialogContentProps {
  name: string;
  phone: string;
  defaultMessage: string;
  onClose: () => void;
  vehicleNumber?: string;
  dueAmount?: number;
}

export function WhatsAppDialogContent({
  name,
  phone,
  defaultMessage,
  onClose,
  vehicleNumber = "",
  dueAmount = 0,
}: WhatsAppDialogContentProps) {
  const [whatsappMessage, setWhatsappMessage] = useState(defaultMessage);
  const [selectedType, setSelectedType] = useState<string>("");
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateMsg, setNewTemplateMsg] = useState("");
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("whatsapp_custom_templates");
      if (saved) {
        setCustomTemplates(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load custom templates", e);
    }
  }, []);

  const saveTemplates = (templates: CustomTemplate[]) => {
    setCustomTemplates(templates);
    localStorage.setItem("whatsapp_custom_templates", JSON.stringify(templates));
  };

  const formatMobileNumber = (num: string): string => {
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.startsWith("91")) return cleaned;
    if (cleaned.startsWith("0")) return "91" + cleaned.slice(1);
    return "91" + cleaned;
  };

  const handleSend = () => {
    if (!phone) return;
    const formattedPhone = formatMobileNumber(phone);
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, "_blank");
    onClose();
  };

  // Dropdown templates
  const dropdownTemplates: Record<string, string> = {
    "Vahaan": `Dear ${name},\n\nRegarding your Vahaan services, we have processed your application. Please contact us if you have any questions.\n\nThank you!`,
    "Insurance": `Dear ${name},\n\nYour vehicle insurance is due. Please contact us for renewal options.\n\nThank you!`,
    "License": `Dear ${name},\n\nYour driving license application/renewal is in progress. Please contact us for further updates.\n\nThank you!`,
    "Form 5": `Dear ${name},\n\nYour Form 5 (Driving School Certificate) has been generated. Please contact us to collect it.\n\nThank you!`,
    "Driving School": `Dear ${name},\n\nYour driving school classes are scheduled. Please contact us to confirm your timings.\n\nThank you!`,
  };

  // Fixed action buttons
  const fixedButtons = [
    {
      label: "Happy Birthday",
      icon: <Gift className="size-3.5 mr-1 text-pink-500" />,
      getMessage: () => `Happy Birthday ${name}! 🎂 Wishing you happiness, success, and good health.`,
    },
    {
      label: "Anniversary Wishes",
      icon: <Heart className="size-3.5 mr-1 text-red-500" />,
      getMessage: () => `Dear ${name},\n\nWishing you a very happy anniversary! 🎉 Thank you for being a valued client.`,
    },
    {
      label: "Feedback Request",
      icon: <MessageSquare className="size-3.5 mr-1 text-blue-500" />,
      getMessage: () => `Dear ${name},\n\nThank you for choosing our services. We would appreciate it if you could share your feedback with us.`,
    },
    {
      label: "Thank You Message",
      icon: <Award className="size-3.5 mr-1 text-amber-500" />,
      getMessage: () => `Dear ${name},\n\nThank you for choosing our services. We appreciate your trust and support.`,
    },
    {
      label: "Payment Reminder",
      icon: <Coins className="size-3.5 mr-1 text-emerald-500" />,
      getMessage: () => `Dear ${name},\n\nThis is a friendly reminder that a payment of ₹${dueAmount} is pending for your services. Kindly arrange for the payment at your earliest convenience. Thank you.`,
    },
  ];

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setSelectedType(type);
    if (type && dropdownTemplates[type]) {
      setWhatsappMessage(dropdownTemplates[type]);
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplateName.trim() || !newTemplateMsg.trim()) return;
    const newTemplate: CustomTemplate = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      message: newTemplateMsg.trim(),
    };
    saveTemplates([...customTemplates, newTemplate]);
    setNewTemplateName("");
    setNewTemplateMsg("");
    setNewTemplateOpen(false);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveTemplates(customTemplates.filter((t) => t.id !== id));
  };

  const renderTemplateText = (tmpl: string) => {
    return tmpl.replace(/{name}/g, name);
  };

  return (
    <div className="space-y-4">
      {/* 1. Dropdown Message Selection */}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Select Message Type</label>
        <select
          className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedType}
          onChange={handleDropdownChange}
        >
          <option value="" disabled>
            Select Message Type...
          </option>
          <option value="Vahaan">Vahaan</option>
          <option value="Insurance">Insurance</option>
          <option value="License">License</option>
          <option value="Form 5">Form 5</option>
          <option value="Driving School">Driving School</option>
        </select>
      </div>

      {/* 2. Quick Action Buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quick Actions</label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 flex items-center gap-0.5"
            onClick={() => setNewTemplateOpen(true)}
          >
            <Plus className="size-3" /> Add Template
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {/* Predefined Fixed Buttons */}
          {fixedButtons.map((btn) => (
            <Button
              key={btn.label}
              variant="outline"
              size="sm"
              className="text-[11px] h-7 px-2.5 bg-slate-50 border-slate-200 hover:bg-slate-100"
              onClick={() => {
                setWhatsappMessage(btn.getMessage());
                setSelectedType("");
              }}
            >
              {btn.icon}
              {btn.label}
            </Button>
          ))}

          {/* User-Defined Custom Templates */}
          {customTemplates.map((tmpl) => (
            <div key={tmpl.id} className="relative group">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-7 pl-2.5 pr-7 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200/50"
                onClick={() => {
                  setWhatsappMessage(renderTemplateText(tmpl.message));
                  setSelectedType("");
                }}
              >
                <Sparkles className="size-3 mr-1 text-emerald-600" />
                {tmpl.name}
              </Button>
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50 opacity-60 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                title="Delete Template"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}

          {/* Reset to default summary message */}
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] h-7 px-2.5 bg-blue-50/50 border-blue-200/50 hover:bg-blue-50 text-blue-700"
            onClick={() => {
              setWhatsappMessage(defaultMessage);
              setSelectedType("");
            }}
          >
            <Undo2 className="size-3.5 mr-1" />
            Reset to Summary
          </Button>
        </div>
      </div>

      {/* 3. The Composition Textarea */}
      <div className="space-y-1 py-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Message Preview</label>
        <textarea
          value={whatsappMessage}
          onChange={(e) => setWhatsappMessage(e.target.value)}
          rows={10}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <DialogFooter className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button
          variant="outline"
          onClick={onClose}
          className="px-4 py-2 text-xs rounded-lg"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          className="px-5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
        >
          Send
        </Button>
      </DialogFooter>

      {/* Sub-Dialog to Add Custom Template */}
      {newTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Add Custom WhatsApp Template</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="sub-template-name" className="text-xs font-semibold text-slate-700">
                  Template Name
                </Label>
                <Input
                  id="sub-template-name"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Follow-up Call"
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sub-template-msg" className="text-xs font-semibold text-slate-700">
                  Template Message
                </Label>
                <Textarea
                  id="sub-template-msg"
                  value={newTemplateMsg}
                  onChange={(e) => setNewTemplateMsg(e.target.value)}
                  placeholder="Use {name} as placeholder for client name, e.g. Hi {name}, how are you?"
                  className="min-h-24 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewTemplateOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button onClick={handleAddTemplate} size="sm" disabled={!newTemplateName.trim() || !newTemplateMsg.trim()} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                Save Template
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
