import React, { useEffect, useState, useCallback, useRef } from "react";
import { Camera, X, RefreshCw, CheckCircle, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { useOCR } from "@/hooks/useOCR";
import { CameraCapture } from "@/components/CameraCapture";
import { toast } from "sonner";

interface CameraOdometerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  suggestedValue?: number;
  onCapture: (photoUrl: string, detectedOdometer?: number) => void;
}

export function CameraOdometerModal({
  isOpen,
  onClose,
  title,
  suggestedValue,
  onCapture,
}: CameraOdometerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    stream,
    isLoading,
    loadingMessage,
    error,
    isPlaying,
    startCamera,
    stopCamera,
  } = useCamera();

  const { isProcessing: processingOcr, processImage } = useOCR();

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detectedDigits, setDetectedDigits] = useState<string>("");
  const [ocrConfidence, setOcrConfidence] = useState<number>(0);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Handle modal mount/unmount & ESC key & body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setCapturedImage(null);
      setDetectedDigits("");
      setOcrConfidence(0);
    } else {
      document.body.style.overflow = "";
      stopCamera();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const handleVideoRefReady = useCallback(
    (videoEl: HTMLVideoElement) => {
      videoElementRef.current = videoEl;
      if (isOpen && !capturedImage) {
        startCamera(videoEl);
      }
    },
    [isOpen, capturedImage, startCamera]
  );

  // Take Snapshot & Trigger OCR
  const handleTakeSnapshot = async () => {
    if (!videoElementRef.current || !canvasRef.current) return;

    const video = videoElementRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(compressedDataUrl);

    // Stop active camera stream immediately after capture
    stopCamera();

    // Run OCR pipeline
    const { digits, confidence } = await processImage(canvas, compressedDataUrl, suggestedValue);
    setDetectedDigits(digits);
    setOcrConfidence(confidence);

    if (digits && confidence >= 70) {
      toast.success(`OCR detected odometer digits: ${digits} km (${Math.round(confidence)}% confidence)`);
    } else if (digits) {
      toast.info(`OCR detected digits: ${digits} (Confidence <70%). Please review & edit.`);
    } else {
      toast.info("Photo captured. Please enter the odometer reading manually.");
    }
  };

  // Upload File Fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      setCapturedImage(dataUrl);

      const img = new Image();
      img.onload = async () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const { digits, confidence } = await processImage(canvas, dataUrl, suggestedValue);
          setDetectedDigits(digits);
          setOcrConfidence(confidence);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    const num = detectedDigits ? parseInt(detectedDigits, 10) : undefined;
    onCapture(capturedImage, num);
    stopCamera();
    onClose();
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 flex flex-col items-center justify-center min-h-[320px]">
          <canvas ref={canvasRef} className="hidden" />

          {capturedImage ? (
            <div className="w-full space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video flex items-center justify-center shadow-inner">
                <img
                  src={capturedImage}
                  alt="Captured Odometer"
                  className="w-full h-full object-contain"
                />
                {processingOcr && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-2">
                    <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
                    <span className="text-xs font-semibold tracking-wide">Scanning Odometer Digits...</span>
                  </div>
                )}
              </div>

              {/* Detected Odometer Input / Correction */}
              <div className="bg-blue-50/80 p-3.5 rounded-xl border border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">
                    ODOMETER READING (KM)
                  </label>
                  {ocrConfidence > 0 && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ocrConfidence >= 70
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      OCR Confidence: {Math.round(ocrConfidence)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Enter odometer reading e.g. 44320"
                    value={detectedDigits}
                    onChange={(e) => setDetectedDigits(e.target.value)}
                    className="w-full p-2.5 bg-white border border-blue-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-500">km</span>
                </div>
                {ocrConfidence > 0 && ocrConfidence < 70 && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    Low OCR confidence detected. Please double-check and correct the reading above.
                  </p>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="w-full py-8 text-center space-y-4 px-4">
              <div className="p-3.5 rounded-full bg-rose-50 text-rose-600 inline-block border border-rose-100">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <p className="text-xs font-medium text-slate-700 max-w-xs mx-auto leading-relaxed">
                {error}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <Button
                  onClick={() => videoElementRef.current && startCamera(videoElementRef.current)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl w-full sm:w-auto"
                >
                  Retry Camera
                </Button>
                <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer inline-flex items-center justify-center gap-2 w-full sm:w-auto border border-slate-200">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Photo Instead
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="w-full relative">
              <CameraCapture
                stream={stream}
                isPlaying={isPlaying}
                onVideoRefReady={handleVideoRefReady}
                onCapture={handleTakeSnapshot}
                onSwitchCamera={() => {
                  if (videoElementRef.current) {
                    startCamera(videoElementRef.current);
                  }
                }}
              />
              {isLoading && (
                <div className="absolute inset-0 bg-slate-950/80 rounded-xl flex flex-col items-center justify-center space-y-3 z-10 text-white min-h-[220px]">
                  <Loader2 className="w-9 h-9 text-blue-400 animate-spin" />
                  <p className="text-xs font-semibold animate-pulse">{loadingMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          {capturedImage ? (
            <Button
              variant="outline"
              onClick={() => {
                setCapturedImage(null);
                if (videoElementRef.current) startCamera(videoElementRef.current);
              }}
              className="text-xs font-semibold rounded-xl text-slate-700"
            >
              Retake Photo
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose} className="text-xs font-semibold text-slate-500">
              Cancel
            </Button>
          )}

          {capturedImage && (
            <Button
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-6 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <CheckCircle className="w-4 h-4" />
              Confirm & Use Photo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
