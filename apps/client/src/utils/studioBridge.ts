import Taro from "@tarojs/taro";
import type { StudioAction } from "@vibe-sorcery/types";
import { setItem } from "../platform/storage";
import { STACK_PAGE_ROUTES } from "../constants/routes";

/** Apply Copilot StudioAction list — prefill storage keys then navigate. */
export function applyStudioActions(actions: StudioAction[]): void {
  let navigatePath: string | null = null;
  let navigateParams: Record<string, string> | undefined;

  for (const action of actions) {
    switch (action.type) {
      case "prefill_create": {
        setItem("create:mode", action.mode);
        if (action.payload.text_intent) setItem("create:seedIntent", action.payload.text_intent);
        if (action.payload.preset_id) setItem("create:presetId", action.payload.preset_id);
        if (action.payload.seed_work_id) setItem("create:seedWorkId", action.payload.seed_work_id);
        if (action.payload.reference_work_id) setItem("create:referenceWorkId", action.payload.reference_work_id);
        if (action.payload.lyrics) setItem("create:lyrics", action.payload.lyrics);
        if (action.payload.creative_spec) {
          setItem("create:creativeSpec", JSON.stringify(action.payload.creative_spec));
        }
        break;
      }
      case "prefill_journey": {
        if (action.payload.text_intent) setItem("journey:seedIntent", action.payload.text_intent);
        setItem("journey:waypoints", JSON.stringify(action.payload.journey));
        if (action.payload.title) setItem("journey:title", action.payload.title);
        break;
      }
      case "navigate": {
        navigatePath = action.path;
        navigateParams = action.params;
        break;
      }
      case "show_paywall":
        navigatePath = STACK_PAGE_ROUTES.pricing;
        break;
      case "start_generation":
        setItem("create:mode", action.mode);
        if (action.estimate?.cost != null) {
          setItem("create:copilotEstimate", String(action.estimate.cost));
        }
        setItem("create:copilotConfirm", "1");
        navigatePath = "/pages/create/index";
        navigateParams = { mode: action.mode };
        break;
      default:
        break;
    }
  }

  if (!navigatePath) return;

  const query = navigateParams
    ? Object.entries(navigateParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  const url = query ? `${navigatePath}?${query}` : navigatePath;

  if (navigatePath.startsWith("/package") || navigatePath.includes("/package")) {
    Taro.navigateTo({ url });
  } else if (navigatePath.includes("/pages/create/")) {
    Taro.switchTab({ url: navigatePath.split("?")[0] });
  } else {
    Taro.navigateTo({ url });
  }
}
