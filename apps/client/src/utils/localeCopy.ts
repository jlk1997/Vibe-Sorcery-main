import { getCopy, type Locale } from "@vibe-sorcery/i18n";
import { getStoredLocale } from "./localeStorage";

export function getLocaleCopy() {
  return getCopy(getStoredLocale());
}
