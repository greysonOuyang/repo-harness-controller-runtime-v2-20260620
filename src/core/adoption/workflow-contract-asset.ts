import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const moduleDir = typeof import.meta.dir === "string" ? import.meta.dir : dirname(fileURLToPath(import.meta.url));
export const WORKFLOW_CONTRACT_ASSET_PATH = join(moduleDir, "..", "..", "..", "assets", "workflow-contract.v1.json");

export function readWorkflowContractAsset(): string {
  return readFileSync(WORKFLOW_CONTRACT_ASSET_PATH, "utf-8");
}

export function loadWorkflowContractAsset<T>(): T {
  return JSON.parse(readWorkflowContractAsset()) as T;
}
