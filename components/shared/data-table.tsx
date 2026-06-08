"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Columns3 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useI18n } from "../i18n/i18n-context";

export interface RemoteDataSource {
  /** API endpoint to fetch from. Must return `{ data: T[], meta: { total, page, pageSize, totalPages } }`. */
  endpoint: string;
  /** Extra query params (filters like estado, tipo, etc.). DataTable adds `page`, `pageSize`, `search`. */
  extraParams?: Record<string, string | number | boolean | null | undefined>;
  /**
   * Threshold to auto-switch from client-side to server-side mode. Default 200.
   * If the first fetch reports `total <= threshold`, DataTable loads the full
   * dataset once and lets TanStack handle paginate/sort/filter in memory.
   * Otherwise it switches to server-side pagination and pushes `search` to
   * the API so queries hit the full population.
   */
  threshold?: number;
  /** Bump to force a refetch (e.g. after creating/updating a row). */
  refreshKey?: string | number;
  /** Query param name for the search term. Default `search`. */
  searchParam?: string;
  /**
   * Server-side sorting (only relevant when the dataset is large enough to run
   * in server mode). List the column ids the endpoint knows how to sort by;
   * only those headers become clickable in server mode, and clicking one sends
   * `sort=<columnId>&order=asc|desc` to the API (param names overridable below)
   * plus resets to page 1. In client mode (under `threshold`) TanStack keeps
   * sorting the fully-loaded set, so this is ignored. When omitted, server-mode
   * headers are not sortable — avoids the misleading "sorts only this page"
   * behaviour you'd otherwise get from client-side sorting over a server slice.
   */
  sortableColumns?: string[];
  /** Query param name for the sort column. Default `sort`. */
  sortParam?: string;
  /** Query param name for the sort direction (`asc`/`desc`). Default `order`. */
  orderParam?: string;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  /** Inline dataset. Mutually exclusive with `source` (use one or the other). */
  data?: TData[];
  /** Remote dataset with auto client/server mode. See {@link RemoteDataSource}. */
  source?: RemoteDataSource;
  /** Legacy: enables column-scoped client-side filtering on the named column. Ignored when `source` is set. */
  searchKey?: string;
  searchPlaceholder?: string;
  searchDataHelp?: string;
  /** When `source` is used, render a search input that filters the full population. Default true. */
  searchable?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  rowClassName?: (row: TData) => string;
  enableColumnVisibility?: boolean;
  toolbar?: ReactNode;
  /**
   * When true, only the tbody scrolls (thead stays sticky) so the page
   * chrome (title, toolbar, paginator) remains visible. Off by default to
   * preserve legacy natural-flow behaviour.
   */
  scrollable?: boolean;
  /**
   * When true together with `scrollable`, the DataTable becomes a flex column
   * that fills its parent (which must be a flex column with a definite height,
   * e.g. `flex h-full min-h-0 flex-col`). The tbody scroll area grows to fill
   * whatever space remains under the toolbar and above the paginator instead of
   * relying on `scrollBodyMaxHeight`. Use this when the page owns its own
   * height (project rule: pages don't scroll, lists do).
   */
  fillParent?: boolean;
  /**
   * CSS max-height for the scroll area when `scrollable` is true. Defaults
   * to a viewport-relative value that fits under a typical page chrome:
   * AppSwitcherBar (expanded ~52px) + header (h-14) + breadcrumb + toolbar
   * + paginator. Ignored when `fillParent` is true. Override on a per-page
   * basis if your page has additional chrome above the table.
   */
  scrollBodyMaxHeight?: string;
  /**
   * Opt in to server-driven pagination. When true, the component drives
   * navigation via `onPaginationChange` and trusts `pageCount` / `totalRows`
   * instead of deriving them from the in-memory `data` slice. Leave false
   * for small, fully-loaded tables where client-side paging is fine.
   * Ignored when `source` is set (mode is auto-decided).
   */
  manualPagination?: boolean;
  /** Controlled page index (0-based). Only used when `manualPagination`. */
  pageIndex?: number;
  /** Total rows across all pages (for "Mostrando X-Y de N"). */
  totalRows?: number;
  /** Total pages — server-reported. */
  pageCount?: number;
  /** Called when the user changes page or page size. */
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  /**
   * Slot que se renderiza en el footer del paginador, a la derecha del
   * selector de "registros por página". Útil para filtros toggleables
   * (ej. "Mostrar inactivos") que la página quiere mantener cerca del
   * paginador en lugar de consumir una fila propia arriba de la tabla.
   */
  paginatorExtras?: ReactNode;
}

