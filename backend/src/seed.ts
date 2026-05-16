import { env } from "./config/env";
import { db } from "./firebase";
import {
  DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
  DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
  DIFFICULTY_RATING_WEIGHTS,
} from "./shared/constants/domain";

async function seedDatabase(): Promise<void> {
  try {
    console.log("Seeding database...");

    const now = new Date();

    const users = [
      {
        email: "student1@tcetmumbai.in",
        name: "Soham Jain",
        role: "STUDENT",
        isProfileComplete: true,
        rollNumber: "TCET001",
        department: "AI&DS",
        semester: 5,
        linkedInUrl: "https://www.linkedin.com/in/soham-jain",
        githubUrl: "https://github.com/sohamjain",
        skills: ["C", "Problem Solving"],
        uid: "TCET001",
        rating: DIFFICULTY_RATING_WEIGHTS.Easy,
        score: DIFFICULTY_RATING_WEIGHTS.Easy,
        problemsSolved: 1,
        submissionCount: 1,
        acceptedSubmissionCount: 1,
        accuracy: 100,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        lastAcceptedAt: now,
      },
      {
        email: "faculty1@tcetmumbai.in",
        name: "Prof. Mehta",
        role: "FACULTY",
        isProfileComplete: false,
        rollNumber: null,
        department: "IT",
        semester: null,
        linkedInUrl: null,
        githubUrl: null,
        skills: [],
        uid: "FAC001",
        rating: 0,
        score: 0,
        problemsSolved: 0,
        submissionCount: 0,
        acceptedSubmissionCount: 0,
        accuracy: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        lastAcceptedAt: null,
      },
    ];

    for (const user of users) {
      await db.collection("users").doc(user.email).set(user, { merge: true });
    }

    const problems = [
      {
        id: "problem_001",
        title: "Hello World in C",
        statement: "Print Hello, World! and then print the given input string on the next line.",
        inputFormat: "A single string input.",
        outputFormat: "Print Hello, World! and then the input string.",
        constraints: ["1 <= length <= 1000"],
        difficulty: "Easy",
        tags: ["C", "basics"],
        timeLimitSeconds: DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
        memoryLimitMb: DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
        lifecycleState: "Published",
        createdBy: "faculty1@tcetmumbai.in",
        createdByRole: "FACULTY",
        totalSubmissions: 1,
        acceptedSubmissions: 1,
        acceptanceRate: 100,
        sampleTestCases: [{ input: "Welcome", output: "Hello, World!\nWelcome" }],
        hiddenTestCases: [
          { input: "abc", output: "Hello, World!\nabc" },
          { input: "TCET", output: "Hello, World!\nTCET" },
        ],
        createdAt: now,
        updatedAt: now,
        approved: true,
        timeLimit: DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
        memoryLimit: DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
      },
      {
        id: "problem_002",
        title: "Sum of Two Numbers",
        statement: "Read two integers and print their sum.",
        inputFormat: "Two integers separated by whitespace.",
        outputFormat: "Print one integer representing the sum.",
        constraints: ["-10^9 <= a, b <= 10^9"],
        difficulty: "Medium",
        tags: ["math", "basics"],
        timeLimitSeconds: DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
        memoryLimitMb: DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
        lifecycleState: "Published",
        createdBy: "faculty1@tcetmumbai.in",
        createdByRole: "FACULTY",
        totalSubmissions: 0,
        acceptedSubmissions: 0,
        acceptanceRate: 0,
        sampleTestCases: [{ input: "2 5", output: "7" }],
        hiddenTestCases: [{ input: "-3 7", output: "4" }],
        createdAt: now,
        updatedAt: now,
        approved: true,
        timeLimit: DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
        memoryLimit: DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
      },
    ];

    for (const problem of problems) {
      await db.collection("problems").doc(problem.id).set(problem, { merge: true });
    }

    const submissions = [
      {
        id: "submission_seed_001",
        userEmail: "student1@tcetmumbai.in",
        userRole: "STUDENT",
        problemId: "problem_001",
        problemTitleSnapshot: "Hello World in C",
        problemDifficultySnapshot: "Easy",
        code: "#include<stdio.h>\nint main(){return 0;}",
        language: "c",
        status: "ACCEPTED",
        runtimeMs: 120,
        memoryKb: 8192,
        passedCount: 3,
        totalCount: 3,
        executionProvider: env.EXECUTION_PROVIDER,
        ratingAwarded: DIFFICULTY_RATING_WEIGHTS.Easy,
        createdAt: now,
        updatedAt: now,
        judgedAt: now,
        finalizationAppliedAt: now,
      },
    ];

    for (const submission of submissions) {
      await db.collection("submissions").doc(submission.id).set(submission, { merge: true });
    }

    const leaderboardEntries = [
      {
        email: "student1@tcetmumbai.in",
        role: "STUDENT",
        name: "Soham Jain",
        uid: "TCET001",
        rating: DIFFICULTY_RATING_WEIGHTS.Easy,
        score: DIFFICULTY_RATING_WEIGHTS.Easy,
        problemsSolved: 1,
        submissionCount: 1,
        acceptedSubmissionCount: 1,
        accuracy: 100,
        createdAt: now,
        updatedAt: now,
        lastAcceptedAt: now,
      },
    ];

    for (const entry of leaderboardEntries) {
      await db.collection("leaderboard").doc(entry.email).set(entry, { merge: true });
    }

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

void seedDatabase();
