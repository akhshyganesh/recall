import { Spinner } from "@/components/ui/spinner";
import { PlannerSettingsEditor } from "@/modules/planner/PlannerSettingsEditor";
import {
  getPlannerDocument,
  savePlannerDocument,
  type PlannerDocument,
  type PlannerSettings,
} from "@/modules/planner/api";
import { useEffect, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

export function PlannerSection() {
  const [document, setDocument] = useState<PlannerDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    void getPlannerDocument()
      .then((nextDocument) => {
        if (alive) setDocument(nextDocument);
      })
      .catch((loadError) => {
        if (alive) setError(String(loadError));
      });
    return () => {
      alive = false;
    };
  }, []);

  const persistDocument = async (nextDocument: PlannerDocument) => {
    setDocument(nextDocument);
    setError(null);
    try {
      await savePlannerDocument(nextDocument);
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  const updateSettings = (settings: PlannerSettings) => {
    if (!document) return;
    const updatedAt = new Date().toISOString();
    void persistDocument({ ...document, settings, updatedAt });
  };

  const exportPlanner = () => {
    if (!document) return;
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `recall-planner-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importPlanner = async (file: File) => {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as PlannerDocument;
      await persistDocument({ ...parsed, updatedAt: new Date().toISOString() });
    } catch (importError) {
      setError(`Import failed: ${String(importError)}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Planner"
        description="Customize planner dropdowns and move planner data between workspaces. MCP access is managed under Planner MCP."
      />
      {error ? <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
      {!document ? (
        <div className="flex h-32 items-center justify-center rounded-sm border border-border/60 bg-card/60 text-xs text-muted-foreground">
          <Spinner className="mr-2 size-4" />
          Loading planner settings...
        </div>
      ) : (
        <PlannerSettingsEditor
          settings={document.settings}
          items={document.items}
          onSettingsChange={updateSettings}
          onExport={exportPlanner}
          onImportClick={() => importInputRef.current?.click()}
        />
      )}
      <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void importPlanner(file);
      }} />
    </div>
  );
}