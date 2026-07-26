import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Loader2, MessageSquareHeart, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi, userApi } from "@/api/services";
import type { ContestFeedbackPayload } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RatingKey =
  | "navigationEase"
  | "visualDesignRating"
  | "editorResponsiveness"
  | "compilationLag"
  | "errorMessageClarity"
  | "recommendLikelihood";

interface FormState {
  name: string;
  uid: string;
  navigationEase: number;
  visualDesignRating: number;
  interfaceReadability: "" | "Yes" | "No" | "Need improvement";
  editorResponsiveness: number;
  compilationLag: number;
  errorMessageClarity: number;
  problemStatementClarity: "" | "Yes" | "No" | "Needs improvement";
  bugsOrBrokenLinks: string;
  oneNewFeature: string;
  recommendLikelihood: number;
  overallRating: number;
  skipOverall: boolean;
}

const DEFAULT_RATING = 3;

const initialState: FormState = {
  name: "",
  uid: "",
  navigationEase: DEFAULT_RATING,
  visualDesignRating: DEFAULT_RATING,
  interfaceReadability: "",
  editorResponsiveness: DEFAULT_RATING,
  compilationLag: DEFAULT_RATING,
  errorMessageClarity: DEFAULT_RATING,
  problemStatementClarity: "",
  bugsOrBrokenLinks: "",
  oneNewFeature: "",
  recommendLikelihood: DEFAULT_RATING,
  overallRating: 4,
  skipOverall: false,
};

const RATING_HINTS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

/** Each animated question card, staggered as the form loads. Motion is disabled under reduced-motion. */
function QuestionCard({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="animate-fade-in border border-border bg-background p-5 shadow-none transition-shadow duration-300 hover:shadow-card motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms`, animationFillMode: "backwards" }}
    >
      <Label className="text-sm font-semibold leading-snug">{title}</Label>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** 1–5 slider with a live value badge that pops on change. */
function RatingSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-4", disabled && "opacity-50")}>
      <Slider
        value={[value]}
        min={1}
        max={5}
        step={1}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0] ?? value)}
        aria-label="Rating from 1 to 5"
        className="flex-1"
      />
      <div className="flex min-w-[5.5rem] flex-col items-center">
        <Badge
          key={value}
          className="animate-fade-in bg-accent px-2.5 py-0.5 font-mono-code text-sm text-accent-foreground hover:bg-accent motion-reduce:animate-none"
        >
          {value} / 5
        </Badge>
        <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {RATING_HINTS[value]}
        </span>
      </div>
    </div>
  );
}

