import type { HarnessSpec } from "../../execution/harness/contract";
import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage, ProblemLifecycleState } from "../../shared/types/domain";
import { deriveDivisionFromUid } from "../../shared/utils/uid-department";
import type { UserRecord } from "../user/user.model";

/**
 * Class Test: a synchronised, closed-book, proctored assessment for one specific group of
 * students.
 *
 * Deliberately *not* a contest. There is no ranking anywhere in this module — no standings,
 * no rank, no leaderboard, no rating. A student only ever sees their own result, and only
 * after faculty publish it. Anything that would order students by score does not belong here.
 */

export type ClassTestQuestionType = "MCQ" | "MSQ" | "Coding" | "ShortAnswer" | "Crossword";

/** Marks come from the judge for the first three; a human awards them for ShortAnswer. */
export type ClassTestScoringMode = "AUTO" | "MANUAL";

export interface ClassTestTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface ClassTestQuestionBase {
  id: string;
  type: ClassTestQuestionType;
  points: number;
  /**
   * Reserved for paper sets (roll ending 1/6 -> Set A, ...). Unset today means "every student
   * gets this question"; adding sets later is a filter on this field, not a migration.
   */
  setLabel?: string;
}

export interface ClassTestMcqQuestion extends ClassTestQuestionBase {
  type: "MCQ";
  statement: string;
  options: string[];
  correctAnswer: string;
}

export interface ClassTestMsqQuestion extends ClassTestQuestionBase {
  type: "MSQ";
  statement: string;
  options: string[];
  correctAnswers: string[];
}

export interface ClassTestCodingQuestion extends ClassTestQuestionBase {
  type: "Coding";
  problemTitle: string;
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ClassTestTestCase[];
  hiddenTestCases: ClassTestTestCase[];
  /**
   * Languages this question may be answered in — a DSA question can be restricted to Java
   * only, or C/C++ only. Never empty. Unlike contests, this is enforced server-side at run and
   * submit time, so it cannot be bypassed by calling the API directly.
   */
  supportedLanguages: ExecutableLanguage[];
  harness?: HarnessSpec;
}

export interface ClassTestShortAnswerQuestion extends ClassTestQuestionBase {
  type: "ShortAnswer";
  statement: string;
  /** Guidance shown to the student, e.g. 3-4 sentences. */
  expectedSentences?: number;
  /** Faculty-only reference while grading. Never included in a student-facing response. */
  modelAnswer?: string;
}

/** One word and the clue that defines it — the only thing faculty author for a crossword. */
export interface CrosswordEntry {
  answer: string;
  clue: string;
}

export interface ClassTestCrosswordQuestion extends ClassTestQuestionBase {
  type: "Crossword";
  /** Instructions shown above the grid, e.g. "Solve the crossword." */
  statement: string;
  /**
   * The words and their clues. Never a grid — the grid is generated fresh for each student when
   * they start the attempt (see {@link generateCrosswordLayout}), so no layout is stored here.
   */
  entries: CrosswordEntry[];
}

export type ClassTestQuestion =
  | ClassTestMcqQuestion
  | ClassTestMsqQuestion
  | ClassTestCodingQuestion
  | ClassTestShortAnswerQuestion
  | ClassTestCrosswordQuestion;

/**
 * One placed word in a generated grid. `entryIndex` points back into the question's `entries`,
 * so a slot knows both its geometry and which answer/clue it carries.
 */
export interface CrosswordSlot {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  length: number;
  entryIndex: number;
}

/** A generated crossword grid: a tight bounding box plus the placed words. */
export interface CrosswordLayout {
  rows: number;
  cols: number;
  slots: CrosswordSlot[];
}

/** A student frozen onto the test at assignment time. */
export interface AssignedStudent {
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
}

/** The filter faculty use to find a class; the result is then ticked down to the final list. */
export interface ClassTestAudienceFilter {
  /**
   * Null only when a stored document is unreadable. The validator always writes a real
   * department, and a null one matches no student — failing closed rather than widening.
   */
  department: Department | null;
  division: string | null;
  semester: number | null;
  rollFrom: number | null;
  rollTo: number | null;
}

