#!/usr/bin/env node
/**
 * Quick API health smoke — used before deploy or after docker-compose up.
 * Usage: node scripts/smoke-health.mjs [baseUrl]
 */
const base = (process.argv[2] || process.env.API_PUBLIC_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");

async function main() {
  const res = await fetch(`${base}/health`);
  if (!res.ok) {
    console.error(`Health check failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  const checks = body.checks || {};
  console.log(`status=${body.status}`);
  for (const [name, info] of Object.entries(checks)) {
    const ok = info?.ok ?? info?.status === "ok";
    console.log(`  ${name}: ${ok ? "ok" : JSON.stringify(info)}`);
    if (!ok && name === "database") process.exitCode = 1;
  }
  if (process.exitCode) {
    console.error("Critical dependency unhealthy");
    process.exit(process.exitCode);
  }
  console.log("Smoke health OK");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
