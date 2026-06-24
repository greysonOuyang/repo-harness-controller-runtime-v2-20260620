import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { registerRepository } from "../../src/cli/repositories/registry";
import { callRepositoryTool } from "../../src/cli/mcp/repository-tools";

function git(root: string, args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
}

function json(result: ReturnType<typeof callRepositoryTool>) {
  return JSON.parse(result?.content[0]?.text ?? "{}");
}

describe("repository MCP command tools", () => {
  test("previews and executes repository-scoped git commands through MCP", () => {
    const workspace = mkdtempSync(join(tmpdir(), "repo-harness-mcp-repo-command-"));
    const controllerHome = join(workspace, "controller-home");
    const repoRoot = join(workspace, "sample-repo");
    try {
      mkdirSync(controllerHome, { recursive: true });
      mkdirSync(repoRoot, { recursive: true });
      git(repoRoot, ["init", "-b", "main"]);
      git(repoRoot, ["config", "user.name", "Repo Harness Test"]);
      git(repoRoot, ["config", "user.email", "repo-harness-test@example.com"]);
      writeFileSync(join(repoRoot, "README.md"), "hello\n");
      git(repoRoot, ["add", "README.md"]);
      git(repoRoot, ["commit", "-m", "init"]);

      const repository = registerRepository({ path: repoRoot, controllerHome });
      writeFileSync(join(repoRoot, "tracked.txt"), "v1\n");

      const preview = callRepositoryTool(controllerHome, "repository_command_preview", {
        repo_id: repository.repoId,
        command: "git add tracked.txt",
      });
      const previewValue = json(preview);
      expect(previewValue.status).toBe("preview");
      expect(previewValue.classification.risk).toBe("workspace_write");
      expect(typeof previewValue.approvalToken).toBe("string");

      const executed = callRepositoryTool(controllerHome, "repository_command_execute", {
        repo_id: repository.repoId,
        command: "git add tracked.txt",
        approval_token: previewValue.approvalToken,
      });
      const executedValue = json(executed);
      expect(executedValue.status).toBe("executed");
      expect(executedValue.ok).toBe(true);
      expect(executedValue.repositoryChanged).toBe(true);

      const status = spawnSync("git", ["-C", repoRoot, "status", "--short"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(status.stdout).toContain("A  tracked.txt");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("requires the exact preview token before execution", () => {
    const workspace = mkdtempSync(join(tmpdir(), "repo-harness-mcp-repo-command-token-"));
    const controllerHome = join(workspace, "controller-home");
    const repoRoot = join(workspace, "sample-repo");
    try {
      mkdirSync(controllerHome, { recursive: true });
      mkdirSync(repoRoot, { recursive: true });
      git(repoRoot, ["init", "-b", "main"]);
      git(repoRoot, ["config", "user.name", "Repo Harness Test"]);
      git(repoRoot, ["config", "user.email", "repo-harness-test@example.com"]);
      writeFileSync(join(repoRoot, "README.md"), "hello\n");
      git(repoRoot, ["add", "README.md"]);
      git(repoRoot, ["commit", "-m", "init"]);

      const repository = registerRepository({ path: repoRoot, controllerHome });
      writeFileSync(join(repoRoot, "tracked.txt"), "v1\n");

      const executed = callRepositoryTool(controllerHome, "repository_command_execute", {
        repo_id: repository.repoId,
        command: "git add tracked.txt",
        approval_token: "wrong-token",
      });
      const value = json(executed);
      expect(value.status).toBe("approval_required");
      expect(value.after).toBeUndefined();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
