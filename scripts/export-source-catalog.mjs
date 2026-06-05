import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accessMatrix, inviteFlow, providerRegistry, providerSamples, sharingPlan, syncBlueprint } from "../data/provider-sources.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputsDir = path.join(rootDir, "outputs");
const outputPath = path.join(outputsDir, "data-source-catalog.json");

const payload = {
  accessMatrix,
  generatedAt: new Date().toISOString(),
  inviteFlow,
  providerRegistry,
  providerSamples,
  sharingPlan,
  syncBlueprint,
};

await mkdir(outputsDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
