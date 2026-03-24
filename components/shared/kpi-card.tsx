"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  /** Optional accent color class for icon bg, e.g. "bg-mc-app-legifirma/10" */
  accentClass?: string;
  /** Optional accent color class for icon, e.g. "text-mc-app-legifirma" */
  iconClass?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accentClass = "bg-mc-primary-100",
  iconClass = "text-mc-primary-700",
  trend,
}: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground-muted">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-foreground-muted">{subtitle}</p>
            {trend && (
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  trend.positive ? "text-mc-success-600" : "text-mc-error-600"
                )}
              >
                {trend.positive ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {trend.value}
              </div>
            )}
          </div>
          <div className={cn("rounded-full p-3", accentClass)}>
            <Icon className={cn("h-5 w-5", iconClass)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
