import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import { env } from "../../config/env";
import { GENERIC_PRODUCTION_ERROR_MESSAGE } from "../../shared/errors/public-messages";
import { logServerError } from "../../shared/logging/error-logger";
import type { ContestRecord } from "../contest/contest.model";
import type {
  ContestAttemptRepository,
  ContestProctoringRepository,
  ContestRegistrationRepository,
  ContestRepository,
} from "../contest/contest.repository";
import type { SubmissionRepository } from "../submission/submission.repository";
import type { AiReportGenerator, AiRuntimeStatus } from "./ai/ollama-client";
import { validateNarrativeNumbers } from "./ai/grounding";
import {
  buildContestAnalytics,
  hashMetrics,
  toContestReportResponse,
  type ContestAnalytics,
  type ContestReportRecord,
  type ContestReportResponse,
} from "./report.model";
import type { ContestReportRepository } from "./report.repository";

export interface ReportServiceDependencies {
  contestRepository: ContestRepository;
  contestAttemptRepository: ContestAttemptRepository;
  contestProctoringRepository: ContestProctoringRepository;
  contestRegistrationRepository: ContestRegistrationRepository;
  submissionRepository: SubmissionRepository;
  contestReportRepository: ContestReportRepository;
  aiReportGenerator: AiReportGenerator;
  staleLockMs: number;
  now: () => Date;
}

export interface ContestReportEnvelope {
  report: ContestReportResponse | null;
  aiRuntime: PublicAiRuntimeStatus;
}

export interface PublicAiRuntimeStatus {
  available: boolean;
  message: string | null;
}

export function toPublicAiRuntimeStatus(status: AiRuntimeStatus): PublicAiRuntimeStatus {
  return {
    available: status.available,
    message: status.available ? null : "AI not reachable",
  };
}

export interface ReportService {
  getReport(user: AuthenticatedUser, contestId: string): Promise<ContestReportEnvelope>;
  getReadyReport(user: AuthenticatedUser, contestId: string): Promise<ContestReportResponse>;
  getMetrics(user: AuthenticatedUser, contestId: string): Promise<ContestAnalytics>;
  generateReport(
    user: AuthenticatedUser,
    contestId: string,
    options: { force?: boolean },
  ): Promise<ContestReportResponse>;
}

/**
 * Mirrors `canManageContest` in contest.service: an owner or a delegated co-manager. Kept as a local
 * copy rather than exported from contest.service to avoid a circular import between the two modules.
 */
function canManageContest(user: AuthenticatedUser, contest: ContestRecord): boolean {
  return contest.createdBy === user.email || (contest.managerEmails ?? []).includes(user.email);
}