type Mode = "init" | "client" | "server";

interface SourceState<T> {
  data: T[];
  total: number;
  mode: Mode;
  loading: boolean;
  /**
   * Fetch error: `"forbidden"` for HTTP 403 (no permission), `"error"` for any
   * other non-2xx / network failure, `null` when the last fetch succeeded.
   * Without this a 403 left `data:[]` and rendered as "no data" — a silent 403
   * indistinguishable from an empty list.
   */
  error: "forbidden" | "error" | null;
  pageIndex: number;
  pageSize: number;
  searchInput: string;
  searchDebounced: string;
  /** `<columnId>:<asc|desc>` when sorting server-side, else null. */
  serverSort: string | null;
}

function useRemoteSource<T>(
  source: RemoteDataSource | undefined,
  initialPageSize: number,
): {
  enabled: boolean;
  state: SourceState<T>;
  setSearchInput: (v: string) => void;
  setPageIndex: (idx: number) => void;
  setPageSize: (size: number) => void;
  setServerSort: (v: string | null) => void;
} {
  const threshold = source?.threshold ?? 200;
  const searchParam = source?.searchParam ?? "search";
  const sortParam = source?.sortParam ?? "sort";
  const orderParam = source?.orderParam ?? "order";
  const extraParams = source?.extraParams;
  const extraParamsKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);
  const refreshKey = source?.refreshKey;
  const endpoint = source?.endpoint;

  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<Mode>("init");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [pageIndex, setPageIndexState] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInputState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [serverSort, setServerSortState] = useState<string | null>(null);
  // Ref so the (memoised) fetcher always reads the current sort without being
  // re-created on every sort change.
  const serverSortRef = useRef<string | null>(null);
  const setServerSort = useCallback((v: string | null) => {
    if (serverSortRef.current === v) return;
    serverSortRef.current = v;
    setServerSortState(v);
  }, []);
  const reqCounter = useRef(0);

  // Debounce search input → searchDebounced (sent to server in server mode,
  // used as globalFilter in client mode).
  useEffect(() => {
    if (!source) return;
    const h = setTimeout(() => setSearchDebounced(searchInput.trim()), 300);
    return () => clearTimeout(h);
  }, [searchInput, source]);

  // Reset to page 1 when filters or sort change.
  useEffect(() => {
    if (!source) return;
    setPageIndexState(0);
  }, [extraParamsKey, searchDebounced, serverSort, source]);

  const fetcher = useCallback(
    async (params: { page: number; size: number; search: string; isProbe: boolean }) => {
      if (!endpoint) return;
      const myReq = ++reqCounter.current;
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("page", String(params.page));
        qs.set("pageSize", String(params.size));
        if (params.search) qs.set(searchParam, params.search);
        if (serverSortRef.current) {
          const sep = serverSortRef.current.lastIndexOf(":");
          const sid = serverSortRef.current.slice(0, sep);
          const sdir = serverSortRef.current.slice(sep + 1);
          if (sid) {
            qs.set(sortParam, sid);
            qs.set(orderParam, sdir === "desc" ? "desc" : "asc");
          }
        }
        if (extraParams) {
          for (const [k, v] of Object.entries(extraParams)) {
            if (v === null || v === undefined || v === "") continue;
            qs.set(k, String(v));
          }
        }
        const res = await fetch(`${endpoint}?${qs.toString()}`);
        if (myReq !== reqCounter.current) return; // stale
        if (!res.ok) {
          // Surface the failure instead of rendering an empty table: a 403
          // (no permission) otherwise looked identical to "no data".
          setError(res.status === 403 ? "forbidden" : "error");
          setData([]);
          setTotal(0);
          if (params.isProbe) setMode("client");
          return;
        }
        const json = await res.json();
        if (myReq !== reqCounter.current) return; // stale
        setError(null);
        const rows: T[] = json.data ?? [];
        const totalRows: number = json.meta?.total ?? rows.length;
        setData(rows);
        setTotal(totalRows);
        if (params.isProbe) {
          setMode(totalRows <= threshold ? "client" : "server");
        }
      } catch {
        if (myReq !== reqCounter.current) return; // stale
        setError("error");
        setData([]);
        setTotal(0);
        if (params.isProbe) setMode("client");
      } finally {
        if (myReq === reqCounter.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, extraParamsKey, searchParam, sortParam, orderParam, threshold],
  );

  // Probe fetch on mount / when filters/search/refreshKey change.
  useEffect(() => {
    if (!source) return;
    setMode("init");
    fetcher({ page: 1, size: threshold, search: searchDebounced, isProbe: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraParamsKey, searchDebounced, refreshKey, threshold, endpoint]);

  // In server mode, refetch when pageIndex, pageSize or sort change.
  useEffect(() => {
    if (!source) return;
    if (mode !== "server") return;
    fetcher({ page: pageIndex + 1, size: pageSize, search: searchDebounced, isProbe: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pageSize, mode, serverSort]);

  return {
    enabled: Boolean(source),
    state: { data, total, mode, loading, error, pageIndex, pageSize, searchInput, searchDebounced, serverSort },
    setSearchInput: setSearchInputState,
    setPageIndex: setPageIndexState,
    setPageSize: (size: number) => {
      setPageSizeState(size);
      setPageIndexState(0);
    },
    setServerSort,
  };
}

export function DataTable<TData, TValue>({
  columns,
  data: inlineData,
  source,
  searchKey,
  searchPlaceholder,
  searchDataHelp,
  searchable = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions,
  rowClassName,
  enableColumnVisibility = false,
  toolbar,
  scrollable = false,
  fillParent = false,
  scrollBodyMaxHeight = "calc(100vh - 360px)",
  manualPagination: manualPaginationProp = false,
  pageIndex: controlledPageIndex,
  totalRows: controlledTotalRows,
  pageCount: controlledPageCount,
  onPaginationChange,
  paginatorExtras,
}: DataTableProps<TData, TValue>) {
  const { t } = useI18n();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("ui.dataTable.searchPlaceholder");

  // Remote source state (no-op when `source` is undefined).
  const remote = useRemoteSource<TData>(source, initialPageSize);

  // Resolve which data/pagination source the table actually uses.
  const usingSource = remote.enabled;
  const data = usingSource ? remote.state.data : inlineData ?? [];
  const manualPagination = usingSource
    ? remote.state.mode === "server"
    : manualPaginationProp;
  const effectiveControlledPageIndex = usingSource
    ? remote.state.pageIndex
    : controlledPageIndex;
  const effectiveControlledPageCount = usingSource
    ? Math.max(1, Math.ceil(remote.state.total / Math.max(1, remote.state.pageSize)))
    : controlledPageCount;
  const effectiveControlledTotalRows = usingSource ? remote.state.total : controlledTotalRows;
  const effectiveInitialPageSize = usingSource ? remote.state.pageSize : initialPageSize;

  // Server-side sorting only kicks in when a remote source runs in server mode.
  const serverSortMode = usingSource && remote.state.mode === "server";
  const sortableColumnsKey = JSON.stringify(source?.sortableColumns ?? null);
  // In server mode, restrict clickable sort headers to the columns the endpoint
  // can actually sort (declared via `source.sortableColumns`). Without that
  // allow-list, server-mode headers stay non-sortable so we never show the
  // misleading "sorts just this page" behaviour. Client mode is untouched.
  const resolvedColumns = useMemo(() => {
    if (!serverSortMode) return columns;
    const allow = new Set(source?.sortableColumns ?? []);
    return columns.map((c) => {
      const id = (c.id ?? (c as { accessorKey?: string }).accessorKey) as string | undefined;
      return { ...c, enableSorting: id ? allow.has(id) : false };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, serverSortMode, sortableColumnsKey]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [currentPageSize, setCurrentPageSize] = useState(effectiveInitialPageSize);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Keep the internal page size in sync when the parent changes it
  // (e.g. a controlled paginator bumping from 20 → 50).
  useEffect(() => {
    setCurrentPageSize(effectiveInitialPageSize);
  }, [effectiveInitialPageSize]);

  // Push the active sort to the remote source when in server mode so the
  // server re-queries the full population (not just the current page slice).
  useEffect(() => {
    if (!serverSortMode) return;
    const s = sorting[0];
    remote.setServerSort(s ? `${s.id}:${s.desc ? "desc" : "asc"}` : null);
  }, [sorting, serverSortMode, remote.setServerSort]);

  const effectivePageIndex = manualPagination ? (effectiveControlledPageIndex ?? 0) : undefined;

  // When using a remote `source`, the server is the source of truth for the
  // search filter — probe re-fires whenever `searchDebounced` changes, so the
  // `data` array we render is already filtered. Setting globalFilter here
  // would make TanStack second-filter the same rows with its default string
  // matcher, which fails for queries like `#8987` (the literal `#` never
  // appears in the column accessors). Always pass empty when usingSource.
  const globalFilter = "";

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    getCoreRowModel: getCoreRowModel(),
    // When the parent owns pagination we skip the TanStack row model — we
    // already receive the correct page slice from the server and must not
    // re-slice it client-side.
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: () => {},
    manualPagination,
    manualSorting: serverSortMode,
    manualFiltering: usingSource && remote.state.mode === "server",
    pageCount: manualPagination ? (effectiveControlledPageCount ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      ...(manualPagination
        ? { pagination: { pageIndex: effectivePageIndex ?? 0, pageSize: currentPageSize } }
        : {}),
    },
    initialState: manualPagination
      ? undefined
      : { pagination: { pageSize: effectiveInitialPageSize } },
  });

  function handlePageSizeChange(newSize: number) {
    setCurrentPageSize(newSize);
    // Dispatch by who actually owns the pagination state, not by whether a
    // remote source is configured. With a remote source under the threshold
    // we run in client mode (TanStack owns the slice), so updating
    // `remote.state.pageSize` is invisible — drive `table.setPageSize` instead.
    if (manualPagination) {
      if (usingSource) {
        remote.setPageSize(newSize);
      } else {
        onPaginationChange?.(0, newSize);
      }
    } else {
      table.setPageSize(newSize);
    }
  }

  function handlePageChange(nextIndex: number) {
    if (manualPagination) {
      if (usingSource) {
        remote.setPageIndex(nextIndex);
      } else {
        onPaginationChange?.(nextIndex, currentPageSize);
      }
    } else {
      table.setPageIndex(nextIndex);
    }
  }

  const pageIndex = manualPagination
    ? (effectiveControlledPageIndex ?? 0)
    : table.getState().pagination.pageIndex;
  const activePSize = manualPagination ? currentPageSize : table.getState().pagination.pageSize;
  // In manual mode we trust the server-reported total; in client mode we
  // use the filtered row count so the "Mostrando X de Y" stays honest when
  // the user searches.
  const totalRows = manualPagination
    ? (effectiveControlledTotalRows ?? 0)
    : table.getFilteredRowModel().rows.length;
  const totalPages = manualPagination
    ? Math.max(1, effectiveControlledPageCount ?? 1)
    : table.getPageCount();
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < totalPages - 1;
  const start = totalRows === 0 ? 0 : pageIndex * activePSize + 1;
  const end = manualPagination
    ? Math.min((pageIndex + 1) * activePSize, totalRows)
    : Math.min((pageIndex + 1) * activePSize, totalRows);
  // Make sure the current page size is always in the options, otherwise the
  // select renders the first option as its visual label (mismatched with the
  // actual state — e.g. `pageSize={10}` on a list that defaults to [20,50,100]
  // would show "20 / pág" while 10 rows were being rendered).
  const baseSizeOptions = pageSizeOptions || [20, 50, 100];
  const sizeOptions = baseSizeOptions.includes(activePSize)
    ? baseSizeOptions
    : [...baseSizeOptions, activePSize].sort((a, b) => a - b);

  // Decide whether to render the search input.
  const showSearchInput = usingSource ? searchable : Boolean(searchKey);

  return (
    <div className={fillParent ? "flex h-full min-h-0 flex-col gap-4" : "space-y-4"}>
      {(showSearchInput || enableColumnVisibility || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 text-xs [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:text-xs [&_input[type=text]]:h-8 [&_input[type=text]]:px-2 [&_input[type=text]]:py-1 [&_input[type=text]]:text-xs">
          {showSearchInput && usingSource && (
            <Input
              placeholder={resolvedSearchPlaceholder}
              value={remote.state.searchInput}
              onChange={(e) => remote.setSearchInput(e.target.value)}
              className="h-8 max-w-[240px] px-2 py-1 text-xs"
              {...(searchDataHelp ? { "data-help": searchDataHelp } : {})}
            />
          )}
          {showSearchInput && !usingSource && searchKey && (
            <Input
              placeholder={resolvedSearchPlaceholder}
              value={
                (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
              }
              onChange={(e) =>
                table.getColumn(searchKey)?.setFilterValue(e.target.value)
              }
              className="h-8 max-w-[240px] px-2 py-1 text-xs"
              {...(searchDataHelp ? { "data-help": searchDataHelp } : {})}
            />
          )}
          {toolbar}
          {enableColumnVisibility && (
            <div className="relative ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColMenuOpen(!colMenuOpen)}
                className="h-8 gap-1 px-2 text-xs"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Cols.
              </Button>
              {colMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-md border bg-white p-2 shadow-lg">
                  {table.getAllLeafColumns().map((column) => {
                    if (column.id === "acciones") return null;
                    return (
                      <label
                        key={column.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                          className="rounded border-gray-300"
                        />
                        {typeof column.columnDef.header === "string"
                          ? column.columnDef.header
                          : column.id}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        className={`rounded-lg border${scrollable ? " overflow-y-auto" : ""}${fillParent && scrollable ? " flex-1 min-h-0" : ""}`}
        style={scrollable && !fillParent ? { maxHeight: scrollBodyMaxHeight } : undefined}
      >
        <table className="w-full caption-bottom text-xs">
          {/*
            Tailwind's preflight sets `border-collapse: collapse`, which
            breaks `position: sticky` on <thead>. We pin each <th> instead
            and keep the table collapsed so borders still render correctly.
          */}
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b transition-colors hover:bg-mc-neutral-50"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`h-9 px-4 text-left align-middle font-medium text-foreground-muted${scrollable ? " sticky top-0 z-10 bg-white" : ""}`}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b transition-colors hover:bg-mc-neutral-50 ${rowClassName ? rowClassName(row.original) : ""}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-1.5 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className={`h-24 text-center ${usingSource && remote.state.error ? "text-red-600" : "text-foreground-muted"}`}
                >
                  {usingSource && remote.state.loading
                    ? t("ui.dataTable.loading")
                    : usingSource && remote.state.error === "forbidden"
                      ? t("ui.dataTable.errorForbidden")
                      : usingSource && remote.state.error
                        ? t("ui.dataTable.errorGeneric")
                        : t("ui.dataTable.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-foreground-muted">
            {t("ui.dataTable.showing", { start: String(start), end: String(end), total: String(totalRows) })}
          </p>
          <select
            value={activePSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            aria-label={t("ui.dataTable.rowsPerPage")}
            className="rounded border px-2 py-1 text-xs text-foreground-muted"
          >
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {t("ui.dataTable.perPage", { size: String(size) })}
              </option>
            ))}
            <option value={totalRows}>{t("ui.dataTable.all")}</option>
          </select>
          {paginatorExtras && (
            <div className="flex items-center gap-2 border-l border-gray-200 pl-3 text-sm text-foreground-muted">
              {paginatorExtras}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pageIndex - 1)}
            disabled={!canPrev}
          >
            Anterior
          </Button>
          <span className="text-sm text-foreground-muted">
            Página {pageIndex + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pageIndex + 1)}
            disabled={!canNext}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