/**
 * Same questionnaire contests collect, so the CoE can compare the platform experience across
 * both without reconciling two shapes. One record per (classTestId, userEmail).
 */
export interface ClassTestFeedbackRecord {
  id: string;
  classTestId: string;
  userEmail: string;
  name: string;
  uid: string;
  navigationEase: number;
  visualDesignRating: number;
  interfaceReadability: "Yes" | "No" | "Need improvement";
  editorResponsiveness: number;
  compilationLag: number;
  errorMessageClarity: number;
  problemStatementClarity: "Yes" | "No" | "Needs improvement";
  bugsOrBrokenLinks: string;
  oneNewFeature: string;
  recommendLikelihood: number;
  overallRating: number | null;
  createdAt: Date;
}

export interface ClassTestRecord {
  id: string;
  title: string;
  /** Any technical subject — free text, not a fixed list. */
  subject: string;
  instructions: string | null;
  createdBy: string;
  createdByRole: UserRole;
  /** Faculty the creator delegated management to, mirroring contest delegation. */
  managerEmails: string[];

  /**
   * Everyone sits the test in the same window: the deadline is `startAt + durationMinutes`
   * for every student, so starting late buys no extra time and cannot be used to look up
   * answers while others are still writing.
   */
  startAt: Date;
  durationMinutes: number;

  /** The filter that produced {@link assignedStudents}; kept so faculty can re-run it. */
  audience: ClassTestAudienceFilter;
  /**
   * The authority on who may sit this test. Frozen at assignment time so a later profile
   * change (corrected UID, moved division) cannot silently grant or revoke access mid-test.
   */
  assignedStudents: AssignedStudent[];

  /** Scored violations before the attempt is auto-submitted. Defaults to 1. */
  maxViolations: number;

  questions: ClassTestQuestion[];
  /**
   * Opt-in shuffled papers. Absent means every student sits the whole `questions` list, which is
   * the original behaviour and stays the default.
   *
   * When present, `questions` becomes a *pool*: each student is dealt `perType` questions of
   * each type when they start. Because every paper has the same shape, and the validator forces
   * every question of a type to carry the same marks, every student's paper is worth the same.
   */
  questionPool?: ClassTestQuestionPool;
  lifecycleState: ProblemLifecycleState;
  resultsPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassTestQuestionPool {
  /** How many questions of each type each student is dealt. Types set to 0 are omitted. */
  perType: Partial<Record<ClassTestQuestionType, number>>;
}

export type ClassTestComputedStatus = "Scheduled" | "Live" | "Ended";

export type ClassTestAttemptStatus = "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";

export type ClassTestGradingStatus = "PENDING" | "PARTIAL" | "COMPLETE";

export interface ClassTestQuestionAttemptState {
  questionId: string;
  questionType: ClassTestQuestionType;
  /** MCQ: string. MSQ: string[]. ShortAnswer: string. Coding: null (see coding fields). */
  submittedAnswer: string | string[] | null;
  awardedPoints: number;
  maxPoints: number;

  // Coding only — mirrors the contest coding state so the judge worker can fill it in.
  lastSubmissionId: string | null;
  finalSubmissionLanguage: string | null;
  finalSubmissionStatus: string | null;
  passedCount: number;
  totalCount: number;
  draftCode: string | null;
  draftLanguage: string | null;

  // ShortAnswer only — filled in when a human marks it.
  gradedBy: string | null;
  gradedAt: Date | null;
  graderNote: string | null;

  /**
   * MCQ/MSQ only: the option order this student was shown.
   *
   * Presentation only — `scoreObjectiveAnswer` compares answer *text*, never a position, so
   * reordering cannot affect marks. It is persisted because a refresh mid-test must not reshuffle
   * the options under the student's cursor.
   */
  optionOrder?: string[];

  /**
   * Crossword only: the grid this student was dealt.
   *
   * Generated once when the attempt starts and frozen — like {@link optionOrder}, a refresh
   * mid-test must not reshuffle the grid under the student's cursor. Because it is per-attempt,
   * two students sitting the same question get different grids of the same words. Scoring reads
   * the answer *text* against `entries`, never a cell position, so the layout never affects marks.
   */
  crosswordLayout?: CrosswordLayout;
}

export interface ClassTestAttemptRecord {
  id: string;
  classTestId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userRollNumber: string | null;
  userDivision: string | null;
  userDepartment: Department | null;

