import * as React from "react";
import html2canvas from "html2canvas";
import { createRoot } from "react-dom/client";
import { InvoicePDFTemplate } from "@/components/InvoicePDFTemplate";
import type { Invoice } from "./billing";

const PAGE_WIDTH = 210; // A4 width in mm

// Canvas-based dynamic OKLCH/OKLAB converter
function oklchToRgb(colorStr: string): string {
  if (typeof document === "undefined") return "#3b82f6";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#3b82f6";
    ctx.fillStyle = colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    console.log(
      `[PDF] Dynamically resolved color: ${colorStr} -> rgb(${data[0]}, ${data[1]}, ${data[2]})`,
    );
    return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
  } catch (e) {
    console.warn("[PDF] Failed to convert color:", colorStr, e);
    return "#3b82f6";
  }
}

// Convert unsupported color functions in a style string
function sanitizeCssText(cssText: string): string {
  let sanitized = cssText;

  const oklchRegex = /oklch\([^)]+\)/gi;
  sanitized = sanitized.replace(oklchRegex, (match) => oklchToRgb(match));

  const oklabRegex = /oklab\([^)]+\)/gi;
  sanitized = sanitized.replace(oklabRegex, (match) => oklchToRgb(match));

  return sanitized;
}

export async function renderInvoiceToCanvas(invoice: Invoice): Promise<HTMLCanvasElement> {
  console.log("[PDF] Render Started");
  console.log("[PDF] Data Loaded");

  // Step 2 Logs
  console.log("[PDF] Invoice Data", invoice);
  console.log("[PDF] Client", invoice.clientName);
  console.log("[PDF] Services", invoice.services);
  console.log("[PDF] Total", invoice.totalAmount);

  if (!invoice) {
    throw new Error("Invoice data missing");
  }

  if (typeof document === "undefined") {
    throw new Error("Invoice PDF generation requires a browser environment.");
  }

  const mmToPx = 3.7795275591;
  const widthPx = Math.round(PAGE_WIDTH * mmToPx);
  const scale = Math.min(4, Math.max(3, window.devicePixelRatio || 1));

  const container = document.createElement("div");
  container.id = "pdf-renderer-container";
  container.style.position = "fixed";
  container.style.left = "-9999px"; // Off-screen instead of opacity: 0
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.minHeight = "297mm";
  container.style.boxSizing = "border-box";
  container.style.padding = "0px";
  container.style.background = "#ffffff";
  container.style.color = "#1e293b";
  container.style.visibility = "visible";
  container.style.opacity = "1"; // Keep opacity: 1 so html2canvas doesn't capture blank transparent page
  container.style.fontFamily = "Inter, Arial, sans-serif";
  container.style.zIndex = "-9999";
  container.style.pointerEvents = "none";
  container.style.overflow = "visible";

  const styleElement = document.createElement("style");
  styleElement.textContent = `
    #pdf-renderer-container, #pdf-renderer-container * {
      box-shadow: none !important;
      text-shadow: none !important;
    }
  `;
  container.appendChild(styleElement);
  document.body.appendChild(container);

  const invoiceRef = React.createRef<HTMLDivElement>();
  const root = createRoot(container);
  root.render(<InvoicePDFTemplate invoice={invoice} ref={invoiceRef} />);

  // Wait for React to fully render and paint the component
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 500);
      });
    });
  });

  // Verify elements exist and are not empty
  if (!invoiceRef.current) {
    root.unmount();
    container.remove();
    throw new Error("Invoice template missing");
  }

  console.log("[PDF] Template Found");
  console.log("[PDF] Captured element HTML length:", invoiceRef.current.innerHTML.length);

  if (invoiceRef.current.innerHTML.trim().length === 0) {
    root.unmount();
    container.remove();
    throw new Error("Invoice template empty");
  }

  if ((document as any).fonts?.ready) {
    try {
      await (document as any).fonts.ready;
    } catch (e) {
      console.warn("Font loading not available, proceeding with rendering");
    }
  }

  // Disable all other stylesheets to prevent html2canvas parsing errors
  const originalDisabled = new Map<HTMLStyleElement | HTMLLinkElement, boolean>();
  const styleAndLinkElements = Array.from(
    document.querySelectorAll("style, link[rel='stylesheet']"),
  ) as (HTMLStyleElement | HTMLLinkElement)[];

  for (const el of styleAndLinkElements) {
    if (el === styleElement) continue;
    originalDisabled.set(el, el.disabled);
    el.disabled = true;
  }
  console.log(`[PDF] Theme Sanitized: Temporarily disabled ${originalDisabled.size} style sheets`);

  try {
    const canvas = await html2canvas(invoiceRef.current, {
      backgroundColor: "#ffffff",
      scale,
      useCORS: true,
      width: invoiceRef.current.offsetWidth || widthPx,
      height: invoiceRef.current.offsetHeight || 1120,
      allowTaint: true,
      foreignObjectRendering: false,
      imageTimeout: 20000,
    });

    console.log("[PDF] Canvas Created");

    // Restore style sheets
    for (const [el, wasDisabled] of originalDisabled.entries()) {
      el.disabled = wasDisabled;
    }

    root.unmount();
    container.remove();
    return canvas;
  } catch (error) {
    console.warn(
      "[PDF] html2canvas error encountered, attempting fallback sanitization route",
      error,
    );

    // Fallback: If it failed, let's restore sheets first
    for (const [el, wasDisabled] of originalDisabled.entries()) {
      el.disabled = wasDisabled;
    }

    // Try fallback color sanitization in the sheets themselves instead of disabling them
    const restoredText = new Map<HTMLStyleElement, string>();
    const styleTags = Array.from(document.getElementsByTagName("style"));
    for (const tag of styleTags) {
      const text = tag.textContent || "";
      if (text.includes("oklch") || text.includes("oklab")) {
        restoredText.set(tag, text);
        tag.textContent = sanitizeCssText(text);
      }
    }
    console.log(`[PDF] Theme Sanitized fallback: Modified ${restoredText.size} style tags`);

    try {
      const canvas = await html2canvas(invoiceRef.current, {
        backgroundColor: "#ffffff",
        scale,
        useCORS: true,
        width: invoiceRef.current.offsetWidth || widthPx,
        height: invoiceRef.current.offsetHeight || 1120,
        allowTaint: true,
        foreignObjectRendering: false,
        imageTimeout: 20000,
      });

      console.log("[PDF] Canvas Created (fallback)");

      // Restore style text
      for (const [tag, text] of restoredText.entries()) {
        tag.textContent = text;
      }

      root.unmount();
      container.remove();
      return canvas;
    } catch (fallbackError) {
      // Restore style text
      for (const [tag, text] of restoredText.entries()) {
        tag.textContent = text;
      }

      root.unmount();
      container.remove();
      throw new Error(
        `Failed to render invoice to canvas: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }
  }
}
