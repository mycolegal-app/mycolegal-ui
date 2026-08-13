"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type OnChangeFn,
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
   * Umbral de estrategia. Si el primer fetch reporta `total ≤ clientCacheMax`,
   * el dataset se carga UNA vez (acotado a este número) y se ordena/pagina en
   * memoria; por encima, paginación en servidor pura (una página por fetch).
   * Se topa duro a 200: jamás se cargan miles de registros en cliente.
   * Alias histórico: `threshold`. Default 200.
   */
  clientCacheMax?: number;
  /** @deprecated Alias de `clientCacheMax`. */
  threshold?: number;
  /**
   * Adaptador de respuesta para endpoints cuyo envoltorio no es
   * `{ data, meta: { total } }`. Debe devolver `{ rows, total }`.
   */
  mapResponse?: (json: unknown) => { rows: unknown[]; total: number };
  /** Bump to force a refetch (e.g. after creating/updating a row). */
  refreshKey?: string | number;
  /** Query param name for the search term. Default `search`. */
  searchParam?: string;
  /**
   * Columnas que el ENDPOINT sabe ordenar (envía `sort=<id>&order=asc|desc`).
   * En estrategia servidor, solo estas cabeceras son clicables. En estrategia
   * cliente (dataset pequeño cacheado) se ordena en memoria cualquier columna.
   * Omitida ⇒ en servidor no hay orden por cabecera (evita el engañoso "ordena
   * solo esta página").
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
  /**
   * Visibilidad inicial por columna (id → visible). Permite arrancar con
   * columnas ocultas que el usuario puede revelar desde el selector "Cols."
   * (requiere `enableColumnVisibility`). Ej. `{ solicitante: false }` deja la
   * columna definida pero oculta por defecto. Solo siembra el estado inicial;
   * los cambios del usuario mandan a partir de ahí.
   */
  initialColumnVisibility?: VisibilityState;
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
  /**
   * Orden inicial de la tabla. En modo cliente ordena el set cargado; en modo
   * servidor se envía como `sort/order` (o los nombres de `source.sortParam/
   * orderParam`) en la primera carga. Sustituye al patrón de pasar el orden por
   * defecto en `extraParams`, que pisaba el orden por click. El usuario puede
   * cambiarlo pulsando una cabecera ordenable.
   */
  initialSort?: { id: string; desc?: boolean };
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

// Estrategia de rebanado del dataset actual. NO es un conmutador de propiedad
// del estado (como el viejo `mode`): el estado (página/tamaño/orden/búsqueda) es
// SIEMPRE del reducer de abajo. La estrategia solo decide DÓNDE se calcula la
// rebanada visible: en memoria (cliente, dataset pequeño ya cacheado) o pidiendo
// una página al servidor (dataset grande).
type Strategy = "unknown" | "client" | "server";

/** Por defecto: datasets con `total ≤` esto se cargan una vez y se ordenan/
 *  paginan en memoria; por encima, servidor puro. Configurable por `source`. */
const DEFAULT_CLIENT_CACHE_MAX = 200;
/** Techo DURO del client-cache aunque un caller pida más: un catálogo curado
 *  puede optar a cargarse entero (p.ej. ~411 actos), pero jamás decenas de
 *  miles. `clientCacheMax` es también el tope de `pageSize` y del fetch
 *  primario, así que ninguna request supera este número de filas. */
const MAX_CLIENT_CACHE = 1000;

type SortSpec = { id: string; desc: boolean } | null;

interface SourceState<T> {
  /** Filas VISIBLES de la página actual (ya rebanadas). */
  data: T[];
  /** Total de la población filtrada (del servidor). Base del cálculo local. */
  total: number;
  loading: boolean;
  /**
   * `"forbidden"` para HTTP 403, `"error"` para cualquier otro fallo/red/timeout,
   * `null` si el último fetch fue bien. Sin esto un 403 se veía como "sin datos".
   */
  error: "forbidden" | "error" | null;
  pageIndex: number;
  pageSize: number;
  sort: SortSpec;
  searchInput: string;
  /** `"client"` cuando el dataset cabe en memoria; controla la opción "Todos". */
  strategy: Strategy;
}

