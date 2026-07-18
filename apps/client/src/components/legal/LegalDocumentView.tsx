import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../PageShell";
import { vibeApi } from "../../services/api";
import "./LegalDocumentView.scss";

type Props = {
  slug: string;
  title?: string;
};

export function LegalDocumentView({ slug, title }: Props) {
  const { copy } = useLocale();
  const [content, setContent] = useState("");
  const [docTitle, setDocTitle] = useState(title || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vibeApi
      .getLegalDocument(slug)
      .then((doc) => {
        setContent(doc.content);
        setDocTitle(doc.title);
      })
      .catch(() => {
        Taro.showToast({ title: copy.workUi.loadFail, icon: "none" });
      })
      .finally(() => setLoading(false));
  }, [slug, copy.workUi.loadFail]);

  const paragraphs = content.split(/\n\n+/).filter(Boolean);

  return (
    <PageShell title={docTitle || title} label={copy.legalUi.legalAndPrivacy} wide>
      <ScrollView scrollY className="legal-doc">
        {loading ? (
          <Text className="legal-doc__loading">加载中…</Text>
        ) : (
          paragraphs.map((p, i) => (
            <Text key={i} className="legal-doc__para">
              {p}
            </Text>
          ))
        )}
      </ScrollView>
    </PageShell>
  );
}
