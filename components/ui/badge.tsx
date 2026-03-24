import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-mc-slate-700 text-white",
        secondary:
          "border-transparent bg-mc-neutral-100 text-mc-slate-700",
        destructive:
          "border-transparent bg-mc-error-100 text-mc-error-700",
        outline:
          "text-foreground",
        success:
          "border-transparent bg-mc-success-100 text-mc-success-700",
        warning:
          "border-transparent bg-mc-warning-100 text-mc-warning-700",
        info:
          "border-transparent bg-mc-info-100 text-mc-info-700",
        premium:
          "border-mc-primary-300 bg-mc-primary-50 text-mc-primary-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
