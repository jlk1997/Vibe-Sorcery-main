import { LegalDocumentView } from "../../../components/legal/LegalDocumentView";
import { LEGAL_SLUGS } from "../../../utils/legal";

export default function CommunityRulesPage() {
  return <LegalDocumentView slug={LEGAL_SLUGS.communityRules} />;
}
