import { describe, expect, it, vi } from "vitest";
import { pollSubmissionUntilComplete } from "./submissionPolling";

describe("pollSubmissionUntilComplete", () => {
  it("stops once the submission reaches a final status", async () => {
    vi.useFakeTimers();
    const getSubmission = vi
      .fn()
      .mockResolvedValueOnce({ id: "sub_1", status: "QUEUED" })
      .mockResolvedValueOnce({ id: "sub_1", status: "RUNNING" })
      .mockResolvedValueOnce({ id: "sub_1", status: "ACCEPTED" });

    const promise = pollSubmissionUntilComplete("sub_1", getSubmission as never, {
      intervalMs: 10,
      timeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(25);
    const result = await promise;

    expect(result.status).toBe("ACCEPTED");
    expect(getSubmission).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("fails with a timeout instead of polling forever", async () => {
    vi.useFakeTimers();
    const getSubmission = vi.fn().mockResolvedValue({ id: "sub_2", status: "RUNNING" });

    const promise = pollSubmissionUntilComplete("sub_2", getSubmission as never, {
      intervalMs: 10,
      timeoutMs: 30,
    });
    const assertion = expect(promise).rejects.toThrow("Timed out while waiting for submission sub_2.");

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(getSubmission).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
