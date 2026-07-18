import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "src");

const extendFiles = new Set([
  "components/engagement/EngagementPanel.scss",
  "pages/pricing/index.scss",
  "packageStack/pages/pricing/index.scss",
  "components/community/WorkCard.scss",
  "components/ui/SceneCard.scss",
  "components/community/ChallengeCard.scss",
  "components/ui/ProvenanceTimeline.scss",
  "components/studio/AvWaypointMap.scss",
  "components/studio/WaypointTimeline.scss",
  "components/studio/AudioAnchorPanel.scss",
  "components/studio/VariationPicker.scss",
  "components/ui/FeatureCard.scss",
  "components/ui/LibraryShelf.scss",
  "components/ui/SectionLabel.scss",
  "components/ui/PageHeader.scss",
  "components/ui/ListRow.scss",
  "components/ui/PricingPackCard.scss",
  "components/studio/RitualTimeline.scss",
  "pages/create/index.scss",
  "components/ui/ChatBubble.scss",
  "components/ui/RingGauge.scss",
  "components/GlobalJobBanner.scss",
  "components/ui/StepRail.scss",
  "components/ui/HeroPrompt.scss",
  "packageStack/pages/work/index.scss",
  "pages/work/index.scss",
  "packageStack/pages/login/index.scss",
  "pages/login/index.scss",
  "packageStack/pages/challenge/index.scss",
  "components/ui/ui.scss",
  "components/onboarding/CoachMarks.scss",
  "components/PageShell.scss",
  "pages/profile/index.scss",
  "components/studio/GenerationProgress.scss",
  "packageStudio/pages/provenance/index.scss",
  "components/studio/GenerationReveal.scss",
]);

const keepTheme = new Set(["app.scss"]);
const themeRe = /^@import\s+["'].*theme\.scss["'];\s*\n?/m;

function utilitiesImport(rel) {
  if (rel.startsWith("styles/")) return '@import "./_utilities.scss";\n';
  const depth = rel.split("/").length - 1;
  return `@import "${"../".repeat(depth)}styles/_utilities.scss";\n`;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".scss")) {
      const rel = path.relative(root, p).replace(/\\/g, "/");
      if (keepTheme.has(rel)) continue;
      let src = fs.readFileSync(p, "utf8");
      if (!themeRe.test(src)) continue;
      if (extendFiles.has(rel)) {
        src = src.replace(themeRe, utilitiesImport(rel));
        console.log(`UTILS ${rel}`);
      } else {
        src = src.replace(themeRe, "");
        console.log(`DROP ${rel}`);
      }
      fs.writeFileSync(p, src);
    }
  }
}

walk(root);
