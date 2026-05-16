const JUDGE0_SUBMISSIONS_URL = "http://localhost:2358/submissions?wait=true";

type Judge0SandboxResponse = {
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

async function submitToJudge0(payload: { language_id: number; source_code: string }): Promise<Judge0SandboxResponse> {
  const response = await fetch(JUDGE0_SUBMISSIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Judge0 request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as Judge0SandboxResponse;
}

function logResult(label: string, result: Judge0SandboxResponse): void {
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const pythonFileSnooper = {
    language_id: 71,
    source_code: "import os\ntry:\n  with open('/etc/passwd', 'r') as f:\n    print(f.read())\nexcept Exception as e:\n  print('Access Denied:', e)",
  };

  const cppForkBomb = {
    language_id: 54,
    source_code: "#include <unistd.h>\nint main() { while(1) { fork(); } return 0; }",
  };

  console.log(`Sending sandbox verification requests to ${JUDGE0_SUBMISSIONS_URL}`);

  const pythonResult = await submitToJudge0(pythonFileSnooper);
  logResult("Payload 1: Python File Snooper", pythonResult);

  const cppResult = await submitToJudge0(cppForkBomb);
  logResult("Payload 2: C++ Fork Bomb", cppResult);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Sandbox verification failed:", message);
  process.exitCode = 1;
});
