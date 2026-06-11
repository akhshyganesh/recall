import { Button } from "@/components/ui/button";
import { loadPreferences, importPreferences, type Preferences } from "@/modules/settings/store";
import { ClipboardCopyIcon, FileDownloadIcon, FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { SettingsCard } from "../components/SettingsCard";

export function DataSection() {
  const [exported, setExported] = useState<string>("");
  const [importText, setImportText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const importRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadPreferences().then((prefs) => {
      setExported(JSON.stringify(prefs, null, 2));
    });
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for Tauri contexts
      const el = document.createElement("textarea");
      el.value = exported;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImport = async () => {
    setImportError(null);
    setImportSuccess(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText.trim());
    } catch {
      setImportError("Invalid JSON — please check the format and try again.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setImportError("Expected a JSON object.");
      return;
    }
    try {
      await importPreferences(parsed as Partial<Preferences>);
      setImportSuccess(true);
      setImportText("");
      const updated = await loadPreferences();
      setExported(JSON.stringify(updated, null, 2));
      setTimeout(() => setImportSuccess(false), 3000);
    } catch {
      setImportError("Failed to import settings. Some values may be invalid.");
    }
  };

  return (
    <div className="flex flex-col">
      <SettingsCard title="Export configuration">
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-[11.5px] text-muted-foreground/70">
            Copy your current settings as JSON. Paste this into a fresh install to restore everything at once.
          </p>
          <div className="relative">
            <textarea
              readOnly
              value={exported}
              className="h-52 w-full resize-none rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 font-mono text-[11px] text-foreground/80 outline-none focus:border-border/80"
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-[11.5px]"
            >
              <HugeiconsIcon icon={copied ? FileDownloadIcon : ClipboardCopyIcon} size={12} strokeWidth={2} />
              {copied ? "Copied!" : "Copy to clipboard"}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Import configuration">
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-[11.5px] text-muted-foreground/70">
            Paste a previously exported JSON config below to restore settings. Unknown keys are ignored.
          </p>
          <textarea
            ref={importRef}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
              setImportSuccess(false);
            }}
            placeholder='{ "accentHue": 300, "terminalFontSize": 14, … }'
            className="h-40 w-full resize-none rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 font-mono text-[11px] text-foreground/80 outline-none placeholder:text-muted-foreground/30 focus:border-border/80"
          />
          {importError && (
            <p className="text-[11px] text-destructive">{importError}</p>
          )}
          {importSuccess && (
            <p className="text-[11px] text-primary">Settings imported successfully.</p>
          )}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              disabled={!importText.trim()}
              className="flex items-center gap-1.5 text-[11.5px]"
            >
              <HugeiconsIcon icon={FileUploadIcon} size={12} strokeWidth={2} />
              Apply configuration
            </Button>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
