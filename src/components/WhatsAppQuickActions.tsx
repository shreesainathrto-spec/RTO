import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface WhatsAppQuickActionsProps {
  mobile?: string;
  name?: string;
}

interface MessageTemplate {
  label: string;
  message: (name: string) => string;
  color?: string;
}

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    label: "🎂 Happy Birthday",
    message: (name) =>
      `Dear ${name}, wishing you a very Happy Birthday from Shree Sainath Consultancy.`,
  },
  {
    label: "💑 Anniversary Wishes",
    message: () => "Wishing you a wonderful anniversary. Thank you for your trust.",
  },
  {
    label: "⭐ Feedback Request",
    message: () => "Thank you for choosing our services. Please share your valuable feedback.",
  },
  {
    label: "🙏 Thank You Message",
    message: () => "Thank you for choosing Shree Sainath Consultancy.",
  },
  {
    label: "💳 Payment Reminder",
    message: () =>
      "Friendly reminder that your payment is pending. Please contact us for assistance.",
  },
];

export function WhatsAppQuickActions({ mobile, name }: WhatsAppQuickActionsProps) {
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);

  const isDisabled = !mobile || !mobile.trim();

  const formatMobileNumber = (num: string): string => {
    // Remove all non-digit characters
    const cleaned = num.replace(/\D/g, "");
    // If already has 91 prefix (India), use as is
    if (cleaned.startsWith("91")) return cleaned;
    // If starts with 0, remove it and add 91
    if (cleaned.startsWith("0")) return "91" + cleaned.slice(1);
    // Otherwise assume it's missing country code and add 91
    return "91" + cleaned;
  };

  const openWhatsApp = (message: string) => {
    if (isDisabled) return;

    const formattedNumber = formatMobileNumber(mobile!);
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  };

  const handleSendTemplate = (template: MessageTemplate) => {
    const message = template.message(name || "");
    openWhatsApp(message);
  };

  const handleSendCustom = async () => {
    if (!customMessage.trim()) return;
    setSending(true);
    try {
      openWhatsApp(customMessage);
      setCustomMessage("");
      setCustomDialogOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold tracking-wide text-muted-foreground flex items-center gap-2">
          <MessageCircle className="size-4" />
          WhatsApp Actions
        </Label>
        {isDisabled && <span className="text-xs text-red-600">Mobile number required</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MESSAGE_TEMPLATES.map((template, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            onClick={() => handleSendTemplate(template)}
            disabled={isDisabled}
            title={isDisabled ? "Add mobile number to use WhatsApp actions" : template.label}
            className="text-xs h-auto py-2 px-2 line-clamp-2"
          >
            {template.label}
          </Button>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setCustomDialogOpen(true)}
        disabled={isDisabled}
        className="w-full text-xs"
      >
        <Send className="size-3 mr-1" />
        Custom Message
      </Button>

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
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendCustom}
              disabled={sending || !customMessage.trim() || isDisabled}
            >
              {sending ? "Sending…" : "Send to WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
