import { useState, useEffect } from "react";
import { Share, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check mobile
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsMobile(mobile);

    // Check if already installed as PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsInstalled(standalone);

    // Detect iOS Safari
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Listen for Android Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful install
    const installed = () => setIsInstalled(true);
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // Don't render on desktop, or if already installed
  if (!isMobile || isInstalled) return null;

  // iOS: no beforeinstallprompt, show manual instructions
  if (isIOS) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-3">
        <Share className="h-3.5 w-3.5 text-primary" />
        <span>
          Tap <strong className="text-primary">Share</strong> then{" "}
          <strong className="text-primary">Add to Home Screen</strong>
        </span>
      </div>
    );
  }

  // Android: show native install button only when prompt is available
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="flex justify-center py-3">
      <button
        onClick={handleInstall}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Add to Home Screen
      </button>
    </div>
  );
};

export default InstallPrompt;
