import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { join } from "path";
import { getMcpPolicy } from "../../src/cli/mcp/policy";
import {
  buildMcpToolDefinitions,
  callMcpTool,
  type McpToolContext,
} from "../../src/cli/mcp/tools";

async function jsonTool(
  ctx: McpToolContext,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await callMcpTool(ctx, name, args);
  return { raw: result, value: JSON.parse(result.content[0].text) };
}

function responseSize(result: { raw: unknown }): number {
  return JSON.stringify(result.raw).length;
}

async function withController<T>(
  fn: (repoRoot: string, ctx: McpToolContext) => Promise<T>,
): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), "repo-harness-bounded-response-"));
  const controllerHome = mkdtempSync(join(tmpdir(), "repo-harness-bounded-controller-home-"));
  const previousControllerHome = process.env.REPO_HARNESS_CONTROLLER_HOME;
  try {
    process.env.REPO_HARNESS_CONTROLLER_HOME = controllerHome;
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    mkdirSync(join(repoRoot, "tasks"), { recursive: true });
    mkdirSync(join(repoRoot, ".ai/harness"), { recursive: true });
    mkdirSync(join(repoRoot, ".repo-harness"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".repo-harness/checks.json"),
      JSON.stringify({
        version: 1,
        checks: {
          focused: {
            description: "Bounded response test check",
            command: [process.execPath, "-e", "process.exit(0)"],
            timeoutMs: 10_000,
          },
        },
      }),
    );
    writeFileSync(join(repoRoot, "src/example.ts"), "export const value = 1;\n");
    writeFileSync(join(repoRoot, "tasks/current.md"), "# Current\n");
    spawnSync("git", ["init", "-b", "main"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return await fn(repoRoot, {
      repoRoot,
      policy: getMcpPolicy("controller", { repoRoot }),
    });
  } finally {
    if (previousControllerHome === undefined) {
      delete process.env.REPO_HARNESS_CONTROLLER_HOME;
    } else {
      process.env.REPO_HARNESS_CONTROLLER_HOME = previousControllerHome;
    }
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(controllerHome, { recursive: true, force: true });
  }
}

describe("bounded MCP controller responses", () => {
  test("advertises explicit full-read controls", () => {
    const policy = getMcpPolicy("controller", { repoRoot: process.cwd() });
    const definitions = buildMcpToolDefinitions(policy);
    const issue = definitions.find((tool) => tool.name === "get_issue");
    const progress = definitions.find(
      (tool) => tool.name === "get_task_progress_detail",
    );

    expect(
      (issue?.inputSchema.properties as Record<string, unknown>).detail_level,
    ).toEqual({ type: "string", enum: ["summary", "full"] });
    expect(
      (progress?.inputSchema.properties as Record<string, unknown>).detail_level,
    ).toEqual({ type: "string", enum: ["summary", "full"] });
    expect(
      (progress?.inputSchema.properties as Record<string, unknown>).timeline_limit,
    ).toEqual({ type: "number" });
  });

  test("bounds default Issue and Task detail while preserving full opt-in", async () => {
    await withController(async (_repoRoot, ctx) => {
      const created = await jsonTool(ctx, "create_issue", {
        title: "Bounded response regression",
        summary: "s".repeat(20_000),
        tasks: Array.from({ length: 12 }, (_, index) => ({
          title: `Task ${index + 1}`,
          objective: "o".repeat(4_000),
          allowed_paths: ["src/**"],
          checks: ["focused"],
          acceptance_criteria: ["a".repeat(1_000)],
        })),
      });

      const summary = await jsonTool(ctx, "get_issue", {
        issue_id: created.value.id,
      });
      expect(summary.value.detailLevel).toBe("summary");
      expect(summary.value.tasks).toHaveLength(12);
      expect(summary.value.tasks[0].objective).toBeUndefined();
      expect(summary.value.tasks[0].verification).toBeUndefined();
      expect(responseSize(summary)).toBeLessThan(60_000);

      const full = await jsonTool(ctx, "get_issue", {
        issue_id: created.value.id,
        detail_level: "full",
      });
      expect(full.value.detailLevel).toBe("full");
      expect(full.value.tasks[0].objective).toHaveLength(4_000);
      expect(responseSize(full)).toBeGreaterThan(responseSize(summary));

      const progress = await jsonTool(ctx, "get_task_progress_detail", {
        issue_id: created.value.id,
        task_id: "T1",
        timeline_limit: 3,
      });
      expect(progress.value.detailLevel).toBe("summary");
      expect(progress.value.task.objective).toBeUndefined();
      expect(progress.value.timeline.length).toBeLessThanOrEqual(3);
      expect(responseSize(progress)).toBeLessThan(30_000);

      const fullProgress = await jsonTool(ctx, "get_task_progress_detail", {
        issue_id: created.value.id,
        task_id: "T1",
        detail_level: "full",
        timeline_limit: 3,
      });
      expect(fullProgress.value.detailLevel).toBe("full");
      expect(fullProgress.value.task.objective).toHaveLength(4_000);
      expect(fullProgress.value.timeline.length).toBeLessThanOrEqual(3);
    });
  });
});
