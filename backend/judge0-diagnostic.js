const baseUrl = process.env.JUDGE0_BASE_URL?.trim() || "http://localhost:2358";

function encodeBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function main() {
  const payload = {
    source_code: encodeBase64('console.log("Hello World");'),
    language_id: 63,
    stdin: encodeBase64(""),
    expected_output: encodeBase64("Hello World\n"),
    cpu_time_limit: 1,
    wall_time_limit: 5,
    memory_limit: 128000,
    enable_network: false,
    redirect_stderr_to_stdout: false,
    base64_encoded: true,
  };

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log(text);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