export function createReportService(dependencies: ReportServiceDependencies): ReportService {
  const {
    contestRepository,
    contestAttemptRepository,
    contestProctoringRepository,
    contestRegistrationRepository,
    submissionRepository,
    contestReportRepository,
    aiReportGenerator,
    staleLockMs,
    now,
  } = dependencies;

  // 404 rather than 403 for an unowned contest, matching the existing contest endpoints: faculty
  // should not be able to probe for the existence of another department's contests.
  async function loadManagedContest(user: AuthenticatedUser, contestId: string): Promise<ContestRecord> {
    const contest = await contestRepository.getById(contestId);
    if (!contest || !canManageContest(user, contest)) {
      throw new AppError(404, "Contest not found");
    }
    return contest;
  }

  /**
   * Nearly every metric here is downstream of final scoring, and scoring only happens at publish
   * (`updateContestResults`). Before that, `attempt.score` is 0/null and question states are
   * unfinalised, so a report would be confidently wrong rather than merely incomplete.
   */
  function ensureResultsPublished(contest: ContestRecord): void {
    if (!contest.resultsPublished) {
      throw new AppError(
        409,
        "Publish the contest results before generating a report. Attempts are only graded at publish time, so analytics would be incomplete until then.",
      );
    }
  }

  async function computeMetrics(contest: ContestRecord): Promise<ContestAnalytics> {
    // Exactly four reads, joined in memory. Deliberately not routed through getStandings, which
    // issues one user lookup per attempt.
    const [attempts, submissions, registrations] = await Promise.all([
      contestAttemptRepository.listByContest(contest.id),
      // listForAnalytics projects code/stdout/stderr away at the database. No other submission read
      // path is used in this module.
      submissionRepository.listForAnalytics({ contestId: contest.id, sourceType: "contest_coding" }),
      contestRegistrationRepository.listByContest(contest.id),
    ]);

    // Proctoring events are stored per attempt, so this is one query per attempt. Attempt counts are
    // classroom-scale (tens to low hundreds), and the alternative is a new repository method.
    const eventBatches = await Promise.all(
      attempts.map((attempt) => contestProctoringRepository.listByAttempt(attempt.id)),
    );

    return buildContestAnalytics({
      contest,
      attempts,
      submissions,
      proctoringEvents: eventBatches.flat(),
      registeredCount: registrations.length,
      now: now(),
    });
  }

  /**
   * Runs after the HTTP response has already been sent, so it must never throw: an unhandled
   * rejection here would take the process down. Every path writes a terminal state.
   */
  async function runGeneration(contest: ContestRecord, claim: ContestReportRecord): Promise<void> {
    try {
      const metrics = await computeMetrics(contest);
      const generated = await aiReportGenerator.generate(metrics);
      const grounded = validateNarrativeNumbers(generated.narrative, metrics);

      // If grounding rejected every section, nothing of the model's survived — label the report
      // TEMPLATE so faculty are not told a model wrote text it did not.
      const survivedSections = grounded.rejectedSections.length < 5;
      const usedAi = generated.usedAi && survivedSections;

      await contestReportRepository.save({
        ...claim,
        status: "READY",
        source: usedAi ? "AI" : "TEMPLATE",
        metrics,
        narrative: grounded.narrative,
        warnings: [...generated.warnings, ...grounded.warnings],
        modelId: usedAi ? generated.modelId : null,
        promptVersion: generated.promptVersion,
        metricsHash: hashMetrics(metrics),
        generatedAt: now(),
        failureReason: null,
        updatedAt: now(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Report generation failed";
      logServerError("Contest report generation failed", error, { contestId: contest.id });

      // Best effort: try to keep whatever metrics we can so the report is not a dead end.
      let metrics: ContestAnalytics | null = null;
      try {
        metrics = await computeMetrics(contest);
      } catch {
        metrics = null;
      }

      await contestReportRepository
        .save({
          ...claim,
          status: "FAILED",
          source: "TEMPLATE",
          metrics,
          narrative: null,
          warnings: [],
          metricsHash: metrics ? hashMetrics(metrics) : null,
          generatedAt: null,
          failureReason: env.NODE_ENV === "production" ? GENERIC_PRODUCTION_ERROR_MESSAGE : reason,
          updatedAt: now(),
        })
        .catch((saveError) => {
          logServerError("Failed to persist failed contest report", saveError, {
            contestId: contest.id,
          });
        });
    }
  }

  return {
    async getReport(user, contestId) {
      await loadManagedContest(user, contestId);
      const [record, aiRuntime] = await Promise.all([
        contestReportRepository.getByContestId(contestId),
        aiReportGenerator.getStatus(),
      ]);

      return {
        report: record ? toContestReportResponse(record) : null,
        aiRuntime: toPublicAiRuntimeStatus(aiRuntime),
      };
    },

    async getReadyReport(user, contestId) {
      const contest = await loadManagedContest(user, contestId);
      ensureResultsPublished(contest);
      const record = await contestReportRepository.getByContestId(contestId);

      if (!record) {
        throw new AppError(404, "No report has been generated for this contest.");
      }
      if (record.status === "GENERATING") {
        throw new AppError(409, "The report is still being generated. Try again shortly.");
      }
      if (record.status === "FAILED" || !record.metrics) {
        throw new AppError(
          409,
          env.NODE_ENV === "production"
            ? GENERIC_PRODUCTION_ERROR_MESSAGE
            : record.failureReason ?? "The report is not available for PDF export.",
        );
      }

      return toContestReportResponse(record);
    },

    async getMetrics(user, contestId) {
      const contest = await loadManagedContest(user, contestId);
      ensureResultsPublished(contest);
      return computeMetrics(contest);
    },

    async generateReport(user, contestId, options) {
      const contest = await loadManagedContest(user, contestId);
      ensureResultsPublished(contest);

      const existing = await contestReportRepository.getByContestId(contestId);

      // A finished report is returned as-is unless the caller explicitly asked to regenerate, so
      // opening the tab never silently re-runs the model.
      if (existing && existing.status === "READY" && !options.force) {
        return toContestReportResponse(existing);
      }

      const claim = await contestReportRepository.claimForGeneration({
        contestId,
        generatedByEmail: user.email,
        now: now(),
        staleLockMs,
      });

      if (!claim) {
        // Another generation is already in flight. Report its state rather than starting a second.
        const inFlight = await contestReportRepository.getByContestId(contestId);
        if (inFlight) {
          return toContestReportResponse(inFlight);
        }
        throw new AppError(409, "A report is already being generated for this contest.");
      }

      // Intentionally not awaited: generation takes far longer than an HTTP request should.
      // The client polls GET until the status leaves GENERATING.
      void runGeneration(contest, claim);

      return toContestReportResponse(claim);
    },
  };
}
