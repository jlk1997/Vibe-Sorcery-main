import { Image, Text, View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import iconUrl from "../../assets/brand/logo-icon.svg";
import wordmarkUrl from "../../assets/brand/logo-wordmark.svg";
import { BRAND_ICON_DATA_URI, BRAND_WORDMARK_DATA_URI } from "./brandLogoData";
import "./BrandLogo.scss";

function brandImageSrc(imported: string, h5DataUri: string): string {
  if (imported.startsWith("data:")) return imported;
  return process.env.TARO_ENV === "h5" ? h5DataUri : imported;
}

type Variant = "icon" | "wordmark" | "lockup";

type Props = {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
  name?: string;
  tagline?: string;
};

const ICON_SIZES = { sm: 32, md: 40, lg: 56 } as const;

export function BrandLogo({
  variant = "lockup",
  size = "md",
  showName = true,
  className,
  name,
  tagline,
}: Props) {
  const px = ICON_SIZES[size];
  const iconSrc = brandImageSrc(iconUrl, BRAND_ICON_DATA_URI);
  const wordmarkSrc = brandImageSrc(wordmarkUrl, BRAND_WORDMARK_DATA_URI);

  if (variant === "wordmark") {
    return (
      <Image
        className={clsx("brand-logo brand-logo--wordmark", `brand-logo--${size}`, className)}
        src={wordmarkSrc}
        mode="aspectFit"
      />
    );
  }

  if (variant === "icon") {
    return (
      <Image
        className={clsx("brand-logo brand-logo--icon", `brand-logo--${size}`, className)}
        src={iconSrc}
        mode="aspectFit"
        style={{ width: `${px}px`, height: `${px}px` }}
      />
    );
  }

  return (
    <View className={clsx("brand-logo brand-logo--lockup", `brand-logo--${size}`, className)}>
      <Image
        className="brand-logo__icon"
        src={iconSrc}
        mode="aspectFit"
        style={{ width: `${px}px`, height: `${px}px` }}
      />
      {showName && (name || tagline) ? (
        <View className="brand-logo__text">
          {name ? <Text className="brand-logo__name">{name}</Text> : null}
          {tagline ? <Text className="brand-logo__tagline">{tagline}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
