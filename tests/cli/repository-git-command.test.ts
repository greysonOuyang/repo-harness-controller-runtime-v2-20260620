import { describe, expect, test } from "bun:test";
import { classifyRepositoryCommand } from "../../src/cli/repositories/command-executor";

describe("repository git command classification", () => {
  test("ordinary git write commands require authorization instead of strong confirmation", () => {
    expect(classifyRepositoryCommand("git fetch origin --prune")).toMatchObject({
      risk: "workspace_write",
      confirmation: "authorization",
    });

    expect(classifyRepositoryCommand("git cherry-pick 167d05726438d803ce7a2b230b64bb4086c877d3")).toMatchObject({
      risk: "workspace_write",
      confirmation: "authorization",
    });
  });

  test("read-only git commands stay confirmation-free", () => {
    expect(classifyRepositoryCommand("git branch --show-current")).toMatchObject({
      risk: "readonly",
      confirmation: "none",
    });
  });

  test("truly destructive git commands require strong confirmation", () => {
    expect(classifyRepositoryCommand("git reset --hard HEAD")).toMatchObject({
      risk: "destructive",
      confirmation: "strong_confirmation",
    });

    expect(classifyRepositoryCommand("git clean -fdx")).toMatchObject({
      risk: "destructive",
      confirmation: "strong_confirmation",
    });
  });
});
