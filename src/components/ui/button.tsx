import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

const buttonVariants = cva("ui-button", {
  defaultVariants: {
    size: "default",
    variant: "default",
  },
  variants: {
    size: {
      default: "ui-button--default-size",
      icon: "ui-button--icon-size",
      sm: "ui-button--sm-size",
    },
    variant: {
      default: "ui-button--default",
      destructive: "ui-button--destructive",
      ghost: "ui-button--ghost",
      outline: "ui-button--outline",
      secondary: "ui-button--secondary",
    },
  },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  asChild,
  className,
  size,
  variant,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
}
