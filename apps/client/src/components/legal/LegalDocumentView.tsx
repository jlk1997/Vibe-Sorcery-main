import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../PageShell";
import { vibeApi } from "../../services/api";
import { getBundledLegalDocument } from "../../data/legal-documents";
import "./LegalDocumentView.scss";

type Props = {
  slug: string;
  title?: string;
};

function stripMarkdownTables(text: string): string {
  return text.replace(/^\|.+\|\s*\n\|[-| :]+\|\s*\n(?:\|.+\|\s*\n?)+/gm, (block) => {
    const rows = block.trim().split("\n").filter((line) => !/^\|[-| :]+\|$/.test(line.trim()));
    return rows
      .map((row) =>
        row
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join("："),
      )
      .join("\n\n");
  });
}

function formatParagraphs(content: string): string[] {
  const plain = stripMarkdownTables(content.replace(/^#+\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1"));
  return plain.split(/\n\n+/).filter(Boolean);
}

export function LegalDocumentView({ slug, title }: Props) {
  const { copy } = useLocale();
  const [content, setContent] = useState("");
  const [docTitle, setDocTitle] = useState(title || "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const bundled = getBundledLegalDocument(slug);
    if (bundled) {
      setContent(bundled.content);
      setDocTitle(bundled.title);
      setLoading(false);
    }

    if (process.env.TARO_ENV === "weapp") return;

    vibeApi
      .getLegalDocument(slug)
      .then((doc) => {
        setContent(doc.content);
        setDocTitle(doc.title);
        setLoadError(false);
      })
      .catch(() => {
        if (!bundled) {
          setLoadError(true);
          Taro.showToast({ title: copy.workUi.loadFail, icon: "none" });
        }
      })
      .finally(() => setLoading(false));
  }, [slug, copy.workUi.loadFail]);

  const paragraphs = content ? formatParagraphs(content) : [];

  return (
    <PageShell title={docTitle || title} label={copy.legalUi.legalAndPrivacy} wide>
      <View className="legal-doc">
        {loading ? (
          <Text className="legal-doc__loading">加载中…</Text>
        ) : loadError && !paragraphs.length ? (
          <Text className="legal-doc__error">文档加载失败，请稍后重试或联系客服 privacy@vibe-sorcery.com</Text>
        ) : (
          paragraphs.map((p, i) => (
            <Text key={i} className="legal-doc__para">
              {p}
            </Text>
          ))
        )}
      </View>
    </PageShell>
  );
}
