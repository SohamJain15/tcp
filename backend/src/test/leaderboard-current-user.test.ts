import request from "supertest";
import { describe, expect, it } from "vitest";

import type { LeaderboardEntry } from "../modules/leaderboard/leaderboard.model";
import { createTestApp } from "./helpers/create-test-app";

const studentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student1@tcetmumbai.in",
  "x-coe-name": "Student One",
};

const SEED_TIME = new Date(Date.UTC(2026, 4, 6));

function buildEntry(email: string, rating: number): LeaderboardEntry {
  return {
    email,
    role: "STUDENT",
    name: email,
    uid: email,
    department: "B.E. Computer Engineering",
    semester: 4,
    year: 2,
    rating,
    score: rating,
    problemsSolved: Math.round(rating / 100),
    submissionCount: 10,
    acceptedSubmissionCount: 5,
    avgAcceptedRuntimeMs: 0,
    avgAcceptedMemoryKb: 0,
    accuracy: 50,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    lastAcceptedAt: null,
  };
}

describe("leaderboard current-user entry", () => {
  it("returns the caller's row even when they rank below the fetched page", async () => {
    // The board is capped at 50 rows per page, so a student ranked #60 is absent from `items`
    // entirely and the table has nothing to pin. Their entry is returned alongside the page.
    const { app, repositories } = createTestApp();

    // 80 higher-rated students push student1 well past the first page.
    for (let index = 0; index < 80; index += 1) {
      await repositories.leaderboardRepository.save(
        buildEntry(`ranked${index}@tcetmumbai.in`, 5000 - index),
      );
    }
    await repositories.leaderboardRepository.save(buildEntry("student1@tcetmumbai.in", 100));

    const response = await request(app)
      .get("/api/leaderboard")
      .query({ pageSize: 50 })
      .set(studentHeaders);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(50);
    expect(
      response.body.items.some((item: { email: string }) => item.email === "student1@tcetmumbai.in"),
    ).toBe(false);

    expect(response.body.currentUserEntry).not.toBeNull();
    expect(response.body.currentUserEntry.email).toBe("student1@tcetmumbai.in");
    expect(response.body.currentUserEntry.rank).toBe(81);
  });

  it("still returns the entry when the caller is inside the page", async () => {
    const { app, repositories } = createTestApp();
    await repositories.leaderboardRepository.save(buildEntry("student1@tcetmumbai.in", 900));

    const response = await request(app).get("/api/leaderboard").set(studentHeaders);

    expect(response.body.currentUserEntry?.email).toBe("student1@tcetmumbai.in");
    expect(response.body.currentUserEntry.rank).toBe(1);
  });

  it("is null for a caller who is not on the board", async () => {
    // Faculty and admins never appear on a student leaderboard.
    const { app, repositories } = createTestApp();
    await repositories.leaderboardRepository.save(buildEntry("student1@tcetmumbai.in", 900));

    const response = await request(app)
      .get("/api/leaderboard")
      .set({ "x-coe-role": "FACULTY", "x-coe-email": "faculty1@tcetmumbai.in", "x-coe-name": "Prof" });

    expect(response.status).toBe(200);
    expect(response.body.currentUserEntry).toBeNull();
  });

  it("respects the active filters when resolving the caller's row", async () => {
    // A student filtered out by the current department selection is genuinely not on this board, so
    // pinning them under someone else's department would be wrong.
    const { app, repositories } = createTestApp();
    await repositories.leaderboardRepository.save(buildEntry("student1@tcetmumbai.in", 900));

    const response = await request(app)
      .get("/api/leaderboard")
      .query({ department: "B.E. Information Technology" })
      .set(studentHeaders);

    expect(response.body.currentUserEntry).toBeNull();
  });
});
