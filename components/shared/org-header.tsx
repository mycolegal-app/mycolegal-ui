"use client";

interface OrgHeaderProps {
  /** Organization name */
  orgName: string;
  /** Base64-encoded logo (data URI) or null */
  orgLogo?: string | null;
  /** Optional CSS class for the container */
  className?: string;
}

export function OrgHeader({ orgName, orgLogo, className = "" }: OrgHeaderProps) {
  return (
    <div className={`flex items-center gap-3 border-b border-mc-neutral-200 bg-white px-5 py-3 ${className}`}>
      {orgLogo ? (
        <img
          src={orgLogo}
          alt={orgName}
          className="h-8 shrink-0 rounded-md object-contain"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-mc-primary-100 text-sm font-bold text-mc-primary-700">
          {orgName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-mc-slate-700 truncate">{orgName}</span>
    </div>
  );
}
