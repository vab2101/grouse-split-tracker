import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const buildDate = new Date(__BUILD_DATE__).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How To Use</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Use case */}
          <p className="text-muted-foreground">
            Track your split times at each numbered marker on the BCMC trail —
            50 markers over 2.52 km and 796 m of elevation gain. All data stays
            on your device. No account required.
          </p>

          {/* Getting started */}
          <section>
            <h3 className="font-semibold mb-1.5">Getting started</h3>
            <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
              <li>Open the app at the trailhead and allow location access.</li>
              <li>
                Wait for the GPS dot on the map to turn green (fix
                accurate to &lt;30 m).
              </li>
              <li>Tap <strong className="text-foreground">START</strong> when you begin hiking.</li>
              <li>
                Pass each numbered trail marker — in <strong className="text-foreground">Auto</strong> mode the
                app logs your split automatically. In{" "}
                <strong className="text-foreground">Manual</strong> mode, tap the large marker button as
                you pass.
              </li>
              <li>
                Tap <strong className="text-foreground">FINISH</strong> when you reach the Grouse lodge
                timer card scan.
              </li>
            </ol>
          </section>

          {/* Auto vs Manual */}
          <section>
            <h3 className="font-semibold mb-1.5">Auto vs Manual mode</h3>
            <p className="text-muted-foreground">
              The mode pill on the marker button shows the current tracking
              mode. The app uses <strong className="text-foreground">Auto</strong> when GPS accuracy is
              better than 30 m and the upcoming marker has a known position.
              It arms an approach zone, keeps the closest GPS fix, and commits
              the split as you walk out. Everything else falls back to{" "}
              <strong className="text-foreground">Manual</strong> — tap the button when you pass.
            </p>
            <p className="text-muted-foreground mt-1">
              Markers 31, 33, 44, and 45 have no GPS position in the dataset
              and always use Manual mode.
            </p>
          </section>

          {/* Features */}
          <section>
            <h3 className="font-semibold mb-1.5">Features</h3>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>
                <strong className="text-foreground">Missed a marker?</strong> Tap{" "}
                <strong className="text-foreground">Forgot marker N</strong> to skip past it and keep
                the app in sync. The current time is recorded but no GPS
                position is saved for that marker.
              </li>
              <li>
                <strong className="text-foreground">Tags.</strong> Tap the tag button to drop a
                timestamped note mid-hike (rest stops, conditions, etc.).
              </li>
              <li>
                <strong className="text-foreground">Screen lock.</strong> Hold the lock button for 1 s to
                prevent accidental taps. Hold again (2 s) to unlock.
              </li>
              <li>
                <strong className="text-foreground">GPS map.</strong> Shows your position on the trail.
                Dot colour: green = accurate, yellow = moderate, red = poor.
              </li>
              <li>
                <strong className="text-foreground">Elevation profile.</strong> Updates in real time as
                you climb.
              </li>
              <li>
                <strong className="text-foreground">History.</strong> All hikes saved locally. Compare
                up to 3 hikes side by side.
              </li>
              <li>
                <strong className="text-foreground">CSV export.</strong> Export any hike for
                spreadsheet analysis (marker, time, coords, accuracy, mode,
                tags).
              </li>
            </ul>
          </section>

          {/* Suggested practices */}
          <section>
            <h3 className="font-semibold mb-1.5">Tips</h3>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Let GPS settle to a green dot before tapping START.</li>
              <li>
                The screen stays on automatically during an active hike (wake
                lock). Install to your home screen for the best offline
                experience.
              </li>
              <li>
                When the button shows <strong className="text-foreground">Approaching N</strong>, you
                can tap it to commit immediately at your live GPS position
                instead of waiting for the auto zone-exit. Once auto has
                already fired and the marker advances, there is no undo.
              </li>
              <li>
                Export a CSV after important hikes — localStorage can be
                cleared by the browser.
              </li>
            </ul>
          </section>

          {/* Build info */}
          <section className="border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="mb-2">
              This app uses{" "}
              <span className="text-foreground font-medium">GoatCounter</span>{" "}
              for basic, privacy-preserving usage counting — no cookies, no
              fingerprinting, no personal data. Only two events are counted:
              page loads and hike starts.
            </p>
          </section>

          <section className="border-t border-border pt-3 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between">
              <span>Version</span>
              <span className="font-mono">{__APP_VERSION__}</span>
            </div>
            <div className="flex justify-between">
              <span>Commit</span>
              <span className="font-mono">{__COMMIT_HASH__}</span>
            </div>
            <div className="flex justify-between">
              <span>Built</span>
              <span className="font-mono">{buildDate}</span>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