interface Query {
  pageIndex: number;
  pageSize: number;
  sort: SortSpec;
  searchInput: string;
  searchDebounced: string;
}

type QueryAction =
  | { type: "setPage"; pageIndex: number }
  | { type: "setPageSize"; pageSize: number }
  | { type: "setSort"; sort: SortSpec }
  | { type: "setSearchInput"; value: string }
  | { type: "commitSearch"; value: string }
  | { type: "clampPage"; lastPage: number };

// Reducer = única fuente de verdad. La clave de la robustez: cambiar filtro/
// orden/tamaño/búsqueda resetea `pageIndex` a 0 EN EL MISMO update (atómico), así
// que el efecto de carga nunca ve una página vieja junto a un filtro nuevo — la
// carrera "total>0 con 0 filas" es imposible por construcción.
function queryReducer(s: Query, a: QueryAction): Query {
  switch (a.type) {
    case "setPage":
      return s.pageIndex === a.pageIndex ? s : { ...s, pageIndex: Math.max(0, a.pageIndex) };
    case "setPageSize":
      return { ...s, pageSize: a.pageSize, pageIndex: 0 };
    case "setSort":
      return { ...s, sort: a.sort, pageIndex: 0 };
    case "setSearchInput":
      return { ...s, searchInput: a.value };
    case "commitSearch":
      return s.searchDebounced === a.value ? s : { ...s, searchDebounced: a.value, pageIndex: 0 };
    case "clampPage":
      return s.pageIndex === a.lastPage ? s : { ...s, pageIndex: a.lastPage };
  }
}

function compareRows<T>(a: T, b: T, sort: { id: string; desc: boolean }): number {
  const av = (a as Record<string, unknown>)[sort.id];
  const bv = (b as Record<string, unknown>)[sort.id];
  let r: number;
  if (av == null && bv == null) r = 0;
  else if (av == null) r = -1;
  else if (bv == null) r = 1;
  else if (typeof av === "number" && typeof bv === "number") r = av - bv;
  else r = String(av).localeCompare(String(bv));
  return sort.desc ? -r : r;
}

