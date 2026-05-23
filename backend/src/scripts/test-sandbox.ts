const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL?.trim() || "http://localhost:2358";
const JUDGE0_SUBMISSIONS_URL = process.env.JUDGE0_SUBMISSIONS_URL?.trim() || `${JUDGE0_BASE_URL}/submissions`;
const JUDGE0_POLL_ATTEMPTS = 20;
const JUDGE0_POLL_INTERVAL_MS = 1_000;

type Judge0SandboxResponse = {
  token?: string;
  status?: {
    id?: number;
    description?: string;
  };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  exit_code?: number | null;
  exit_signal?: number | null;
};

type SubmissionPayload = {
  language_id: number;
  source_code: string;
  cpu_time_limit: number;
  wall_time_limit: number;
  memory_limit: number;
  enable_network: boolean;
};

type SandboxCase = {
  label: string;
  payload: SubmissionPayload;
  validate: (result: Judge0SandboxResponse) => string | null;
};

const HARD_FAILURE_PATTERNS = [
  "No such file or directory @ rb_sysopen - /box/",
  "Failed to create control group",
  "/sys/fs/cgroup/memory/",
  "cgroup.subtree_control",
  "Control group root",
];

const BASE_SANDBOX_LIMITS = {
  cpu_time_limit: 5,
  wall_time_limit: 10,
  memory_limit: 262144,
  enable_network: false,
} as const;

async function submitToJudge0(payload: SubmissionPayload): Promise<Judge0SandboxResponse> {
  const tokenResponse = await fetch(`${JUDGE0_SUBMISSIONS_URL}?base64_encoded=false&wait=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Judge0 token request failed (${tokenResponse.status}): ${errorText}`);
  }

  const submissionToken = ((await tokenResponse.json()) as { token?: string }).token;
  if (!submissionToken) {
    throw new Error("Judge0 did not return a submission token.");
  }

  for (let attempt = 1; attempt <= JUDGE0_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${JUDGE0_SUBMISSIONS_URL}/${encodeURIComponent(submissionToken)}?base64_encoded=false`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Judge0 poll failed (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as Judge0SandboxResponse;
    if (![1, 2].includes(result.status?.id ?? 0)) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLL_INTERVAL_MS));
  }

  throw new Error(`Judge0 polling timed out after ${JUDGE0_POLL_ATTEMPTS} attempts.`);
}

function logResult(label: string, result: Judge0SandboxResponse): void {
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(result, null, 2));
}

function getCombinedOutput(result: Judge0SandboxResponse): string {
  return [result.message, result.stderr, result.compile_output, result.stdout].filter(Boolean).join("\n");
}

function getStatusLabel(result: Judge0SandboxResponse): string {
  const id = result.status?.id ?? "?";
  const description = result.status?.description ?? "Unknown";
  return `${id} ${description}`;
}

function detectHardFailure(result: Judge0SandboxResponse): string | null {
  const combinedOutput = getCombinedOutput(result);

  for (const pattern of HARD_FAILURE_PATTERNS) {
    if (combinedOutput.includes(pattern)) {
      return `Judge0 runtime failure detected: ${pattern}`;
    }
  }

  if (result.status?.id === 13) {
    return `Judge0 returned Internal Error (${getStatusLabel(result)})`;
  }

  return null;
}

const sandboxCases: SandboxCase[] = [
  {
    label: "Hello World",
    payload: {
      language_id: 71,
      source_code: "print('hello from judge0')",
      ...BASE_SANDBOX_LIMITS,
    },
    validate: (result) => {
      const hardFailure = detectHardFailure(result);
      if (hardFailure) {
        return hardFailure;
      }

      if (result.status?.id !== 3) {
        return `Expected Accepted status, got ${getStatusLabel(result)}`;
      }

      if ((result.stdout ?? "").trim() !== "hello from judge0") {
        return `Unexpected stdout: ${JSON.stringify(result.stdout ?? "")}`;
      }

      return null;
    },
  },
  {
    label: "Python Shadow Snooper",
    payload: {
      language_id: 71,
      source_code:
        "try:\n  with open('/etc/shadow', 'r', encoding='utf-8') as handle:\n    print('ACCESS_GRANTED')\n    print(handle.read())\nexcept Exception as exc:\n  print(f'ACCESS_BLOCKED:{exc.__class__.__name__}')\n",
      ...BASE_SANDBOX_LIMITS,
    },
    validate: (result) => {
      const hardFailure = detectHardFailure(result);
      if (hardFailure) {
        return hardFailure;
      }

      const stdout = (result.stdout ?? "").trim();
      if (!stdout.includes("ACCESS_BLOCKED:")) {
        return `Expected filesystem access to be blocked, got stdout ${JSON.stringify(stdout)}`;
      }

      return null;
    },
  },
  {
    label: "C++ Fork Bomb",
    payload: {
      language_id: 54,
      source_code: "#include <unistd.h>\nint main() { while (1) { fork(); } return 0; }\n",
      ...BASE_SANDBOX_LIMITS,
    },
    validate: (result) => {
      const hardFailure = detectHardFailure(result);
      if (hardFailure) {
        return hardFailure;
      }

      if (result.status?.id === 3) {
        return "Expected the fork bomb to be constrained, but Judge0 marked it as Accepted.";
      }

      return null;
    },
  },
];

async function main(): Promise<void> {
  console.log(`Sending sandbox verification requests to ${JUDGE0_SUBMISSIONS_URL}`);

  const failures: string[] = [];

  for (const sandboxCase of sandboxCases) {
    const result = await submitToJudge0(sandboxCase.payload);
    logResult(sandboxCase.label, result);

    const failure = sandboxCase.validate(result);
    if (failure) {
      failures.push(`${sandboxCase.label}: ${failure}`);
      console.log(`RESULT: FAIL - ${failure}`);
    } else {
      console.log("RESULT: PASS");
    }

    console.log("");
  }

  if (failures.length > 0) {
    console.error("Sandbox verification failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Sandbox verification passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Sandbox verification failed:", message);
  process.exitCode = 1;
});
