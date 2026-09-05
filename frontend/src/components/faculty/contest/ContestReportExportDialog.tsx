import { FileText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportClientError } from "@/lib/client-error-reporter";
import {
  DEFAULT_REPORT_SECTIONS,
  type ContestReportSections,
} from "@/lib/contest-report-options";

interface ContestReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: { subtitle: string; sections: ContestReportSections }) => void | Promise<void>;
  /** Disabled when the report has no narrative to include. */
  hasNarrative: boolean;
}

const SECTION_OPTIONS: { key: keyof ContestReportSections; label: string; hint: string }[] = [
  { key: "narrative", label: "Written summary", hint: "Executive summary, insights and recommendations" },
  { key: "questionBreakdown", label: "Question breakdown", hint: "Solve rates, attempts and solve times" },
  { key: "languageEfficiency", label: "Language efficiency", hint: "Runtime and memory per language" },
  { key: "optimalCode", label: "Most optimal code", hint: "Overall, per language and per question" },
  { key: "proctoring", label: "Proctoring", hint: "Violation counts and score bands" },
];

export function ContestReportExportDialog({
  open,
  onOpenChange,
  onExport,
  hasNarrative,
}: ContestReportExportDialogProps) {
  const [subtitle, setSubtitle] = useState("");
  const [sections, setSections] = useState<ContestReportSections>(DEFAULT_REPORT_SECTIONS);

  const toggle = (key: keyof ContestReportSections) =>
    setSections((current) => ({ ...current, [key]: !current[key] }));

  // Participation and methodology are always included, so there is always a report to produce.
  const selectedCount = SECTION_OPTIONS.filter((option) => sections[option.key]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Export report as PDF</DialogTitle>
          <DialogDescription>
            Opens the server-generated PDF preview in a new tab. You can save or download it from the PDF viewer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-subtitle">Subtitle (optional)</Label>
            <Input
              id="report-subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="e.g. Prepared for the Department Review Committee"
              maxLength={160}
            />
          </div>

          <div className="space-y-3">
            <Label>Sections to include</Label>
            {SECTION_OPTIONS.map((option) => {
              const disabled = option.key === "narrative" && !hasNarrative;
              return (
                <div key={option.key} className="flex items-start gap-3">
                  <Checkbox
                    id={`section-${option.key}`}
                    checked={sections[option.key] && !disabled}
                    disabled={disabled}
                    onCheckedChange={() => toggle(option.key)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label
                      htmlFor={`section-${option.key}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed"
                    >
                      {option.label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {disabled ? "No written summary is available for this report" : option.hint}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Contest details, participation statistics and the methodology note are always included, so the
            report stands on its own.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={selectedCount === 0}
            onClick={() => {
              // Fired synchronously so the popup keeps the click's user activation; the caller
              // reports its own failures, so a rejection here would be a bug rather than a signal.
              void Promise.resolve(onExport({ subtitle: subtitle.trim(), sections })).catch((error) => {
                reportClientError("window", error);
              });
              onOpenChange(false);
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> Open PDF preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
