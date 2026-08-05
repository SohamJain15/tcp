/**
 * Suite timeout for harness tests that shell out to a real toolchain.
 *
 * These specs invoke `javac`, `g++`, `python3` and friends per test case. In isolation each takes
 * one to two seconds, but Vitest runs spec files in parallel worker threads, so a full-suite run
 * has several compilers competing for the same cores and a single case can take five times
 * longer. Against Vitest's 5s default that surfaces as an intermittent timeout in whichever
 * compiled-language spec happened to lose the race — most often Java, which pays both a `javac`
 * and a JVM startup on every case.
 *
 * 30s is chosen to sit well clear of that contention while still being short enough that a
 * genuinely wedged compiler fails the run rather than hanging it. It is not a guess at how long
 * these tests should take: in isolation they finish in under 10s for a whole file.
 *
 * Not a `.spec.ts`/`.test.ts` file, so Vitest's default `include` does not collect it as a suite.
 */
export const E2E_SUITE_TIMEOUT_MS = 30_000;
