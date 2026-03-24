import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-16 w-16 text-mc-neutral-400 mb-4" />
      <h3 className="text-lg font-semibold text-mc-slate-900">{title}</h3>
      <p className="text-sm text-foreground-muted mt-1 max-w-md">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
