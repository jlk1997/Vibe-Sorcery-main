import { PropsWithChildren } from "react";

/** H5 tab pages keep all mounted page roots as siblings — do not wrap them in a shell. */
export function AppShell({ children }: PropsWithChildren) {
  return <>{children}</>;
}
