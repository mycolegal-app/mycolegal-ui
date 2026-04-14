"use client";

import { useState } from "react";
import { NavLink as Link } from "../shared/nav-link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

export interface ManualSection {
  title: string;
  href: string;
  icon?: React.ElementType;
  children?: { title: string; href: string }[];
}

interface ManualLayoutProps {
  sections: ManualSection[];
  children: React.ReactNode;
  appName?: string;
}

export function ManualLayout({ sections, children, appName = "Manual de Usuario" }: ManualLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = searchQuery
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.children?.some((c) =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : sections;

  function handleChildClick(href: string) {
    const [path, hash] = href.split("#");

    if (hash && pathname === path) {
      // Same page: just scroll to the anchor
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      // Different page: navigate (Next.js handles the hash after navigation)
      router.push(href);
    }
  }

  return (
    <div className="flex gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* Manual sidebar */}
      <aside data-manual-sidebar className="w-64 shrink-0 border-r bg-gray-50 overflow-y-auto">
        <div className="sticky top-0 bg-gray-50 p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-cyan-600" />
            <h2 className="font-semibold text-gray-900">{appName}</h2>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en el manual..."
              className="w-full rounded-md border bg-white pl-8 pr-8 py-1.5 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {filteredSections.map((section) => {
            const isActive = pathname === section.href || pathname.startsWith(section.href + "/");
            const Icon = section.icon;

            return (
              <div key={section.href}>
                <Link
                  href={section.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-cyan-50 text-cyan-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  {section.title}
                </Link>

                {/* Subsections */}
                {section.children && isActive && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {section.children.map((child) => (
                      <button
                        key={child.href}
                        onClick={() => handleChildClick(child.href)}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-left transition-colors cursor-pointer text-gray-500 hover:text-gray-700"
                      >
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        {child.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
