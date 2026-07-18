#!/usr/bin/env node
/**
 * Lightweight API smoke — health, public config, style presets.
 * Usage: node scripts/smoke-api.mjs [baseUrl]
 */
const base = (process.argv[2] || process.env.API_PUBLIC_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");

async function check(path, { expectOk = true, label = path } = {}) {
  const res = await fetch(`${base}${path}`);
  const body = await res.json().catch(() => ({}));
  const ok = expectOk ? res.ok : true;
  console.log(`${ok ? "✓" : "✗"} ${label} → ${res.status}`);
  if (!ok) {
    console.error(JSON.stringify(body));
    process.exitCode = 1;
  }
  return body;
}

async function main() {
  await check("/health", { label: "GET /health" });
  const presets = await check("/config/presets", { label: "GET /config/presets" });
  if (!Array.isArray(presets) || presets.length === 0) {
    console.error("✗ Expected at least one style preset");
    process.exitCode = 1;
  } else {
    console.log(`  presets: ${presets.length} loaded`);
  }
  await check("/config/platform", { label: "GET /config/platform" });
  const legal = await check("/legal/documents", { label: "GET /legal/documents" });
  if (!legal?.documents?.length) {
    console.error("✗ Expected legal documents");
    process.exitCode = 1;
  } else {
    console.log(`  legal docs: ${legal.documents.length}`);
  }
  const meta = await check("/legal/meta", { label: "GET /legal/meta" });
  if (!meta?.contact_email) {
    console.error("✗ Expected legal meta contact_email");
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log("API smoke OK");
  else process.exit(process.exitCode);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
