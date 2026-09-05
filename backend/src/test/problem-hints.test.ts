import request from "supertest";
import { describe, expect, it } from "vitest";

import { parseHintResponse } from "../modules/problem/ai/hint-generator";
import type { HintGenerator } from "../modules/problem/ai/hint-generator";
import type { OllamaRuntimeStatus } from "../shared/ai/ollama";
import { createTestApp } from "./helpers/create-test-app";

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

async function createProblem(app: Parameters<typeof request>[0], overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/api/problems")
    .set(facultyHeaders)
    .send({
      title: "Two Sum Variant",
      statement: "Return the indices of the pair that adds to the target.",
      inputFormat: "Array and target",
      outputFormat: "Two indices",
      constraints: ["2 <= n <= 10^5"],
      difficulty: "Easy",
      tags: ["Array"],
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      lifecycleState: "Published",
      sampleTestCases: [{ input: "2 7 11 15\n9", output: "0 1" }],
      hiddenTestCases: [{ input: "1 5 1 5\n10", output: "1 3" }],
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.problem;
}

class FakeHintGenerator implements HintGenerator {
  readonly model = "qwen2.5-coder:latest";
  readonly promptVersion = "1.0.0";
  public calls = 0;

  constructor(private readonly hints: string[] | null = ["Think about order.", "Use a map.", "Watch duplicates."]) {}

  async getStatus(): Promise<OllamaRuntimeStatus> {
    return { available: true, model: this.model, baseUrl: "", reason: null };
  }

  async generate(): Promise<string[] | null> {
    this.calls += 1;
    return this.hints;
  }
}

describe("parseHintResponse", () => {
  const three = ["one", "two", "three"];

  it("accepts exactly three well-formed hints", () => {
    expect(parseHintResponse(JSON.stringify({ hints: three }))).toEqual(three);
  });

  it("accepts the content under a differently named key", () => {
    expect(parseHintResponse(JSON.stringify({ result: three }))).toEqual(three);
  });

  it("rejects the wrong number of hints rather than showing a partial set", () => {
    expect(parseHintResponse(JSON.stringify({ hints: ["one", "two"] }))).toBeNull();
    expect(parseHintResponse(JSON.stringify({ hints: [...three, "four"] }))).toBeNull();
  });

  it("rejects a hint containing code, which would be a solution", () => {
    const withCode = ["fine", "```py\nprint(1)\n```", "fine"];
    expect(parseHintResponse(JSON.stringify({ hints: withCode }))).toBeNull();
  });

  it("rejects an over-long hint", () => {
    expect(parseHintResponse(JSON.stringify({ hints: ["a".repeat(401), "b", "c"] }))).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseHintResponse("not json")).toBeNull();
  });
});

describe("problem hints endpoints", () => {
  it("withholds unrevealed hint text from the response body", async () => {
    const generator = new FakeHintGenerator();
    const { app } = createTestApp({ hintGenerator: generator });
    const problem = await createProblem(app, { title: "Hint Problem A" });

    const response = await request(app).get(`/api/problems/${problem.id}/hints`);

    expect(response.status).toBe(200);
    expect(response.body.totalHints).toBe(3);
    expect(response.body.revealedCount).toBe(0);
    // The lock is server-side: the text is simply not in the payload.
    expect(response.body.hints.every((hint: { text: string | null }) => hint.text === null)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain("Think about order");
  });

  it("reveals one hint at a time and refuses a fourth", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator() });
    const problem = await createProblem(app, { title: "Hint Problem B" });

    const first = await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    expect(first.status).toBe(200);
    expect(first.body.revealedCount).toBe(1);
    expect(first.body.hints[0].text).toBe("Think about order.");
    expect(first.body.hints[1].text).toBeNull();

    await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    const third = await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    expect(third.body.revealedCount).toBe(3);

    const fourth = await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    expect(fourth.status).toBe(409);
  });

  it("remembers reveals across requests", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator() });
    const problem = await createProblem(app, { title: "Hint Problem C" });

    await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    const reread = await request(app).get(`/api/problems/${problem.id}/hints`);

    expect(reread.body.revealedCount).toBe(1);
    expect(reread.body.hints[0].text).toBe("Think about order.");
  });

  it("generates once and serves the cache thereafter", async () => {
    const generator = new FakeHintGenerator();
    const { app } = createTestApp({ hintGenerator: generator });
    const problem = await createProblem(app, { title: "Hint Problem D" });

    await request(app).get(`/api/problems/${problem.id}/hints`);
    await request(app).get(`/api/problems/${problem.id}/hints`);
    await request(app).post(`/api/problems/${problem.id}/hints/reveal`);

    expect(generator.calls).toBe(1);
  });

  it("reports no hints available when the model cannot produce usable ones", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator(null) });
    const problem = await createProblem(app, { title: "Hint Problem E" });

    const response = await request(app).get(`/api/problems/${problem.id}/hints`);

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.totalHints).toBe(0);

    // Revealing nothing is a conflict, not a silent success.
    const reveal = await request(app).post(`/api/problems/${problem.id}/hints/reveal`);
    expect(reveal.status).toBe(409);
  });

  it("lets the owning faculty read full hint text for review", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator() });
    const problem = await createProblem(app, { title: "Hint Problem F" });

    const response = await request(app)
      .post(`/api/problems/${problem.id}/hints/generate`)
      .set(facultyHeaders);

    expect(response.status).toBe(200);
    expect(response.body.hints.map((hint: { text: string }) => hint.text)).toEqual([
      "Think about order.",
      "Use a map.",
      "Watch duplicates.",
    ]);
  });

  it("records the editor when faculty rewrite a hint", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator() });
    const problem = await createProblem(app, { title: "Hint Problem G" });
    await request(app).post(`/api/problems/${problem.id}/hints/generate`).set(facultyHeaders);

    const response = await request(app)
      .patch(`/api/problems/${problem.id}/hints`)
      .set(facultyHeaders)
      .send({
        hints: [
          { order: 1, text: "Sort first." },
          { order: 2, text: "Use a map." },
          { order: 3, text: "Watch duplicates." },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.hints[0].text).toBe("Sort first.");
    // Rewritten text is no longer attributable to the model.
    expect(response.body.hints[0].model).toBeNull();
    expect(response.body.hints[0].editedBy).toBe("faculty1@tcetmumbai.in");
    // Untouched hints keep their provenance.
    expect(response.body.hints[1].model).toBe("qwen2.5-coder:latest");
  });

  it("does not let a student reach hints for another department's problem", async () => {
    const { app } = createTestApp({ hintGenerator: new FakeHintGenerator() });

    const response = await request(app).get("/api/problems/problem_does_not_exist/hints");
    expect(response.status).toBe(404);
  });
});