export default function ContestFeedback() {
  const { id = "" } = useParams();
  const pathname = `/student/contests/${id}/feedback`;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(initialState);
  const [showErrors, setShowErrors] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const prefilledRef = useRef(false);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => userApi.me(pathname),
    enabled: Boolean(id),
  });

  const statusQuery = useQuery({
    queryKey: ["contest-feedback-status", id],
    queryFn: () => contestsApi.getFeedbackStatus(id, pathname),
    enabled: Boolean(id),
  });

  // Prefill name/UID from the signed-in user once, leaving them editable afterwards.
  useEffect(() => {
    if (prefilledRef.current || !meQuery.data) {
      return;
    }
    prefilledRef.current = true;
    setForm((current) => ({
      ...current,
      name: current.name || meQuery.data.user.name || "",
      uid: current.uid || meQuery.data.user.uid || "",
    }));
  }, [meQuery.data]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submitMutation = useMutation({
    mutationFn: (payload: ContestFeedbackPayload) => contestsApi.submitFeedback(id, payload, pathname),
    onSuccess: async () => {
      toast.success("Thanks! Your feedback unlocks your results.");
      setJustSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: ["contest-detail", id] });
      // Brief success beat before returning to the now-unlocked results.
      window.setTimeout(() => navigate(`/student/contests/${id}`), 900);
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Failed to submit feedback");
    },
  });

  const errors = useMemo(() => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (!form.uid.trim()) next.uid = "UID is required";
    if (!form.interfaceReadability) next.interfaceReadability = "Please select an option";
    if (!form.problemStatementClarity) next.problemStatementClarity = "Please select an option";
    if (!form.bugsOrBrokenLinks.trim()) next.bugsOrBrokenLinks = "Please share a response (type 'None' if none)";
    if (!form.oneNewFeature.trim()) next.oneNewFeature = "Please share a response";
    return next;
  }, [form]);

  if (!id) {
    return <Navigate to="/student/contests" replace />;
  }

  // Already given feedback for this contest → results are unlocked, so send them back.
  if (statusQuery.data?.submitted && !justSubmitted) {
    return <Navigate to={`/student/contests/${id}`} replace />;
  }

  if (statusQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading feedback form...</div>
      </AppLayout>
    );
  }

  if (statusQuery.isError) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">
          {(statusQuery.error as Error)?.message || "Failed to load the feedback form"}
        </div>
      </AppLayout>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }

    submitMutation.mutate({
      name: form.name.trim(),
      uid: form.uid.trim(),
      navigationEase: form.navigationEase,
      visualDesignRating: form.visualDesignRating,
      interfaceReadability: form.interfaceReadability as "Yes" | "No" | "Need improvement",
      editorResponsiveness: form.editorResponsiveness,
      compilationLag: form.compilationLag,
      errorMessageClarity: form.errorMessageClarity,
      problemStatementClarity: form.problemStatementClarity as "Yes" | "No" | "Needs improvement",
      bugsOrBrokenLinks: form.bugsOrBrokenLinks.trim(),
      oneNewFeature: form.oneNewFeature.trim(),
      recommendLikelihood: form.recommendLikelihood,
      overallRating: form.skipOverall ? null : form.overallRating,
    });
  };

  const ratingQuestions: { key: RatingKey; title: string }[] = [
    { key: "navigationEase", title: "How easy was it to navigate the platform and find problems?" },
    { key: "visualDesignRating", title: "How would you rate the visual design and layout?" },
    { key: "editorResponsiveness", title: "How would you rate the responsiveness of the built-in code editor?" },
    { key: "compilationLag", title: "Did you experience any lag/delays during code compilation/execution?" },
    { key: "errorMessageClarity", title: "Are the error messages and test case outputs clear and helpful?" },
    { key: "recommendLikelihood", title: "How likely are you to recommend the TCET coding platform to a peer?" },
  ];

  const errorText = (key: keyof FormState) =>
    showErrors && errors[key] ? <p className="mt-2 text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <AppLayout>
      <div className="container max-w-3xl py-8">
        <Link
          to={`/student/contests/${id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
        >
          <ChevronLeft className="h-4 w-4" /> Back to contest
        </Link>

        {/* Hero */}
        <Card className="animate-fade-in overflow-hidden border border-border bg-gradient-to-br from-accent/10 via-background to-background p-8 shadow-card motion-reduce:animate-none">
          <div className="flex items-center gap-2 text-accent">
            <MessageSquareHeart className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">One quick step</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold">Share your feedback</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Tell us how the platform felt during this contest. It takes under a minute, and submitting
            it unlocks your Report Card and the published standings.
          </p>
        </Card>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Identity */}
          <QuestionCard index={0} title="Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="feedback-name" className="text-xs text-muted-foreground">
                  Name
                </Label>
                <Input
                  id="feedback-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Your full name"
                  className="mt-1.5"
                />
                {errorText("name")}
              </div>
              <div>
                <Label htmlFor="feedback-uid" className="text-xs text-muted-foreground">
                  UID
                </Label>
                <Input
                  id="feedback-uid"
                  value={form.uid}
                  onChange={(event) => setField("uid", event.target.value)}
                  placeholder="Your UID"
                  className="mt-1.5"
                />
                {errorText("uid")}
              </div>
            </div>
          </QuestionCard>

          {ratingQuestions.slice(0, 2).map((question, offset) => (
            <QuestionCard key={question.key} index={1 + offset} title={question.title}>
              <RatingSlider
                value={form[question.key]}
                onChange={(value) => setField(question.key, value)}
              />
            </QuestionCard>
          ))}

          {/* Interface readability select */}
          <QuestionCard
            index={3}
            title="Is the text, code editor, and overall interface comfortable to read?"
          >
            <Select
              value={form.interfaceReadability}
              onValueChange={(value) => setField("interfaceReadability", value as FormState["interfaceReadability"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
                <SelectItem value="Need improvement">Need improvement</SelectItem>
              </SelectContent>
            </Select>
            {errorText("interfaceReadability")}
          </QuestionCard>

          {ratingQuestions.slice(2, 5).map((question, offset) => (
            <QuestionCard key={question.key} index={4 + offset} title={question.title}>
              <RatingSlider
                value={form[question.key]}
                onChange={(value) => setField(question.key, value)}
              />
            </QuestionCard>
          ))}

          {/* Problem statement clarity select */}
          <QuestionCard
            index={7}
            title="Are the problem statements and constraints easy to understand?"
          >
            <Select
              value={form.problemStatementClarity}
              onValueChange={(value) =>
                setField("problemStatementClarity", value as FormState["problemStatementClarity"])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
                <SelectItem value="Needs improvement">Needs improvement</SelectItem>
              </SelectContent>
            </Select>
            {errorText("problemStatementClarity")}
          </QuestionCard>

          <QuestionCard index={8} title="Did you encounter any bugs or broken links? If yes, describe.">
            <Textarea
              value={form.bugsOrBrokenLinks}
              onChange={(event) => setField("bugsOrBrokenLinks", event.target.value)}
              placeholder="Describe anything that broke, or type 'None'."
              rows={3}
            />
            {errorText("bugsOrBrokenLinks")}
          </QuestionCard>

          <QuestionCard index={9} title="If you could add ONE new feature, what would it be?">
            <Textarea
              value={form.oneNewFeature}
              onChange={(event) => setField("oneNewFeature", event.target.value)}
              placeholder="The one thing you'd love to see next."
              rows={3}
            />
            {errorText("oneNewFeature")}
          </QuestionCard>

          {/* Recommend likelihood rating */}
          <QuestionCard index={10} title={ratingQuestions[5].title}>
            <RatingSlider
              value={form.recommendLikelihood}
              onChange={(value) => setField("recommendLikelihood", value)}
            />
          </QuestionCard>

          {/* Optional overall rating */}
          <QuestionCard index={11} title="Overall rating of the platform (optional)">
            <RatingSlider
              value={form.overallRating}
              onChange={(value) => setField("overallRating", value)}
              disabled={form.skipOverall}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={form.skipOverall}
                onCheckedChange={(checked) => setField("skipOverall", checked === true)}
              />
              Skip the overall rating
            </label>
          </QuestionCard>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              size="lg"
              className="min-w-[12rem] bg-accent text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98]"
              disabled={submitMutation.isPending || justSubmitted}
            >
              {justSubmitted ? (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5 animate-fade-in motion-reduce:animate-none" />
                  Submitted
                </>
              ) : submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Submit &amp; unlock results
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Success beat overlay */}
      {justSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 animate-fade-in motion-reduce:animate-none">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <p className="font-display text-lg font-semibold">Feedback submitted</p>
            <p className="text-sm text-muted-foreground">Unlocking your results…</p>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