  status: ClassTestAttemptStatus;
  questionStates: ClassTestQuestionAttemptState[];

  /** MCQ + MSQ + Coding, computed by the platform. */
  autoScore: number;
  /** ShortAnswer only, awarded by faculty. */
  manualScore: number;
  /** autoScore + manualScore. Meaningful only once grading is COMPLETE. */
  finalScore: number;
  gradingStatus: ClassTestGradingStatus;

  violationCount: number;
  /** Set when proctoring auto-submitted the attempt. Advisory — faculty decide. */
  suspectedMalpractice: boolean;

  startedAt: Date;
  /** Shared across every attempt: startAt + durationMinutes. */
  deadlineAt: Date;
  submittedAt: Date | null;
  autoSubmittedAt: Date | null;
  timeTakenMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassTestProctoringEventRecord {
  id: string;
  classTestId: string;
  attemptId: string;
  userEmail: string;
  type: string;
  createdAt: Date;
}

// --- derivations -------------------------------------------------------------

export function computeClassTestEndAt(test: Pick<ClassTestRecord, "startAt" | "durationMinutes">): Date {
  return new Date(test.startAt.getTime() + test.durationMinutes * 60_000);
}

export function computeClassTestStatus(
  test: Pick<ClassTestRecord, "startAt" | "durationMinutes">,
  now: Date,
): ClassTestComputedStatus {
  const nowMs = now.getTime();
  if (nowMs < test.startAt.getTime()) {
    return "Scheduled";
  }
  return nowMs < computeClassTestEndAt(test).getTime() ? "Live" : "Ended";
}

/** Points available for a question, used for both the paper total and per-question caps. */
export function questionMaxPoints(question: ClassTestQuestion): number {
  return Math.max(0, question.points);
}

/** Fisher-Yates. Takes the source of randomness so tests can make the draw deterministic. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Deals one student's paper out of the pool.
 *
 * Within each type, questions are taken **least-used first**, ties broken randomly. That single
 * sort is what makes the feature behave sensibly at both extremes:
 *
 *   - 100 questions, 5 students, 10 each → every question sits at usage 0 or 1, so papers
 *     barely overlap.
 *   - 20 questions, 30 students, 5 each → repetition is arithmetically unavoidable, but usage
 *     climbs evenly, so each question is dealt 7 or 8 times instead of a handful being dealt
 *     constantly while others are never seen.
 *
 * The drawn questions are then shuffled together, so even two students dealt the same questions
 * do not meet them in the same order.
 *
 * If a type's pool is smaller than requested, the whole bucket is taken rather than throwing —
 * the validator refuses that at authoring time, and a live attempt is the worst possible moment
 * to discover it.
 */
export function drawQuestionsForAttempt(
  questions: readonly ClassTestQuestion[],
  perType: Partial<Record<ClassTestQuestionType, number>>,
  usageByQuestionId: ReadonlyMap<string, number>,
  random: () => number = Math.random,
): ClassTestQuestion[] {
  const drawn: ClassTestQuestion[] = [];

  for (const [type, requested] of Object.entries(perType) as [ClassTestQuestionType, number][]) {
    if (!requested || requested <= 0) {
      continue;
    }

    const bucket = questions.filter((question) => question.type === type);
    // Shuffle first so the sort's tie-break is random rather than authoring order — otherwise
    // the first-authored question of each type would always win an equal-usage tie.
    const ordered = shuffled(bucket, random).sort(
      (left, right) => (usageByQuestionId.get(left.id) ?? 0) - (usageByQuestionId.get(right.id) ?? 0),
    );

    drawn.push(...ordered.slice(0, Math.min(requested, ordered.length)));
  }

  return shuffled(drawn, random);
}

/** The option order to show one student, or undefined for types that have no options. */
export function drawOptionOrder(
  question: ClassTestQuestion,
  random: () => number = Math.random,
): string[] | undefined {
  return question.type === "MCQ" || question.type === "MSQ"
    ? shuffled(question.options, random)
    : undefined;
}

/**
 * Builds a fresh crossword grid from a word list.
 *
 * Greedy interlock: the words are shuffled (so the anchor and the placement order — and therefore
 * the whole grid — vary with the random source, giving each student a different grid of the same
 * words), then each word is crossed over an already-placed letter wherever it legally can, taking
 * the most-interlocked placement. A word that shares no letter with the grid so far is dropped on
 * its own line below everything, so generation *always* succeeds for any word set.
 *
 * The result is normalized to a tight bounding box and numbered Times-of-India style: scanning
 * row by row, each cell that begins a word takes the next number, and an across and a down word
 * that begin on the same cell share it.
 *
 * Scoring never reads this layout — it compares answer text against `entries` — so the grid a
 * student is dealt cannot change their marks.
 */
export function generateCrosswordLayout(
  entries: readonly CrosswordEntry[],
  random: () => number = Math.random,
): CrosswordLayout {
  interface Placement {
    row: number;
    col: number;
    direction: "across" | "down";
    length: number;
    entryIndex: number;
  }

  const cells = new Map<string, string>();
  const placements: Placement[] = [];
  const key = (row: number, col: number): string => `${row},${col}`;

  const order = shuffled(
    entries.map((entry, entryIndex) => ({ entryIndex, word: entry.answer.toUpperCase() })),
    random,
  ).filter((item) => item.word.length > 0);

  const step = (direction: "across" | "down"): [number, number] =>
    direction === "down" ? [1, 0] : [0, 1];

  /** How many existing letters a placement would cross, or null if it is illegal. */
  const crossingsFor = (
    word: string,
    row: number,
    col: number,
    direction: "across" | "down",
  ): number | null => {
    const [dr, dc] = step(direction);

    // The cells flanking each end must be empty, so we never silently extend an existing word.
    if (cells.has(key(row - dr, col - dc)) || cells.has(key(row + dr * word.length, col + dc * word.length))) {
      return null;
    }

    let crossings = 0;
    for (let i = 0; i < word.length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = cells.get(key(r, c));
      if (existing !== undefined) {
        if (existing !== word[i]) {
          return null;
        }
        crossings += 1;
        continue;
      }
      // A brand-new cell must not touch a parallel word on either perpendicular side, or the two
      // would merge into an unintended extra word.
      const sideA = direction === "across" ? key(r - 1, c) : key(r, c - 1);
      const sideB = direction === "across" ? key(r + 1, c) : key(r, c + 1);
      if (cells.has(sideA) || cells.has(sideB)) {
        return null;
      }
    }
    return crossings;
  };

  const place = (
    word: string,
    entryIndex: number,
    row: number,
    col: number,
    direction: "across" | "down",
  ): void => {
    const [dr, dc] = step(direction);
    for (let i = 0; i < word.length; i += 1) {
      cells.set(key(row + dr * i, col + dc * i), word[i]);
    }
    placements.push({ row, col, direction, length: word.length, entryIndex });
  };

  order.forEach((item, index) => {
    if (index === 0) {
      place(item.word, item.entryIndex, 0, 0, "across");
      return;
    }

    const candidates: { row: number; col: number; direction: "across" | "down"; crossings: number }[] = [];
    for (const [cellKey, letter] of cells) {
      const [r, c] = cellKey.split(",").map(Number);
      for (let i = 0; i < item.word.length; i += 1) {
        if (item.word[i] !== letter) {
          continue;
        }
        for (const direction of ["across", "down"] as const) {
          const [dr, dc] = step(direction);
          const row = r - dr * i;
          const col = c - dc * i;
          const crossings = crossingsFor(item.word, row, col, direction);
          if (crossings !== null && crossings >= 1) {
            candidates.push({ row, col, direction, crossings });
          }
        }
      }
    }

    if (candidates.length > 0) {
      // Most-interlocked wins; ties break randomly so the grid varies between students.
      const best = shuffled(candidates, random).sort((left, right) => right.crossings - left.crossings)[0];
      place(item.word, item.entryIndex, best.row, best.col, best.direction);
      return;
    }

    // Shares no letter with the grid — give it its own line, two rows clear of everything.
    let maxRow = 0;
    for (const cellKey of cells.keys()) {
      maxRow = Math.max(maxRow, Number(cellKey.split(",")[0]));
    }
    place(item.word, item.entryIndex, maxRow + 2, 0, "across");
  });

  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const cellKey of cells.keys()) {
    const [r, c] = cellKey.split(",").map(Number);
    minRow = Math.min(minRow, r);
    maxRow = Math.max(maxRow, r);
    minCol = Math.min(minCol, c);
    maxCol = Math.max(maxCol, c);
  }
  if (!Number.isFinite(minRow)) {
    return { rows: 0, cols: 0, slots: [] };
  }

