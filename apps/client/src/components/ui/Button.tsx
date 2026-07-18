import { Button as TaroButton, ButtonProps, View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

type Props = Omit<ButtonProps, "size"> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

const isH5 = process.env.TARO_ENV === "h5";

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  loading,
  disabled,
  ...rest
}: Props) {
  const busy = !!loading;

  return (
    <TaroButton
      className={clsx(
        "ui-btn",
        `ui-btn--${variant}`,
        size === "sm" && "ui-btn--sm",
        block && "ui-btn--block",
        busy && "ui-btn--busy",
        className
      )}
      disabled={disabled || (isH5 && busy)}
      {...(isH5 ? rest : { ...rest, loading })}
    >
      {isH5 && busy ? <View className="ui-btn__spinner" aria-hidden /> : null}
      {children}
    </TaroButton>
  );
}