function useRemoteSource<T>(
  source: RemoteDataSource | undefined,
  initialPageSize: number,
  initialSort?: { id: string; desc?: boolean },
): {
  enabled: boolean;
  state: SourceState<T>;
  setSearchInput: (v: string) => void;
  setPageIndex: (idx: number) => void;
  setPageSize: (size: number) => void;
  setSort: (v: SortSpec) => void;
  retry: () => void;
} {
  const searchParam = source?.searchParam ?? "search";
  const sortParam = source?.sortParam ?? "sort";
  const orderParam = source?.orderParam ?? "order";
  const endpoint = source?.endpoint;
  const extraParams = source?.extraParams;
  const extraParamsKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);
  const refreshKey = source?.refreshKey;
  // Honra el valor explícito del caller (o el alias `threshold`) hasta el techo
  // duro. Es el ÚNICO límite: fetch primario, tope de página y caché cliente.
  const clientCacheMax = Math.min(
    source?.clientCacheMax ?? source?.threshold ?? DEFAULT_CLIENT_CACHE_MAX,
    MAX_CLIENT_CACHE,
  );
  const cappedInitial = Math.min(initialPageSize, clientCacheMax);

  const cappedInitialSort: SortSpec = initialSort
    ? { id: initialSort.id, desc: initialSort.desc ?? false }
    : null;
  const [query, dispatch] = useReducer(queryReducer, undefined, () => ({
    pageIndex: 0,
    pageSize: cappedInitial,
    sort: cappedInitialSort,
    searchInput: "",
    searchDebounced: "",
  }));
  const { pageIndex, pageSize, sort, searchInput, searchDebounced } = query;

  // Estado de resultado (independiente del query).
  const [serverRows, setServerRows] = useState<T[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [cache, setCache] = useState<T[] | null>(null); // dataset completo (modo cliente)
  const [strategy, setStrategy] = useState<Strategy>("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Identidad del dataset = filtros + búsqueda (NO página/orden). Si cambia,
  // hay que recargar y redecidir estrategia. Si solo cambia página/orden dentro
  // del MISMO dataset, en cliente se re-rebana en memoria (sin fetch).
  const datasetKey = `${endpoint ?? ""}|${extraParamsKey}|${searchDebounced}|${refreshKey ?? ""}|${retryTick}`;

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Última "clave de filtro" (extraParams + búsqueda) para resetear a página 1
  // cuando cambia el FILTRO (prop externa), pero NO en un simple refresh/retry.
  const prevFilterKeyRef = useRef<string>(`${extraParamsKey}|${searchDebounced}`);
  // Firma de lo último SERVIDO por el servidor: evita refetch redundante cuando
  // la carga primaria ya cubrió (dataset, página 0, orden actual).
  const servedRef = useRef<string>("");
  // Dataset resuelto por la última carga primaria (para saber si un cambio es de
  // dataset o solo de página/orden).
  const resolvedDatasetRef = useRef<string>("");

  const sortSig = (sp: SortSpec) => (sp ? `${sp.id}:${sp.desc ? "d" : "a"}` : "");

  const runFetch = useCallback(
    async (opts: { page: number; size: number; primary: boolean; datasetKey: string; sort: SortSpec }) => {
      if (!endpoint) return;
      const seq = ++seqRef.current;
      abortRef.current?.abort(); // cancela cualquier request anterior en vuelo
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      const isLatest = () => seq === seqRef.current;
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("page", String(opts.page));
        qs.set("pageSize", String(opts.size));
        if (searchDebounced) qs.set(searchParam, searchDebounced);
        if (opts.sort) {
          qs.set(sortParam, opts.sort.id);
          qs.set(orderParam, opts.sort.desc ? "desc" : "asc");
        }
        if (extraParams) {
          for (const [k, v] of Object.entries(extraParams)) {
            if (v === null || v === undefined || v === "") continue;
            qs.set(k, String(v));
          }
        }
        const res = await fetch(`${endpoint}?${qs.toString()}`, { signal: controller.signal });
        if (!isLatest()) return; // una request más nueva ganó
        if (!res.ok) {
          setError(res.status === 403 ? "forbidden" : "error");
          setStrategy("server");
          setServerRows([]);
          setServerTotal(0);
          setCache(null);
          return;
        }
        const json = await res.json();
        const mapped = source?.mapResponse ? source.mapResponse(json) : null;
        const rows: T[] = (mapped ? mapped.rows : json.data) ?? [];
        const total: number = mapped ? mapped.total : json.meta?.total ?? rows.length;
        if (!isLatest()) return;
        setError(null);
        if (opts.primary) {
          resolvedDatasetRef.current = opts.datasetKey;
          if (total <= clientCacheMax) {
            // Dataset pequeño: lo cacheamos entero y ordenamos/paginamos en
            // memoria. Nunca supera `clientCacheMax` filas.
            setStrategy("client");
            setCache(rows);
            setServerRows([]);
            setServerTotal(total);
          } else {
            // Dataset grande: servidor puro. La carga primaria ya trajo la
            // primera página (rows[0..pageSize]) → sin doble fetch.
            setStrategy("server");
            setCache(null);
            setServerRows(rows.slice(0, opts.size >= pageSize ? pageSize : opts.size));
            setServerTotal(total);
            servedRef.current = `${opts.datasetKey}|0|${pageSize}|${sortSig(opts.sort)}`;
          }
        } else {
          // Fetch de página (servidor).
          setServerRows(rows);
          setServerTotal(total);
          servedRef.current = `${opts.datasetKey}|${opts.page - 1}|${opts.size}|${sortSig(opts.sort)}`;
        }
      } catch {
        if (!isLatest()) return; // abortada por una request más nueva: la ignoramos
        setError("error");
        setStrategy("server");
        setServerRows([]);
        setServerTotal(0);
        setCache(null);
      } finally {
        clearTimeout(timeout);
        if (isLatest()) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, extraParamsKey, searchDebounced, searchParam, sortParam, orderParam, clientCacheMax, pageSize],
  );

  // Debounce de la búsqueda → searchDebounced (resetea a página 1 atómicamente).
  useEffect(() => {
    if (!source) return;
    const h = setTimeout(() => dispatch({ type: "commitSearch", value: searchInput.trim() }), 300);
    return () => clearTimeout(h);
  }, [searchInput, source]);

  // Carga PRIMARIA: al cambiar la identidad del dataset (filtros/búsqueda/refresh).
  // Trae hasta `clientCacheMax` filas + total, y decide estrategia. `pageIndex` ya
  // es 0 (reset atómico en el reducer al cambiar filtro/búsqueda).
  useEffect(() => {
    if (!source) return;
    // Reset a página 1 SOLO si cambió el filtro/búsqueda (no en refresh/retry),
    // porque `extraParams` es prop externa y el reducer no la ve. El clamp cubre
    // el resto, pero esto da la página correcta (la 1) tras cambiar de filtro.
    const filterKey = `${extraParamsKey}|${searchDebounced}`;
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      dispatch({ type: "setPage", pageIndex: 0 });
    }
    setStrategy("unknown");
    runFetch({ page: 1, size: clientCacheMax, primary: true, datasetKey, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey]);

  // Carga de PÁGINA (solo servidor): al cambiar página/tamaño/orden dentro del
  // mismo dataset. En cliente no hace nada (se re-rebana en memoria). Evita el
  // refetch redundante que ya cubrió la carga primaria vía `servedRef`.
  useEffect(() => {
    if (!source) return;
    if (strategy !== "server") return;
    if (resolvedDatasetRef.current !== datasetKey) return; // aún resolviendo el dataset
    const sig = `${datasetKey}|${pageIndex}|${pageSize}|${sortSig(sort)}`;
    if (sig === servedRef.current) return;
    runFetch({ page: pageIndex + 1, size: pageSize, primary: false, datasetKey, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pageSize, sort, strategy]);

  // Aborta cualquier request en vuelo al desmontar.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Rebanada visible + total, derivados. En cliente: ordena/rebana la caché en
  // memoria (instantáneo, sin fetch). En servidor: la página que trajo el fetch.
  const data = useMemo<T[]>(() => {
    if (strategy === "client" && cache) {
      const sorted = sort ? [...cache].sort((a, b) => compareRows(a, b, sort)) : cache;
      return sorted.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    }
    return serverRows;
  }, [strategy, cache, sort, pageIndex, pageSize, serverRows]);
  const total = strategy === "client" && cache ? cache.length : serverTotal;

  // Clamp: si `total` encoge por debajo de la página actual (datos borrados,
  // filtro que reduce), reconducimos a la última página válida. Mata el "página
  // fuera de rango pintando vacío" en ambas estrategias.
  useEffect(() => {
    if (!source || strategy === "unknown") return;
    const lastPage = Math.max(0, Math.ceil(total / Math.max(1, pageSize)) - 1);
    if (pageIndex > lastPage) dispatch({ type: "clampPage", lastPage });
  }, [total, pageIndex, pageSize, strategy, source]);

  return {
    enabled: Boolean(source),
    state: { data, total, loading, error, pageIndex, pageSize, sort, searchInput, strategy },
    setSearchInput: (v: string) => dispatch({ type: "setSearchInput", value: v }),
    setPageIndex: (idx: number) => dispatch({ type: "setPage", pageIndex: idx }),
    setPageSize: (size: number) => dispatch({ type: "setPageSize", pageSize: Math.min(size, clientCacheMax) }),
    setSort: (v: SortSpec) => dispatch({ type: "setSort", sort: v }),
    retry: () => setRetryTick((n) => n + 1),
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
  initialColumnVisibility,
  toolbar,
  scrollable = false,
  fillParent = false,
  scrollBodyMaxHeight = "calc(100vh - 360px)",
  manualPagination: manualPaginationProp = false,
  pageIndex: controlledPageIndex,
  totalRows: controlledTotalRows,
  pageCount: controlledPageCount,
  initialSort,
  onPaginationChange,
  paginatorExtras,
}: DataTableProps<TData, TValue>) {
  const { t } = useI18n();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("ui.dataTable.searchPlaceholder");

  // Remote source state (no-op when `source` is undefined).
  const remote = useRemoteSource<TData>(source, initialPageSize, initialSort);

  // Resolve which data/pagination source the table actually uses.
  const usingSource = remote.enabled;
  const data = usingSource ? remote.state.data : inlineData ?? [];
  // Con `source` la tabla es SIEMPRE de paginación manual: nosotros calculamos
  // la rebanada visible (cliente en memoria o página del servidor) y TanStack
  // solo la pinta. Sin `source` respetamos el modo controlado del caller.
  const manualPagination = usingSource ? true : manualPaginationProp;
  const effectiveControlledPageIndex = usingSource
    ? remote.state.pageIndex
    : controlledPageIndex;
  const effectiveControlledPageCount = usingSource
    ? Math.max(1, Math.ceil(remote.state.total / Math.max(1, remote.state.pageSize)))
    : controlledPageCount;
  const effectiveControlledTotalRows = usingSource ? remote.state.total : controlledTotalRows;
  const effectiveInitialPageSize = usingSource ? remote.state.pageSize : initialPageSize;

  // Solo en estrategia SERVIDOR restringimos las cabeceras ordenables a las que
  // el endpoint sabe ordenar (`sortableColumns`). En estrategia cliente (dataset
  // pequeño cacheado) y en modo inline se ordena en memoria cualquier columna.
  const restrictSort = usingSource && remote.state.strategy === "server";
  const sortableColumnsKey = JSON.stringify(source?.sortableColumns ?? null);
  const resolvedColumns = useMemo(() => {
    if (!restrictSort) return columns;
    const allow = new Set(source?.sortableColumns ?? []);
    return columns.map((c) => {
      const id = (c.id ?? (c as { accessorKey?: string }).accessorKey) as string | undefined;
      return { ...c, enableSorting: id ? allow.has(id) : false };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, restrictSort, sortableColumnsKey]);

  // Orden: con `source` es estado del hook (FUENTE ÚNICA) → derivamos el
  // `SortingState` de TanStack de `remote.state.sort` y reenviamos los cambios
  // con `setSort` (que resetea a página 1 atómicamente). Sin `source` (inline)
  // mantenemos estado local de TanStack. Se elimina el efecto puente
  // `sorting→serverSort` y su triple representación del orden (origen del #339).
  const [inlineSorting, setInlineSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.id, desc: initialSort.desc ?? false }] : [],
  );
  const sorting: SortingState = usingSource
    ? remote.state.sort
      ? [{ id: remote.state.sort.id, desc: remote.state.sort.desc }]
      : []
    : inlineSorting;
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    if (usingSource) {
      const s = next[0];
      remote.setSort(s ? { id: s.id, desc: s.desc } : null);
    } else {
      setInlineSorting(next);
    }
  };
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {},
  );
  const [currentPageSize, setCurrentPageSize] = useState(effectiveInitialPageSize);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Mantener el pageSize interno sincronizado cuando el padre/hook lo cambia
  // (ej. paginador controlado que sube de 20 → 50, o el hook al capar).
  useEffect(() => {
    setCurrentPageSize(effectiveInitialPageSize);
  }, [effectiveInitialPageSize]);

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
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: () => {},
    manualPagination,
    // Con `source` ordenamos y filtramos nosotros (cliente en memoria o
    // servidor): TanStack no debe re-ordenar/re-filtrar la rebanada recibida.
    manualSorting: usingSource,
    manualFiltering: usingSource,
    pageCount: manualPagination ? (effectiveControlledPageCount ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      ...(manualPagination
        ? {
            pagination: {
              pageIndex: effectivePageIndex ?? 0,
              pageSize: usingSource ? remote.state.pageSize : currentPageSize,
            },
          }
        : {}),
    },
    initialState: manualPagination
      ? undefined
      : { pagination: { pageSize: effectiveInitialPageSize } },
  });

  function handlePageSizeChange(newSize: number) {
    if (usingSource) {
      remote.setPageSize(newSize); // el hook lo capa a clientCacheMax
    } else if (manualPagination) {
      setCurrentPageSize(newSize);
      onPaginationChange?.(0, newSize);
    } else {
      setCurrentPageSize(newSize);
      table.setPageSize(newSize);
    }
  }

  function handlePageChange(nextIndex: number) {
    if (usingSource) {
      remote.setPageIndex(nextIndex);
    } else if (manualPagination) {
      onPaginationChange?.(nextIndex, currentPageSize);
    } else {
      table.setPageIndex(nextIndex);
    }
  }

  const pageIndex = usingSource
    ? remote.state.pageIndex
    : manualPagination
      ? (effectiveControlledPageIndex ?? 0)
      : table.getState().pagination.pageIndex;
  const activePSize = usingSource
    ? remote.state.pageSize
    : manualPagination
      ? currentPageSize
      : table.getState().pagination.pageSize;
  // Con `source` el total lo manda el servidor (base del cálculo local de
  // páginas). En inline no-manual, el recuento filtrado de TanStack.
  const totalRows =
    usingSource || manualPagination
      ? (effectiveControlledTotalRows ?? 0)
      : table.getFilteredRowModel().rows.length;
  const totalPages =
    usingSource || manualPagination
      ? Math.max(1, effectiveControlledPageCount ?? 1)
      : table.getPageCount();
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < totalPages - 1;
  const start = totalRows === 0 ? 0 : pageIndex * activePSize + 1;
  const end = Math.min((pageIndex + 1) * activePSize, totalRows);
  // El tamaño activo siempre debe estar entre las opciones (si no, el select
  // mostraría la primera opción como etiqueta, descuadrada con el estado real).
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
                  {/* Atajo marcar/desmarcar todas las columnas ocultables
                      (excluye "acciones"). Si todas están visibles, oculta;
                      si no, muestra todas. */}
                  {(() => {
                    const hideable = table
                      .getAllLeafColumns()
                      .filter((c) => c.id !== "acciones" && c.getCanHide());
                    if (hideable.length === 0) return null;
                    const allVisible = hideable.every((c) => c.getIsVisible());
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => hideable.forEach((c) => c.toggleVisibility(!allVisible))}
                          className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs font-medium text-mc-primary-600 hover:bg-gray-50"
                        >
                          {allVisible
                            ? t("ui.dataTable.columnsDeselectAll")
                            : t("ui.dataTable.columnsSelectAll")}
                        </button>
                        <div className="mb-1 border-b" />
                      </>
                    );
                  })()}
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

      {/*
        `max-lg:overflow-x-auto` — SOLO por debajo de `lg`. En pantalla estrecha
        (móvil/tableta) la tabla no cabe: el shell lleva `overflow-x-hidden`, así
        que las columnas de la derecha no es que se apretaran, es que se
        RECORTABAN sin forma de llegar a ellas (incidencia #410). Con esto la
        tabla se desplaza en horizontal dentro de su caja. De `lg` para arriba no
        aplica ninguna de estas dos clases: el escritorio queda exactamente igual.
      */}
      <div
        className={`rounded-lg border max-lg:overflow-x-auto${scrollable ? " overflow-y-auto" : ""}${fillParent && scrollable ? " flex-1 min-h-0" : ""}`}
        style={scrollable && !fillParent ? { maxHeight: scrollBodyMaxHeight } : undefined}
      >
        <table className="w-full caption-bottom text-xs max-lg:min-w-[46rem]">
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
                  {usingSource && remote.state.loading ? (
                    t("ui.dataTable.loading")
                  ) : usingSource && remote.state.error === "forbidden" ? (
                    t("ui.dataTable.errorForbidden")
                  ) : usingSource && remote.state.error ? (
                    // Error genérico (timeout/red/5xx): recuperable. Ofrecemos
                    // "Reintentar" en vez de dejar la tabla en un callejón sin
                    // salida — el timeout del fetch garantiza que se llegue aquí.
                    <span className="inline-flex items-center gap-2">
                      {t("ui.dataTable.errorGeneric")}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remote.retry()}
                        className="h-7 px-2 text-xs"
                      >
                        {t("ui.dataTable.retry")}
                      </Button>
                    </span>
                  ) : (
                    t("ui.dataTable.empty")
                  )}
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
            {/* "Todos" solo cuando NO es paginación de servidor: en servidor
                sería engañoso (una página acotada ≠ toda la población) y podría
                sugerir traer miles. En cliente/inline es seguro (dataset ≤200). */}
            {!(usingSource && remote.state.strategy === "server") && (
              <option value={totalRows}>{t("ui.dataTable.all")}</option>
            )}
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