  const normalized = placements.map((placement) => ({
    ...placement,
    row: placement.row - minRow,
    col: placement.col - minCol,
  }));
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;

  // Number the start cells in scan order; a shared start cell (across + down) keeps one number.
  const startCells = new Set(normalized.map((placement) => key(placement.row, placement.col)));
  const numberByCell = new Map<string, number>();
  let nextNumber = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (startCells.has(key(r, c))) {
        numberByCell.set(key(r, c), nextNumber);
        nextNumber += 1;
      }
    }
  }

  const slots: CrosswordSlot[] = normalized.map((placement) => ({
    number: numberByCell.get(key(placement.row, placement.col)) ?? 0,
    direction: placement.direction,
    row: placement.row,
    col: placement.col,
    length: placement.length,
    entryIndex: placement.entryIndex,
  }));

  return { rows, cols, slots };
}

export function classTestTotalPoints(questions: readonly ClassTestQuestion[]): number {
  return questions.reduce((total, question) => total + questionMaxPoints(question), 0);
}

export function scoringModeFor(type: ClassTestQuestionType): ClassTestScoringMode {
  return type === "ShortAnswer" ? "MANUAL" : "AUTO";
}

/**
 * Whether a student matches the audience *filter*.
 *
 * This only narrows the candidate pool that faculty tick down from — it is never the access
 * check. Access is decided solely by {@link isAssignedToClassTest}, because the assignment is
 * frozen and must not shift when a profile changes.
 */
