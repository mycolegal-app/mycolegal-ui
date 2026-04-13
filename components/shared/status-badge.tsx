"use client";

import { cn } from "../../lib/utils";
import * as Tooltip from "@radix-ui/react-tooltip";

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  variant?: "default" | "info" | "warning" | "success" | "destructive" | "secondary";
  tooltip?: string;
}

const variantStyles = {
  default: "bg-gray-100 text-gray-700 border-gray-300",
  info: "bg-blue-100 text-blue-700 border-blue-300",
  warning: "bg-amber-100 text-amber-700 border-amber-300",
  success: "bg-green-100 text-green-700 border-green-300",
  destructive: "bg-red-100 text-red-700 border-red-300",
  secondary: "bg-slate-100 text-slate-700 border-slate-300",
};

export function StatusBadge({ label, variant = "default", tooltip, className, ...rest }: StatusBadgeProps) {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className
      )}
      {...rest}
    >
      {label}
    </span>
  );

  if (!tooltip) return badge;

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{badge}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-md animate-in fade-in-0 zoom-in-95"
            sideOffset={5}
          >
            {tooltip}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
