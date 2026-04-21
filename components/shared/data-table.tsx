"use client";

import { useEffect, useState, type ReactNode } from "react";
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

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  searchDataHelp?: string;
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
   * CSS max-height for the scroll area when `scrollable` is true. Defaults
   * to a viewport-relative value that fits under a typical page header +
   * toolbar + paginator.
   */
  scrollBodyMaxHeight?: string;
  /**
   * Opt in to server-driven pagination. When true, the component drives
   * navigation via `onPaginationChange` and trusts `pageCount` / `totalRows`
   * instead of deriving them from the in-memory `data` slice. Leave false
   * for small, fully-loaded tables where client-side paging is fine.
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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Buscar...",
  searchDataHelp,
  pageSize: initialPageSize = 10,
  pageSizeOptions,
  rowClassName,
  enableColumnVisibility = false,
  toolbar,
  scrollable = false,
  scrollBodyMaxHeight = "calc(100vh - 320px)",
  manualPagination = false,
  pageIndex: controlledPageIndex,
  totalRows: controlledTotalRows,
  pageCount: controlledPageCount,
  onPaginationChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [currentPageSize, setCurrentPageSize] = useState(initialPageSize);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Keep the internal page size in sync when the parent changes it
  // (e.g. a controlled paginator bumping from 20 → 50).
  useEffect(() => {
    setCurrentPageSize(initialPageSize);
  }, [initialPageSize]);

  const effectivePageIndex = manualPagination ? (controlledPageIndex ?? 0) : undefined;

  const table = useReactTable({
    data,
    columns,
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
    manualPagination,
    pageCount: manualPagination ? (controlledPageCount ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      ...(manualPagination
        ? { pagination: { pageIndex: effectivePageIndex ?? 0, pageSize: currentPageSize } }
        : {}),
    },
    initialState: manualPagination
      ? undefined
      : { pagination: { pageSize: initialPageSize } },
  });

  function handlePageSizeChange(newSize: number) {
    setCurrentPageSize(newSize);
    if (manualPagination) {
      onPaginationChange?.(0, newSize);
    } else {
      table.setPageSize(newSize);
    }
  }

  function handlePageChange(nextIndex: number) {
    if (manualPagination) {
      onPaginationChange?.(nextIndex, currentPageSize);
    } else {
      table.setPageIndex(nextIndex);
    }
  }

  const pageIndex = manualPagination
    ? (controlledPageIndex ?? 0)
    : table.getState().pagination.pageIndex;
  const activePSize = manualPagination ? currentPageSize : table.getState().pagination.pageSize;
  // In manual mode we trust the server-reported total; in client mode we
  // use the filtered row count so the "Mostrando X de Y" stays honest when
  // the user searches.
  const totalRows = manualPagination
    ? (controlledTotalRows ?? 0)
    : table.getFilteredRowModel().rows.length;
  const totalPages = manualPagination
    ? Math.max(1, controlledPageCount ?? 1)
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

  return (
    <div className="space-y-4">
      {(searchKey || enableColumnVisibility || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKey && (
            <Input
              placeholder={searchPlaceholder}
              value={
                (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
              }
              onChange={(e) =>
                table.getColumn(searchKey)?.setFilterValue(e.target.value)
              }
              className="max-w-sm"
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
                className="gap-1.5"
              >
                <Columns3 className="h-4 w-4" />
                Columnas
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
        className={`rounded-lg border${scrollable ? " overflow-y-auto" : ""}`}
        style={scrollable ? { maxHeight: scrollBodyMaxHeight } : undefined}
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
                  className="h-24 text-center text-foreground-muted"
                >
                  No hay datos para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-foreground-muted">
            Mostrando {start}-{end} de {totalRows}
          </p>
          <select
            value={activePSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded border px-2 py-1 text-xs text-foreground-muted"
          >
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / pág
              </option>
            ))}
            <option value={totalRows}>Todos</option>
          </select>
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