export function matchesAudienceFilter(student: UserRecord, filter: ClassTestAudienceFilter): boolean {
  if (filter.department === null) {
    return false;
  }

  if (student.role !== "STUDENT" || student.department !== filter.department) {
    return false;
  }

  if (filter.semester !== null && student.semester !== filter.semester) {
    return false;
  }

  if (filter.division !== null && deriveDivisionFromUid(student.uid) !== filter.division) {
    return false;
  }

  if (filter.rollFrom !== null || filter.rollTo !== null) {
    const roll = Number(student.rollNumber);
    if (!Number.isFinite(roll)) {
      return false;
    }
    if (filter.rollFrom !== null && roll < filter.rollFrom) {
      return false;
    }
    if (filter.rollTo !== null && roll > filter.rollTo) {
      return false;
    }
  }

  return true;
}

/** The only access check that matters at attempt time. */
export function isAssignedToClassTest(test: ClassTestRecord, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return test.assignedStudents.some((student) => student.email.toLowerCase() === normalized);
}

export function toAssignedStudent(student: UserRecord): AssignedStudent {
  return {
    email: student.email,
    name: student.name,
    uid: student.uid,
    rollNumber: student.rollNumber,
    division: deriveDivisionFromUid(student.uid),
  };
}

/** Whether a language may be used for a coding question. Enforced server-side, not just in the UI. */
export function isLanguageAllowed(question: ClassTestCodingQuestion, language: string): boolean {
  return question.supportedLanguages.includes(language as ExecutableLanguage);
}

// --- student-facing shapes ---------------------------------------------------

/**
 * A question as the student sees it.
 *
 * Built field by field on purpose: there is no member here for a correct answer, a model
 * answer or a hidden test case, so none of them can reach a student by someone spreading a
 * record. Adding one would be an obvious, reviewable change to this file.
 */
export interface StudentCrosswordSlot {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  length: number;
  /** The clue the student solves — the answer letters are deliberately absent. */
  clue: string;
}

export interface StudentCrossword {
  rows: number;
  cols: number;
  slots: StudentCrosswordSlot[];
}

