import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCopy, Eye, FileJson, Info, Save, Upload } from "lucide-react";

import { ApiError } from "@/api/client";
import { toProblemWritePayload } from "@/api/mappers";
import { problemsApi } from "@/api/services";
import type { ProblemEditorData } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { ProblemEditorForm } from "@/components/ProblemEditorForm";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  toProblemEditorDataFromJsonDraft,
  type JsonImportFieldError,
} from "@/lib/problem-import-schema";

const exampleJson = `[
  {
    "title": "Maximum Subarray Sum",
    "slug": "maximum-subarray-sum",
    "statement": "Given an array of integers, find the maximum possible sum of a contiguous subarray.",
    "difficulty": "Medium",
    "topic": "Dynamic Programming",
    "constraints": ["1 <= n <= 100000", "-1000000000 <= a[i] <= 1000000000"],
    "inputFormat": "The first line contains n. The second line contains n integers.",
    "outputFormat": "Print the maximum subarray sum.",
    "explanation": "Use Kadane's algorithm to keep the best suffix sum at each index.",
    "timeLimit": 1,
    "memoryLimit": 256,
    "tags": ["Array", "Dynamic Programming"],
    "sampleTestCases": [
      { "input": "5\\n-2 1 -3 4 5", "output": "9", "explanation": "The best subarray is 4 5." }
    ],
    "hiddenTestCases": [
      { "input": "3\\n-5 -2 -8", "output": "-2" }
    ]
  },
  {
    "title": "Sum of Two Numbers",
    "slug": "sum-of-two-numbers",
    "statement": "Read two integers and print their sum.",
    "difficulty": "Easy",
    "topic": "Basics",
    "constraints": ["-1000000000 <= a, b <= 1000000000"],
    "inputFormat": "Two integers separated by whitespace.",
    "outputFormat": "Print one integer representing the sum.",
    "explanation": "Add both integers directly.",
    "timeLimit": 1,
    "memoryLimit": 256,
    "tags": ["Math", "Basics"],
    "sampleTestCases": [
      { "input": "2 5", "output": "7" }
    ],
    "hiddenTestCases": [
      { "input": "-3 7", "output": "4" }
    ]
  }
]`;

type ImportedProblemDraft = {
  id: string;
  draft: ProblemEditorData;
  approved: boolean;
};

