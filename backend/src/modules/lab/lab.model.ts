import type { SqlCheck } from "../../execution/sql/sql-checks";
import type { SqlTableSnapshot } from "../../execution/sql/sql-executor";
import type { HarnessSpec } from "../../execution/harness/contract";
import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage, ProblemLifecycleState } from "../../shared/types/domain";

/**
 * Labs — a subject-scoped, numbered catalogue of "experiments" (a college lab manual), for two
 * subjects to start: DSA (coding experiments, judged on Judge0 like every other coding surface)
 * and DBMS (SQL experiments, run against a real isolated MySQL and graded by result-set match).
 *
 * A Lab is self-paced: a student opens it and solves experiments in any order across the term.
 * (A later phase lets faculty also push a subset as a scheduled, assigned, graded session.)
 */

export type LabKind = "DSA" | "DBMS";
export type LabExperimentKind = "coding" | "sql";

export interface LabTestCase {
  input: string;
  output: string;
  explanation?: string;
}

interface LabExperimentBase {
  id: string;
  /** 1-based position shown to students, e.g. "Experiment 3". */
  number: number;
  title: string;
  /** The task / problem statement ("aim" in a lab manual). */
  aim: string;
  points: number;
}

/** A coding experiment — embeds its problem content, mirroring the class-test coding question. */
export interface LabCodingExperiment extends LabExperimentBase {
  kind: "coding";
  difficulty: Difficulty;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: LabTestCase[];
  hiddenTestCases: LabTestCase[];
  supportedLanguages: ExecutableLanguage[];
  harness?: HarnessSpec;
}

/**
 * How a SQL experiment is worked and judged.
 *
 * - `query`  — one statement against a seeded schema, graded by comparing result grids. This is a
 *   "write the SELECT" experiment: syllabus practicals 1, 2, 7, 8, 9.
 * - `script` — a multi-statement script, usually against an empty database, judged by structural
 *   checks over whatever the student built. This is an application experiment: practicals 3, 4, 5,
 *   6 and the mini-projects, where the student designs their own schema and no two correct answers
 *   share table names.
 */
export type LabSqlMode = "query" | "script";

/** A SQL experiment — the schema is shown to students; the reference query is not. */
export interface LabSqlExperiment extends LabExperimentBase {
  kind: "sql";
  /** Defaults to "query" so experiments authored before script mode existed keep their behaviour. */
  sqlMode: LabSqlMode;
  /** DDL + seed data. Safe to show students — it is the setup, not the answer. Empty for a
   *  "design your own database" experiment, which starts from an empty schema. */
  schemaSql: string;
  /** The reference query. Never sent to a student; the expected result is derived from it. Empty
   *  in script mode, where there is no single reference answer. */
  solutionSql: string;
  /** Whether row order is part of the answer (the task required an ORDER BY). */
  ordered: boolean;
  /**
   * The tables the seed produces, computed once when the experiment is saved.
   *
   * Server-written only — never accepted from a request, so it cannot disagree with `schemaSql`.
   * Students read this instead of the DDL, and precomputing it means a whole batch opening the same
   * experiment costs no sandbox runs at all.
   */
  schemaPreview?: SqlTableSnapshot[];
  /** Script mode only. Structural conditions the student's finished database must satisfy. The
   *  labels are shown to the student up front, so they double as the rubric. */
  checks?: SqlCheck[];
  /** Script mode only. True when the experiment is graded by the faculty with no automatic verdict. */
  facultyMarked?: boolean;
}

export type LabExperiment = LabCodingExperiment | LabSqlExperiment;

