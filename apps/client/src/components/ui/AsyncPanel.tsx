import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { IconName } from "./Icon";

type Props = {
  loading: boolean;
  error?: boolean;
  empty?: boolean;
  skeletonCount?: number;
  errorIcon?: IconName;
  errorTitle: string;
  errorActionLabel?: string;
  onRetry?: () => void;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  children: ReactNode;
};

export function AsyncPanel({
  loading,
  error = false,
  empty = false,
  skeletonCount = 3,
  errorIcon = "feed",
  errorTitle,
  errorActionLabel,
  onRetry,
  emptyIcon = "discover",
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  children,
}: Props) {
  if (loading) return <LoadingSkeleton count={skeletonCount} />;
  if (error) {
    return (
      <EmptyState
        iconName={errorIcon}
        title={errorTitle}
        actionLabel={errorActionLabel}
        onAction={onRetry}
      />
    );
  }
  if (empty && emptyTitle) {
    return (
      <EmptyState
        iconName={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }
  return <>{children}</>;
}
