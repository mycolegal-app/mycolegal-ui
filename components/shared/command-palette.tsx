"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandResultGroup {
  key: string;
  heading: ReactNode;
  items: CommandResultItem[];
}

export interface CommandResultItem {
  id: string;
  onSelect: () => void;
  content: ReactNode;
}

export interface CommandQuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  searchEndpoint: string;
  placeholder?: string;
  /** Transform raw API response into groups of results */
  mapResults: (data: any) => CommandResultGroup[];
  /** Quick actions shown when query is empty */
  quickActions?: CommandQuickAction[];
  /** Minimum query length to trigger search */
  minQueryLength?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  searchEndpoint,
  placeholder = "Buscar...",
  mapResults,
  quickActions,
  minQueryLength = 2,
  debounceMs = 250,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<CommandResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcuts: Cmd+K to toggle, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        handleOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const search = useCallback(
    async (q: string) => {
      if (q.length < minQueryLength) {
        setGroups([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `${searchEndpoint}?q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const json = await res.json();
          setGroups(mapResults(json.data));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [searchEndpoint, mapResults, minQueryLength]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), debounceMs);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setGroups([]);
    }
  }

  function close() {
    handleOpenChange(false);
  }

  const hasResults = groups.some((g) => g.items.length > 0);
  const noResults = !hasResults && query.length >= minQueryLength && !loading;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Búsqueda general</span>
        <kbd className="ml-2 hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50 sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />
          <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border bg-white shadow-2xl">
            <Command shouldFilter={false}>
              <div className="flex items-center border-b px-4">
                <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
                <Command.Input
                  value={query}
                  onValueChange={handleQueryChange}
                  placeholder={placeholder}
                  className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setGroups([]); }}
                    className="ml-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Command.List className="max-h-[360px] overflow-y-auto p-2">
                {loading && (
                  <Command.Loading>
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      Buscando...
                    </div>
                  </Command.Loading>
                )}

                {noResults && (
                  <Command.Empty className="px-4 py-6 text-center text-sm text-gray-500">
                    No se encontraron resultados para &quot;{query}&quot;
                  </Command.Empty>
                )}

                {/* Dynamic result groups */}
                {groups.map((group) =>
                  group.items.length > 0 ? (
                    <Command.Group key={group.key} heading={group.heading}>
                      {group.items.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={item.id}
                          onSelect={() => { item.onSelect(); close(); }}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-gray-100 aria-selected:bg-gray-100"
                        >
                          {item.content}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null
                )}

                {/* Quick actions when empty */}
                {!query && quickActions && quickActions.length > 0 && (
                  <Command.Group
                    heading={
                      <span className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                        Accesos rápidos
                      </span>
                    }
                  >
                    {quickActions.map((action) => (
                      <Command.Item
                        key={action.id}
                        value={action.id}
                        onSelect={() => { action.onSelect(); close(); }}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-gray-100 aria-selected:bg-gray-100"
                      >
                        {action.icon}
                        {action.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>

              <div className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-gray-400">
                <div className="flex items-center gap-3">
                  <span><kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono">↑↓</kbd> navegar</span>
                  <span><kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono">↵</kbd> abrir</span>
                  <span><kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono">esc</kbd> cerrar</span>
                </div>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