function FieldErrors({ errors }: { errors: JsonImportFieldError[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="max-h-48 overflow-auto rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <p className="font-medium text-destructive">Import validation failed</p>
      <ul className="mt-2 space-y-1">
        {errors.map((error, index) => (
          <li key={`${error.path}-${error.message}-${index}`}>
            <span className="font-mono-code text-xs">{error.path}</span>: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TestCasePreview({ testCase }: { testCase: ProblemEditorData["sampleTestCases"][number] }) {
  return (
    <pre className="overflow-auto rounded-md bg-muted p-3 font-mono-code text-xs">{`Input:
${testCase.input}

Output:
${testCase.output}${testCase.explanation ? `\n\nExplanation:\n${testCase.explanation}` : ""}`}</pre>
  );
}

function ProblemDetailDialog({
  draft,
  open,
  onOpenChange,
}: {
  draft: ProblemEditorData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!draft) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.title}</DialogTitle>
          <DialogDescription>
            {draft.topic} - {draft.difficulty} - {draft.timeLimitSeconds}s - {draft.memoryLimitMb} MB
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="font-display text-base font-bold">Statement</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.statement}</p>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-2">
                <h3 className="font-display text-base font-bold">Input Format</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.inputFormat}</p>
              </section>
              <section className="space-y-2">
                <h3 className="font-display text-base font-bold">Output Format</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.outputFormat}</p>
              </section>
            </div>
            <section className="space-y-2">
              <h3 className="font-display text-base font-bold">Explanation</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.explanation || "No explanation provided."}</p>
            </section>
            <Accordion type="multiple" defaultValue={["sample"]}>
              <AccordionItem value="sample">
                <AccordionTrigger>Sample test cases ({draft.sampleTestCases.length})</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {draft.sampleTestCases.map((testCase, index) => (
                    <TestCasePreview key={`sample-${index}`} testCase={testCase} />
                  ))}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="hidden">
                <AccordionTrigger>Hidden test cases ({draft.hiddenTestCases.length})</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {draft.hiddenTestCases.map((testCase, index) => (
                    <TestCasePreview key={`hidden-${index}`} testCase={testCase} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <aside className="space-y-4 rounded-md border border-border bg-card p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Slug</p>
              <p className="mt-1 break-all font-mono-code text-sm">{draft.slug}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Constraints</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {draft.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CreateProblem() {
  const navigate = useNavigate();
  const [jsonSource, setJsonSource] = useState("");
  const [importErrors, setImportErrors] = useState<JsonImportFieldError[]>([]);
  const [importedDrafts, setImportedDrafts] = useState<ImportedProblemDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [jsonStructureCopied, setJsonStructureCopied] = useState(false);

  const selectedDraft = importedDrafts.find((item) => item.id === selectedDraftId)?.draft ?? null;
  const approvedCount = importedDrafts.filter((item) => item.approved).length;
  const totalTestCases = useMemo(
    () =>
      importedDrafts.reduce(
        (total, item) => total + item.draft.sampleTestCases.length + item.draft.hiddenTestCases.length,
        0,
      ),
    [importedDrafts],
  );

  const publishMutation = useMutation({
    mutationFn: (data: ProblemEditorData) => problemsApi.create(toProblemWritePayload(data, "Published"), "/faculty/create-problem"),
    onSuccess: (response) => {
      navigate(`/faculty/problems/${response.problem.id}`);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to publish problem");
    },
  });

  const draftMutation = useMutation({
    mutationFn: (data: ProblemEditorData) => problemsApi.create(toProblemWritePayload(data, "Draft"), "/faculty/create-problem"),
    onSuccess: (response) => {
      navigate(`/faculty/problems/${response.problem.id}`);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save draft");
    },
  });

  const importDraftMutation = useMutation({
    mutationFn: (payload: unknown) => problemsApi.importDraft(payload, "/faculty/create-problem"),
    onSuccess: (response) => {
      const drafts = response.drafts.map((draft, index) => ({
        id: `${draft.slug}-${index}`,
        draft: toProblemEditorDataFromJsonDraft(draft),
        approved: false,
      }));
      setImportedDrafts(drafts);
      setSelectedDraftId(null);
      setImportErrors([]);
      toast.success(`${drafts.length} problem${drafts.length === 1 ? "" : "s"} ready for review`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const details = (error.details as {
          details?: {
            fieldIssues?: JsonImportFieldError[];
            fieldErrors?: Record<string, string[]>;
            formErrors?: string[];
          };
        })?.details;
        if (details?.fieldIssues?.length) {
          setImportErrors(details.fieldIssues);
          return;
        }

        const errors = Object.entries(details?.fieldErrors ?? {}).flatMap(([path, messages]) =>
          messages.map((message) => ({ path, message })),
        );
        const formErrors = (details?.formErrors ?? []).map((message) => ({ path: "json", message }));
        setImportErrors(errors.length > 0 || formErrors.length > 0 ? [...errors, ...formErrors] : [{ path: "json", message: error.message }]);
        return;
      }

      setImportErrors([{ path: "json", message: error instanceof Error ? error.message : "Validation failed" }]);
    },
  });

  const saveApprovedMutation = useMutation({
    mutationFn: async (drafts: ProblemEditorData[]) => {
      const saved = await Promise.all(
        drafts.map((draft) => problemsApi.create(toProblemWritePayload(draft, "Published"), "/faculty/create-problem")),
      );
      return saved.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} problem${count === 1 ? "" : "s"} saved`);
      navigate("/faculty/problems");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save approved problems");
    },
  });

  const importJsonDraft = () => {
    try {
      const parsed = JSON.parse(jsonSource);
      importDraftMutation.mutate(parsed);
    } catch (error) {
      setImportErrors([{ path: "json", message: error instanceof Error ? error.message : "Invalid JSON" }]);
    }
  };

  const copyJsonStructure = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exampleJson);
      } else {
        const clipboardArea = document.createElement("textarea");
        clipboardArea.value = exampleJson;
        clipboardArea.style.position = "fixed";
        clipboardArea.style.opacity = "0";
        document.body.appendChild(clipboardArea);
        clipboardArea.select();
        document.execCommand("copy");
        document.body.removeChild(clipboardArea);
      }
      setJsonStructureCopied(true);
      toast.success("Ideal JSON structure copied");
      window.setTimeout(() => setJsonStructureCopied(false), 1600);
    } catch {
      toast.error("Could not copy JSON structure");
    }
  };

  const toggleApproved = (id: string, checked: boolean) => {
    setImportedDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, approved: checked } : item)),
    );
  };

  const saveApprovedProblems = () => {
    const approvedDrafts = importedDrafts.filter((item) => item.approved).map((item) => item.draft);
    if (approvedDrafts.length === 0) {
      toast.error("Select at least one reviewed problem");
      return;
    }

    saveApprovedMutation.mutate(approvedDrafts);
  };

  return (
    <AppLayout>
      <div className="container flex min-h-[calc(100vh-5rem)] max-w-[1680px] flex-col gap-6 py-6">
        <section className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex min-h-[640px] flex-col gap-5 p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
                  <FileJson className="h-5 w-5" /> Import Problems JSON
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Paste one problem object or an array of problems.</p>
              </div>
              <Button type="button" variant="outline" onClick={copyJsonStructure}>
                {jsonStructureCopied ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {jsonStructureCopied ? "Copied Structure" : "Copy JSON Structure"}
              </Button>
            </div>

            <div className="relative min-h-[420px] flex-1">
              <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2 rounded-none border border-border bg-card/95 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-card">
                <FileJson className="h-3.5 w-3.5 text-accent" />
                Insert JSON here
              </div>
              <Textarea
                value={jsonSource}
                onChange={(event) => setJsonSource(event.target.value)}
                placeholder="Paste the copied JSON structure here and replace the values with your problem data."
                className="h-full min-h-[420px] resize-none overflow-auto pt-12 font-mono-code text-xs leading-5 transition-shadow focus-visible:shadow-elevated"
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <FieldErrors errors={importErrors} />
                {importErrors.length === 0 && (
                  <p className="rounded-md border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
                    Use the copied structure as a template, then validate before approving imported problems.
                  </p>
                )}
              </div>
              <Button type="button" onClick={importJsonDraft} disabled={importDraftMutation.isPending || !jsonSource.trim()}>
                <Upload className="mr-2 h-4 w-4" /> {importDraftMutation.isPending ? "Validating..." : "Validate JSON"}
              </Button>
            </div>
          </Card>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Card className="space-y-4 p-5 shadow-card">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-display text-lg font-bold">Import Status</h2>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center xl:grid-cols-1 xl:text-left">
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-bold">{importedDrafts.length}</p>
                  <p className="text-xs text-muted-foreground">Validated</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-bold">{approvedCount}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-bold">{totalTestCases}</p>
                  <p className="text-xs text-muted-foreground">Test cases</p>
                </div>
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={saveApprovedProblems}
                  disabled={saveApprovedMutation.isPending || approvedCount === 0}
                >
                  <Save className="mr-2 h-4 w-4" /> {saveApprovedMutation.isPending ? "Saving..." : "Save Approved Problems"}
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Approved imports are saved as published problems. Leave items unchecked until their details are reviewed.
                </p>
              </div>
            </Card>
          </aside>
        </section>

        {importedDrafts.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Review Imported Problems</h2>
              <Badge variant="outline">{approvedCount} of {importedDrafts.length} approved</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {importedDrafts.map((item, index) => (
                <Card key={item.id} className="card-interactive space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Problem {index + 1}</p>
                      <h3 className="mt-1 truncate font-display text-lg font-bold">{item.draft.title}</h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{item.draft.topic}</p>
                    </div>
                    <Badge variant={item.approved ? "default" : "outline"}>
                      {item.approved ? "Approved" : "Pending"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{item.draft.difficulty}</p>
                      <p className="text-xs text-muted-foreground">Difficulty</p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{item.draft.sampleTestCases.length}</p>
                      <p className="text-xs text-muted-foreground">Samples</p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{item.draft.hiddenTestCases.length}</p>
                      <p className="text-xs text-muted-foreground">Hidden</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-md border border-border p-3">
                    <Checkbox
                      id={`approve-${item.id}`}
                      checked={item.approved}
                      onCheckedChange={(value) => toggleApproved(item.id, value === true)}
                    />
                    <Label htmlFor={`approve-${item.id}`} className="text-sm font-medium">
                      Reviewed and approved
                    </Label>
                  </div>

                  <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedDraftId(item.id)}>
                    <Eye className="mr-2 h-4 w-4" /> View Problem Details
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        <Accordion type="single" collapsible className="rounded-md border border-border px-5">
          <AccordionItem value="manual-create" className="border-b-0">
            <AccordionTrigger className="font-display text-xl font-bold">Create One Problem Manually</AccordionTrigger>
            <AccordionContent>
              <ProblemEditorForm
                heading="Create New Problem"
                description="Design a meaningful challenge for your students."
                submitLabel="Publish"
                submitMessage="Problem published!"
                draftMessage="Draft saved"
                onSubmit={async (data) => publishMutation.mutateAsync(data)}
                onSaveDraft={async (data) => draftMutation.mutateAsync(data)}
                isSubmitting={publishMutation.isPending}
                isSavingDraft={draftMutation.isPending}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <ProblemDetailDialog draft={selectedDraft} open={Boolean(selectedDraft)} onOpenChange={(open) => !open && setSelectedDraftId(null)} />
    </AppLayout>
  );
}

