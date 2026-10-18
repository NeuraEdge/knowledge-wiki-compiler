/**
 * Live smoke test for the installed Codex CLI.
 *
 * This is intentionally the only test that crosses the real Codex process and
 * subscription boundary. It is opt-in because the default test path uses
 * provider adapters and does not require a user's Codex CLI login.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CodexAgentProvider } from "../src/providers/codex-agent.js";

/** True when literal PATH lookup can launch the real installed CLI. */
function hasCodexBinary(): boolean {
  try {
    execFileSync("codex", ["--version"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function runLiveCodexTest(): boolean {
  return process.env.LLMWIKI_RUN_LIVE_CODEX_TEST === "1" && hasCodexBinary();
}

describe("CodexAgentProvider live smoke", () => {
  it.skipIf(!runLiveCodexTest())("invokes the real installed codex exec binary", async () => {
    const provider = new CodexAgentProvider(undefined, { timeoutMs: 120_000 });
    const result = await provider.complete(
      "Return the requested literal text and nothing else.",
      [{ role: "user", content: "Reply exactly: codex-agent-smoke-ok" }],
      32,
    );
    expect(result.trim()).toBe("codex-agent-smoke-ok");
  }, 130_000);
});
