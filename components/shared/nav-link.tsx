"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * NavLink — drop-in replacement for Next.js Link that uses full-page navigation.
 *
 * Next.js App Router's client-side routing (router.push) can fail silently
 * in certain configurations (e.g. output: 'standalone'). This component
 * preserves <a> semantics (accessibility, right-click, cmd+click open in
 * new tab) while forcing window.location navigation on regular clicks.
 *
 * Use this instead of `next/link` for all internal navigation links.
 */
export function NavLink(props: ComponentProps<typeof Link>) {
  const { onClick, href, ...rest } = props;
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onClick?.(e);
        window.location.href = typeof href === "string" ? href : href.toString();
      }}
      {...rest}
    />
  );
}
