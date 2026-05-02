import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "muted";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn("ui-badge", `ui-badge--${variant}`, className)}
      {...props}
    />
  );
}
