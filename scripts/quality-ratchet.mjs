#!/usr/bin/env node
// Quality ratchet: fails if TypeScript or ESLint error counts rise above the committed baseline.
// Existing debt doesn't block deploys, but it can only go down.
//   node scripts/quality-ratchet.mjs            check against quality-baseline.json
//   node scripts/quality-ratchet.mjs --update   lower the baseline after fixing errors (never raises it)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASELINE_FILE = new URL("../quality-baseline.json", import.meta.url);
const update = process.argv.includes("--update");

function run(cmd) {
  const res = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`Could not run "${cmd}": ${res.error.message}`);
  return `${res.stdout ?? ""}${res.stderr ?? ""}`;
}

function countTsc() {
  // Ignore generated .next/ types: they are local build artifacts and differ between machines and CI.
  return run("npx tsc --noEmit --pretty false")
    .split(/\r?\n/)
    .filter((line) => /error TS\d+/.test(line) && !/^\.next[\\/]/.test(line.trim())).length;
}

function countEslint() {
  const out = run("npx eslint src --format json");
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`ESLint did not return JSON:\n${out.slice(0, 500)}`);
  const results = JSON.parse(out.slice(start, out.lastIndexOf("]") + 1));
  return results.reduce((sum, file) => sum + file.errorCount, 0);
}

try {
  const current = { tsc: countTsc(), eslint: countEslint() };
  const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : null;
  console.log(`TypeScript errors: ${current.tsc}${baseline ? ` (baseline ${baseline.tsc})` : ""}`);
  console.log(`ESLint errors (src): ${current.eslint}${baseline ? ` (baseline ${baseline.eslint})` : ""}`);

  if (!baseline || update) {
    const next = baseline
      ? { tsc: Math.min(baseline.tsc, current.tsc), eslint: Math.min(baseline.eslint, current.eslint) }
      : current;
    writeFileSync(BASELINE_FILE, JSON.stringify({ ...next, updated: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
    console.log(`Baseline written: tsc=${next.tsc}, eslint=${next.eslint}`);
    process.exit(0);
  }

  const regressions = ["tsc", "eslint"].filter((k) => current[k] > baseline[k]);
  if (regressions.length) {
    console.error(`Quality regression in: ${regressions.join(", ")}. Fix the new errors before deploying.`);
    process.exit(1);
  }
  if (current.tsc < baseline.tsc || current.eslint < baseline.eslint) {
    console.log("Fewer errors than baseline: run `npm run quality:update` and commit to lock in the improvement.");
  }
  console.log("Quality ratchet passed.");
} catch (error) {
  console.error(`[quality-ratchet] ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}
