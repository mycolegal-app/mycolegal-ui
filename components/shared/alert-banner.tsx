"use client";

import { AlertTriangle, XCircle, Info, CheckCircle, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface AlertBannerProps {
  type: "warning" | "error" | "info" | "success";
  message: string;
  onDismiss?: () => void;
}

const config = {
  warning: {
    icon: AlertTriangle,
    bg: "bg-mc-warning-50 border-mc-warning-500/30",
    text: "text-mc-warning-700",
    iconColor: "text-mc-warning-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-mc-error-50 border-mc-error-500/30",
    text: "text-mc-error-700",
    iconColor: "text-mc-error-500",
  },
  info: {
    icon: Info,
    bg: "bg-mc-info-50 border-mc-info-500/30",
    text: "text-mc-info-700",
    iconColor: "text-mc-info-500",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-mc-success-50 border-mc-success-500/30",
    text: "text-mc-success-700",
    iconColor: "text-mc-success-500",
  },
};

export function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const { icon: Icon, bg, text, iconColor } = config[type];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        bg
      )}
      role="alert"
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0", iconColor)} />
      <p className={cn("flex-1 text-sm", text)}>{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "flex-shrink-0 rounded-sm p-1 transition-opacity hover:opacity-70",
            text
          )}
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
