"use client";

import { useState, type ReactNode } from "react";
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [currentPageSize, setCurrentPageSize] = useState(initialPageSize);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
  });

  function handlePageSizeChange(newSize: number) {
    setCurrentPageSize(newSize);
    table.setPageSize(newSize);
  }

  const { pageIndex } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const activePSize = table.getState().pagination.pageSize;
  const start = totalRows === 0 ? 0 : pageIndex * activePSize + 1;
  const end = Math.min((pageIndex + 1) * activePSize, totalRows);
  const sizeOptions = pageSizeOptions || [20, 50, 100];

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

      <div className="rounded-lg border">
        <table className="w-full caption-bottom text-xs">
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b transition-colors hover:bg-mc-neutral-50"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-9 px-4 text-left align-middle font-medium text-foreground-muted"
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
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <span className="text-sm text-foreground-muted">
            Pagina {pageIndex + 1} de {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
