import { LegalDocumentView } from "../../../components/legal/LegalDocumentView";
import { LEGAL_SLUGS } from "../../../utils/legal";

export default function PrivacyPage() {
  return <LegalDocumentView slug={LEGAL_SLUGS.privacy} />;
}
