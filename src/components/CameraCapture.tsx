import React, { useRef, useEffect } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  stream: MediaStream | null;
  isPlaying: boolean;
  onVideoRefReady: (videoElement: HTMLVideoElement) => void;
  onCapture: () => void;
  onSwitchCamera?: () => void;
}

export function CameraCapture({
  stream,
  isPlaying,
  onVideoRefReady,
  onCapture,
  onSwitchCamera,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      onVideoRefReady(videoRef.current);
    }
  }, [onVideoRefReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (stream) {
        video.srcObject = stream;
        // Ensure playsinline and muted are set
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.play().catch((err) => {
          console.warn("Video stream play failed:", err);
        });
      } else {
        video.srcObject = null;
      }
    }
  }, [stream]);

  return (
    <div className="w-full space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800 shadow-inner">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />
        {/* Target Frame Overlay */}
        <div className="absolute inset-6 sm:inset-8 border-2 border-dashed border-blue-400/90 rounded-xl pointer-events-none flex items-center justify-center">
          <span className="text-[10px] bg-black/75 text-blue-200 px-3 py-1 rounded-full font-mono uppercase tracking-wider shadow-sm">
            Align Odometer Digits Here
          </span>
        </div>
      </div>

      {isPlaying && (
        <div className="flex items-center justify-center gap-3 pt-1">
          {onSwitchCamera && (
            <Button
              type="button"
              variant="outline"
              onClick={onSwitchCamera}
              className="bg-white border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl px-4 py-3 text-xs flex items-center gap-2"
              title="Switch Camera (Front/Rear)"
            >
              <RefreshCw className="w-4 h-4" />
              Flip Camera
            </Button>
          )}
          <Button
            type="button"
            onClick={onCapture}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-8 py-3 text-xs flex items-center gap-2 shadow-lg shadow-blue-500/25 transition active:scale-95"
          >
            <Camera className="w-4 h-4" />
            Capture Photo
          </Button>
        </div>
      )}
    </div>
  );
}
