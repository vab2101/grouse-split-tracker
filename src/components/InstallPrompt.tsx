import { useEffect, useState } from "react";
import { X, Plus, Share } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-prompt-dismissed";

function isStandalone() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const onAdd = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") dismiss();
      setDeferred(null);
      return;
    }
    setShowIOSSteps(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pointer-events-none">
      <div className="max-w-md mx-auto bg-card border border-border rounded-lg shadow-lg p-4 pointer-events-auto relative">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {!showIOSSteps ? (
          <>
            <p className="text-sm pr-6 mb-3">
              Add to your home screen for a better experience and to keep your
              hike data longer. Browsers clear storage after a few days of
              inactivity.
            </p>
            <button
              onClick={onAdd}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add to Home Screen
            </button>
          </>
        ) : (
          <div className="pr-6">
            <p className="text-sm font-medium mb-2">
              {isIOS() ? "Add to Home Screen" : "Install this app"}
            </p>
            {isIOS() ? (
              <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                <li className="flex items-center gap-1">
                  Tap the Share <Share className="inline w-4 h-4" /> button in Safari
                </li>
                <li>Scroll and tap "Add to Home Screen"</li>
                <li>Open the app from its home screen icon</li>
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Use your browser menu and choose "Install app" or "Add to Home
                Screen", then open it from your home screen.
              </p>
            )}
            <button
              onClick={() => setShowIOSSteps(false)}
              className="mt-3 text-sm text-primary"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
