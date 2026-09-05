import { useState, useEffect } from "react";
import { MessageCircle, Plus, Trash2, Send, Gift, Heart, MessageSquare, Award, Coins, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface WhatsAppMessagePanelProps {
  mobile?: string;
  name?: string;
}

interface CustomTemplate {
  id: string;
  name: string;
  message: string;
}

export function WhatsAppMessagePanel({ mobile, name }: WhatsAppMessagePanelProps) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateMsg, setNewTemplateMsg] = useState("");
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [sending, setSending] = useState(false);

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

  const isDisabled = !mobile || !mobile.trim();

  const formatMobileNumber = (num: string): string => {
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.startsWith("91")) return cleaned;
    if (cleaned.startsWith("0")) return "91" + cleaned.slice(1);
    return "91" + cleaned;
  };

  const openWhatsApp = (message: string) => {
    if (isDisabled) return;
    const formattedNumber = formatMobileNumber(mobile!);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
    window.open(url, "_blank");
  };

  // Dropdown options & messages
  const dropdownTemplates: Record<string, string> = {
    "Vahaan": `Dear ${name ?? "Customer"},\n\nRegarding your Vahaan services, we have processed your application. Please contact us if you have any questions.\n\nThank you!`,
    "Insurance": `Dear ${name ?? "Customer"},\n\nYour vehicle insurance is due. Please contact us for renewal options.\n\nThank you!`,
    "License": `Dear ${name ?? "Customer"},\n\nYour driving license application/renewal is in progress. Please contact us for further updates.\n\nThank you!`,
    "Form 5": `Dear ${name ?? "Customer"},\n\nYour Form 5 (Driving School Certificate) has been generated. Please contact us to collect it.\n\nThank you!`,
    "Driving School": `Dear ${name ?? "Customer"},\n\nYour driving school classes are scheduled. Please contact us to confirm your timings.\n\nThank you!`,
  };

  // Fixed action buttons
  const fixedButtons = [
    {
      label: "Happy Birthday",
      icon: <Gift className="size-3.5 mr-1" />,
      getMessage: () => `Happy Birthday ${name ?? "Customer"}! 🎂 Wishing you happiness, success, and good health.`,
    },
    {
      label: "Anniversary Wishes",
      icon: <Heart className="size-3.5 mr-1" />,
      getMessage: () => `Dear ${name ?? "Customer"},\n\nWishing you a very happy anniversary! 🎉 Thank you for being a valued client.`,
    },
    {
      label: "Feedback Request",
      icon: <MessageSquare className="size-3.5 mr-1" />,
      getMessage: () => `Dear ${name ?? "Customer"},\n\nThank you for choosing our services. We would appreciate it if you could share your feedback with us.`,
    },
    {
      label: "Thank You Message",
      icon: <Award className="size-3.5 mr-1" />,
      getMessage: () => `Dear ${name ?? "Customer"},\n\nThank you for choosing our services. We appreciate your trust and support.`,
    },
    {
      label: "Payment Reminder",
      icon: <Coins className="size-3.5 mr-1" />,
      getMessage: () => `Dear ${name ?? "Customer"},\n\nThis is a friendly reminder that a payment is pending for your services. Kindly arrange for the payment at your earliest convenience. Thank you.`,
    },
  ];

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setSelectedType(type);
    if (type && dropdownTemplates[type]) {
      openWhatsApp(dropdownTemplates[type]);
      // Reset selection so user can select again if needed
      setTimeout(() => setSelectedType(""), 100);
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
    return tmpl.replace(/{name}/g, name ?? "Customer");
  };

  return (
    <div className="space-y-4 p-4 border rounded-xl bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-2">
          <MessageCircle className="size-4 text-green-500 fill-green-500" /> WhatsApp Actions
        </Label>
        {isDisabled && <span className="text-xs text-red-600 font-medium">Mobile number required</span>}
      </div>

      {/* 1. Dropdown Message Selection */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Select Message Type</label>
        <select
          className="w-full border border-input bg-background rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={selectedType}
          onChange={handleDropdownChange}
          disabled={isDisabled}
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
        <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
          <span>Quick Actions</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 flex items-center gap-0.5"
            onClick={() => setNewTemplateOpen(true)}
            disabled={isDisabled}
          >
            <Plus className="size-3" /> Add Template
          </Button>
        </label>
        
        <div className="flex flex-wrap gap-2">
          {/* Predefined Fixed Buttons */}
          {fixedButtons.map((btn) => (
            <Button
              key={btn.label}
              variant="outline"
              size="sm"
              className="text-xs bg-muted/30 hover:bg-muted"
              onClick={() => openWhatsApp(btn.getMessage())}
              disabled={isDisabled}
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
                className="text-xs bg-green-50/30 hover:bg-green-50 border-green-200/50 pr-7"
                onClick={() => openWhatsApp(renderTemplateText(tmpl.message))}
                disabled={isDisabled}
              >
                <Sparkles className="size-3.5 mr-1 text-green-600" />
                {tmpl.name}
              </Button>
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-destructive rounded-full hover:bg-destructive/10 opacity-60 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                title="Delete Template"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}

          {/* Custom Message Dialog Trigger */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs bg-muted/30 hover:bg-muted"
            onClick={() => {
              setCustomMessage("");
              setCustomDialogOpen(true);
            }}
            disabled={isDisabled}
          >
            <FileText className="size-3.5 mr-1" />
            Custom Message
          </Button>
        </div>
      </div>

      {/* Dialog for Custom Message */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Custom WhatsApp Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custom-message" className="text-xs font-semibold">
                Message
              </Label>
              <Textarea
                id="custom-message"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-32 text-sm"
              />
              <p className="text-xs text-muted-foreground">{customMessage.length} characters</p>
            </div>
            {!isDisabled && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Sending to: <span className="font-mono font-semibold">{mobile}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (customMessage.trim()) {
                  openWhatsApp(customMessage);
                  setCustomDialogOpen(false);
                }
              }}
              disabled={!customMessage.trim() || isDisabled}
            >
              Send to WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog to Add Custom Template */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom WhatsApp Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name" className="text-xs font-semibold">
                Template Name
              </Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Follow-up Call"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-msg" className="text-xs font-semibold">
                Template Message
              </Label>
              <Textarea
                id="template-msg"
                value={newTemplateMsg}
                onChange={(e) => setNewTemplateMsg(e.target.value)}
                placeholder="Use {name} as placeholder for client name, e.g. Hi {name}, how are you?"
                className="min-h-24 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTemplate} disabled={!newTemplateName.trim() || !newTemplateMsg.trim()}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

