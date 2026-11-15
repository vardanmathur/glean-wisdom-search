import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import ReactCrop, { convertToPixelCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Camera, Image as ImageIcon, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import {
  SCAN_JPEG_QUALITY,
  SLOW_READ_MS,
  appendScanText,
  readingStatus,
  scanErrorMessage,
  scanSuccessMessage,
  targetSize,
} from "@/lib/scanText";

// Scan text: an in-app photo (or an existing image) -> crop -> the AI reads the text.
// The image only ever lives in memory (object URLs and canvases): it is never written to the device's storage,
// the browser's storage or ours, and every URL is revoked when the picture is no longer needed.

interface ScanTextPanelProps {
  /** The quote box's current text: a scanned page is added to it, never written over it. */
  quote: string;
  onQuoteChange: (text: string) => void;
  /** False once the Add highlight window closes, which ends any scan in progress. */
  active: boolean;
}

type Screen = "idle" | "camera" | "crop";
type Source = "camera" | "file";

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

const DEFAULT_CROP: Crop = { unit: "%", x: 5, y: 5, width: 90, height: 90 };

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode image"))), "image/jpeg", quality),
  );

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load image"));
    img.src = url;
  });

const ScanTextPanel = ({ quote, onQuoteChange, active }: ScanTextPanelProps) => {
  const [screen, setScreen] = useState<Screen>("idle");
  const [source, setSource] = useState<Source>("camera");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [readAll, setReadAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(true);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // Drops the picture from memory: revoke its URL and forget the crop.
  const clearImage = useCallback(() => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    setImageUrl(null);
    setCrop(undefined);
    setCompletedCrop(null);
  }, []);

  // Stops the 6-second "still reading" timer and puts the status line back to its first wording.
  const clearSlowTimer = useCallback(() => {
    if (slowTimer.current !== null) {
      clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
    setSlow(false);
  }, []);

  const closeAll = useCallback(() => {
    clearSlowTimer();
    stopCamera();
    clearImage();
    setScreen("idle");
    setBusy(false);
    setReading(false);
    setErrorText(null);
  }, [stopCamera, clearImage, clearSlowTimer]);

  // Phone Back steps out of the camera or crop screen only, not the whole Add highlight window.
  useCloseOnBack(screen !== "idle", closeAll, "overlayScan");

  // The Add highlight window closing ends the scan; unmounting releases the camera and the picture.
  useEffect(() => {
    if (!active) closeAll();
  }, [active, closeAll]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (slowTimer.current !== null) clearTimeout(slowTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  const showImage = (blob: Blob, from: Source) => {
    clearImage();
    setSource(from);
    setImageUrl(URL.createObjectURL(blob));
    setErrorText(null);
    setScreen("crop");
  };

  // ---- camera ----
  const openCamera = async () => {
    setErrorText(null);
    clearImage();
    setSource("camera");
    setScreen("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } },
        audio: false,
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraReady(true);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Couldn't access the camera");
      setScreen("idle");
    }
  };

  const attachVideo = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const stream = streamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch((err) => console.warn("video.play() failed:", err));
    }
  };

  const takeShot = async () => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      // A real still at the sensor's full resolution where the browser supports it
      const Capture = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      const track = stream.getVideoTracks()[0];
      if (Capture && track) {
        try {
          blob = await new Capture(track).takePhoto();
        } catch (err) {
          console.warn("takePhoto failed, using the video frame:", err);
        }
      }
      if (!blob) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) throw new Error("camera not ready");
        ctx.drawImage(video, 0, 0);
        blob = await canvasToBlob(canvas, 0.95);
        canvas.width = 0;
        canvas.height = 0;
      }
      stopCamera();
      if (aliveRef.current) showImage(blob, "camera");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't take the photo — try again");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  // ---- an existing image (no capture attribute, so nothing new is created) ----
  const chooseFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    showImage(file, "file");
  };

  // ---- crop ----
  const onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    setCrop(DEFAULT_CROP);
    setCompletedCrop(convertToPixelCrop(DEFAULT_CROP, img.width, img.height));
  };

  // Turns the picture a quarter turn: a rotated copy replaces it (and the crop starts again).
  const rotate = async () => {
    const url = imageUrlRef.current;
    if (!url || busy) return;
    setBusy(true);
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas, 0.92);
      canvas.width = 0;
      canvas.height = 0;
      if (!aliveRef.current) return;
      URL.revokeObjectURL(url);
      const next = URL.createObjectURL(blob);
      imageUrlRef.current = next;
      setImageUrl(next);
      setCrop(undefined);
      setCompletedCrop(null);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't rotate the image");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const retake = () => {
    if (busy) return;
    clearSlowTimer();
    if (source === "camera") {
      void openCamera();
    } else {
      closeAll();
      fileInputRef.current?.click();
    }
  };

  // Crops, shrinks so the long edge is at most 2000px, encodes as JPEG and returns the base64 (no data: prefix).
  const cropToBase64 = (): string | null => {
    const img = imgRef.current;
    const area = completedCrop;
    if (!img || !area || area.width < 1 || area.height < 1 || !img.width || !img.height) return null;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const sx = area.x * scaleX;
    const sy = area.y * scaleY;
    const sw = area.width * scaleX;
    const sh = area.height * scaleY;
    const size = targetSize(sw, sh);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL("image/jpeg", SCAN_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl.split(",")[1] ?? null;
  };

  const readText = async () => {
    if (busy) return;
    setErrorText(null);
    const image = cropToBase64();
    if (!image) {
      setErrorText(scanErrorMessage("failed"));
      return;
    }
    setBusy(true);
    setReading(true);
    slowTimer.current = setTimeout(() => {
      slowTimer.current = null;
      if (aliveRef.current) setSlow(true);
    }, SLOW_READ_MS);
    try {
      const { data, error } = await supabase.functions.invoke("read-text-from-image", {
        body: { image, mode: readAll ? "all" : "auto" },
      });
      if (!aliveRef.current) return;
      const reply = (data ?? {}) as { text?: string; marked_found?: boolean; error?: string };
      if (error || reply.error) {
        setErrorText(scanErrorMessage(error ? "failed" : reply.error));
        return;
      }
      const text = (reply.text ?? "").trim();
      if (!text) {
        setErrorText(scanErrorMessage("failed"));
        return;
      }
      onQuoteChange(appendScanText(quote, text));
      setHasScanned(true);
      toast.success(scanSuccessMessage(reply.marked_found === true, readAll));
      closeAll();
    } catch {
      console.error("read-text-from-image failed");
      if (aliveRef.current) setErrorText(scanErrorMessage("failed"));
    } finally {
      clearSlowTimer();
      if (aliveRef.current) {
        setBusy(false);
        setReading(false);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={openCamera} className="h-11 gap-1.5">
          <Camera className="h-4 w-4" /> {hasScanned ? "Scan another page" : "Take photo"}
        </Button>
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-11 gap-1.5">
          <ImageIcon className="h-4 w-4" /> Choose from Photos
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={chooseFile} />
      </div>
      <p className="text-xs text-muted-foreground">
        The photo is read and then discarded. It is never saved to your device or to Glean.
      </p>

      <DialogPrimitive.Root
        open={screen !== "idle"}
        onOpenChange={(o) => {
          if (!o && !busy) closeAll();
        }}
      >
        <DialogPortal>
          <DialogOverlay className="z-[59]" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-[60] flex flex-col bg-black text-white outline-none sm:inset-8 sm:mx-auto sm:max-w-4xl sm:overflow-hidden sm:rounded-xl"
          >
            <DialogTitle className="sr-only">{screen === "camera" ? "Take a photo of the page" : "Crop the text"}</DialogTitle>

            {screen === "camera" && (
              <>
                <video ref={attachVideo} className="min-h-0 w-full flex-1 bg-black object-contain" muted playsInline autoPlay />
                <div className="flex items-center justify-between gap-4 bg-black/90 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
                  <Button type="button" variant="outline" onClick={closeAll} className="h-12 min-w-[96px] text-foreground">
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={takeShot}
                    disabled={!cameraReady || busy}
                    aria-label="Take photo"
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <span className="h-14 w-14 rounded-full bg-white" />}
                  </button>
                  <span className="min-w-[96px]" aria-hidden="true" />
                </div>
              </>
            )}

            {screen === "crop" && (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
                  {imageUrl && (
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percent) => setCrop(percent)}
                      onComplete={(pixels) => setCompletedCrop(pixels)}
                      keepSelection
                      ruleOfThirds
                      minWidth={30}
                      minHeight={30}
                      disabled={busy}
                    >
                      <img
                        key={imageUrl}
                        src={imageUrl}
                        alt="Page to crop"
                        onLoad={onImageLoad}
                        className="max-h-[calc(100dvh-13rem)] max-w-full object-contain"
                      />
                    </ReactCrop>
                  )}
                </div>
                <div className="space-y-3 bg-black/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
                  {reading && (
                    <p aria-live="polite" className="text-center text-sm text-white/80">
                      {readingStatus(slow)}
                    </p>
                  )}
                  {errorText && (
                    <p role="alert" className="text-center text-sm font-medium text-red-300">
                      {errorText}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button type="button" variant="outline" onClick={rotate} disabled={busy} className="h-12 gap-1.5 text-foreground">
                      <RotateCw className="h-4 w-4" /> Rotate
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch id="scan-read-all" checked={readAll} onCheckedChange={setReadAll} disabled={busy} />
                      <Label htmlFor="scan-read-all" className="text-sm text-white">
                        Read all text
                      </Label>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={retake} disabled={busy} className="h-12 flex-1 text-foreground">
                      Retake
                    </Button>
                    <Button type="button" onClick={readText} disabled={busy || !completedCrop} className="h-12 flex-[2]">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {busy ? "Reading text…" : "Read text"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </DialogPrimitive.Root>
    </div>
  );
};

export default ScanTextPanel;