export interface StudentClassTestQuestion {
  id: string;
  type: ClassTestQuestionType;
  points: number;
  statement: string;
  options?: string[];
  expectedSentences?: number;
  /** Coding only. */
  problemTitle?: string;
  difficulty?: Difficulty;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: ClassTestTestCase[];
  supportedLanguages?: ExecutableLanguage[];
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
  /** Crossword only: this student's grid geometry and clues, never the answer letters. */
  crossword?: StudentCrossword;
}

export function toStudentQuestion(
  question: ClassTestQuestion,
  /** This student's shuffled option order, when the paper was dealt from a pool. */
  optionOrder?: string[],
  /** Crossword only: this student's generated grid, frozen at attempt start. */
  crosswordLayout?: CrosswordLayout,
): StudentClassTestQuestion {
  switch (question.type) {
    case "MCQ":
    case "MSQ":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.statement,
        // Only honour a stored order that still matches the question — an edited option list
        // would otherwise drop or invent choices.
        options:
          optionOrder && optionOrder.length === question.options.length &&
          optionOrder.every((option) => question.options.includes(option))
            ? optionOrder
            : question.options,
      };
    case "ShortAnswer":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.statement,
        expectedSentences: question.expectedSentences,
      };
    case "Coding":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.problemStatement,
        problemTitle: question.problemTitle,
        difficulty: question.difficulty,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        // Samples only — hidden test cases are never sent to a student.
        sampleTestCases: question.sampleTestCases,
        supportedLanguages: question.supportedLanguages,
        timeLimitSeconds: question.timeLimitSeconds,
        memoryLimitMb: question.memoryLimitMb,
      };
    case "Crossword": {
      const layout = crosswordLayout ?? { rows: 0, cols: 0, slots: [] };
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.statement,
        crossword: {
          rows: layout.rows,
          cols: layout.cols,
          // Clue + geometry only. The answer letters are never sent to a student.
          slots: layout.slots.map((slot) => ({
            number: slot.number,
            direction: slot.direction,
            row: slot.row,
            col: slot.col,
            length: slot.length,
            clue: question.entries[slot.entryIndex]?.clue ?? "",
          })),
        },
      };
    }
  }
}

/** Grades an objective answer. Coding and ShortAnswer are scored elsewhere. */
export function scoreObjectiveAnswer(
  question: ClassTestMcqQuestion | ClassTestMsqQuestion,
  submittedAnswer: string | string[] | null,
): number {
  if (question.type === "MCQ") {
    return typeof submittedAnswer === "string" && submittedAnswer === question.correctAnswer
      ? question.points
      : 0;
  }

  if (!Array.isArray(submittedAnswer)) {
    return 0;
  }
  // All-or-nothing: every correct option and no incorrect ones.
  const chosen = new Set(submittedAnswer);
  const expected = new Set(question.correctAnswers);
  const exact =
    chosen.size === expected.size && [...expected].every((option) => chosen.has(option));
  return exact ? question.points : 0;
}

/**
 * Grades a crossword. Per-word partial credit: each word filled correctly earns its share of the
 * question's points, so a half-solved grid is worth half — matching how coding scores by test
 * cases passed.
 *
 * The student's answer is the JSON string the grid serializes to, `{ "<number>-<direction>":
 * "WORD" }`; the layout is the one this student was dealt (from their attempt state), and it is
 * only used to know which slots exist and which `entries` answer each maps to.
 */
export function scoreCrosswordAnswer(
  question: ClassTestCrosswordQuestion,
  layout: CrosswordLayout | undefined,
  submittedAnswer: string | string[] | null,
): number {
  if (!layout || layout.slots.length === 0 || typeof submittedAnswer !== "string") {
    return 0;
  }

  let filled: Record<string, unknown>;
  try {
    const parsed = JSON.parse(submittedAnswer) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return 0;
    }
    filled = parsed as Record<string, unknown>;
  } catch {
    return 0;
  }

  let correct = 0;
  for (const slot of layout.slots) {
    const entry = question.entries[slot.entryIndex];
    if (!entry) {
      continue;
    }
    const given = filled[`${slot.number}-${slot.direction}`];
    if (typeof given === "string" && given.trim().toUpperCase() === entry.answer.toUpperCase()) {
      correct += 1;
    }
  }

  return Math.max(0, Math.round((question.points * correct) / layout.slots.length));
}