export interface LabRecord {
  id: string;
  title: string;
  /** Free-text course name, e.g. "Data Structures Lab". */
  subject: string;
  kind: LabKind;
  department: Department | null;
  semester: number | null;
  description: string | null;
  lifecycleState: ProblemLifecycleState;
  /**
   * When true this lab can only be opened while a teacher is running a live attendance session for
   * it — there is no self-paced access at all. Off by default, which is the existing behaviour.
   */
  requiresAttendance: boolean;
  experiments: LabExperiment[];
  createdBy: string;
  createdByRole: UserRole;
  /** Faculty the creator delegated management to, mirroring class-test/contest delegation. */
  managerEmails: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One student's latest attempt at one SQL experiment. Kept per (lab, experiment, student); `passed`
 * is sticky so a later wrong query never un-solves an experiment, and `awardedPoints` keeps the best.
 */
export interface LabSqlSubmissionRecord {
  id: string;
  labId: string;
  experimentId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  studentSql: string;
  status: string;
  passed: boolean;
  awardedPoints: number;
  runtimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

// --- student-facing shapes ---------------------------------------------------

/**
 * An experiment as a student sees it — never the SQL reference query or the hidden coding tests.
 * Built field by field so no answer can leak by spreading a record.
 */
export interface StudentLabExperiment {
  id: string;
  kind: LabExperimentKind;
  number: number;
  title: string;
  aim: string;
  points: number;
  // sql
  sqlMode?: LabSqlMode;
  schemaSql?: string;
  ordered?: boolean;
  schemaPreview?: SqlTableSnapshot[];
  /** Rubric labels only — a student sees what will be verified, not how it is verified. */
  checkLabels?: string[];
  // coding
  difficulty?: Difficulty;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: LabTestCase[];
  supportedLanguages?: ExecutableLanguage[];
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
}

export interface StudentLabSummary {
  id: string;
  title: string;
  subject: string;
  kind: LabKind;
  experimentCount: number;
  totalPoints: number;
}

export interface StudentLabDetail extends StudentLabSummary {
  description: string | null;
  experiments: StudentLabExperiment[];
  /** Per-experiment solve state for this student. */
  progress: { experimentId: string; passed: boolean; awardedPoints: number; status: string }[];
}

// --- derivations -------------------------------------------------------------

export function labTotalPoints(experiments: readonly LabExperiment[]): number {
  return experiments.reduce((total, experiment) => total + Math.max(0, experiment.points), 0);
}

export function toStudentExperiment(experiment: LabExperiment): StudentLabExperiment {
  if (experiment.kind === "sql") {
    return {
      id: experiment.id,
      kind: "sql",
      number: experiment.number,
      title: experiment.title,
      aim: experiment.aim,
      points: experiment.points,
      sqlMode: experiment.sqlMode ?? "query",
      schemaSql: experiment.schemaSql,
      ordered: experiment.ordered,
      schemaPreview: experiment.schemaPreview,
      // Labels only. A student should know what is being verified — it is the rubric — but the
      // check bodies (a faculty verification query, an exact table name) stay server-side.
      checkLabels: experiment.checks?.map((check) => check.label),
    };
  }
  return {
    id: experiment.id,
    kind: "coding",
    number: experiment.number,
    title: experiment.title,
    aim: experiment.aim,
    points: experiment.points,
    difficulty: experiment.difficulty,
    constraints: experiment.constraints,
    inputFormat: experiment.inputFormat,
    outputFormat: experiment.outputFormat,
    // Samples only — hidden coding tests are never sent to a student.
    sampleTestCases: experiment.sampleTestCases,
    supportedLanguages: experiment.supportedLanguages,
    timeLimitSeconds: experiment.timeLimitSeconds,
    memoryLimitMb: experiment.memoryLimitMb,
  };
}

/** Whether a language may be used for a coding experiment. Enforced server-side, not just in the UI. */
export function isLanguageAllowedForExperiment(experiment: LabCodingExperiment, language: string): boolean {
  return experiment.supportedLanguages.includes(language as ExecutableLanguage);
}

/** Whether a student in this department/semester may see this lab. */
export function isLabVisibleToStudent(
  lab: LabRecord,
  student: { department: Department | null; semester: number | null },
): boolean {
  if (lab.lifecycleState !== "Published") {
    return false;
  }
  if (lab.department !== null && student.department !== null && lab.department !== student.department) {
    return false;
  }
  if (lab.semester !== null && student.semester !== null && lab.semester !== student.semester) {
    return false;
  }
  return true;
}
