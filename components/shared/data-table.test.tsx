import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

// ---------------------------------------------------------------------------
// Servidor fake en memoria. Respeta page/pageSize/search/sort/order y trata
// cualquier otro query param como filtro exacto (coma = IN). Devuelve el mismo
// envoltorio que el DataTable espera: { data, meta: { total } }.
// ---------------------------------------------------------------------------
type Row = { id: string; name: string; clase: string };

function makeRows(n: number, clase = "ALL"): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    name: `row-${String(i + 1).padStart(4, "0")}`,
    clase,
  }));
}

interface Pending {
  params: URLSearchParams;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
}

function buildResponse(rows: Row[], params: URLSearchParams): Response {
  const RESERVED = new Set(["page", "pageSize", "search", "sort", "order"]);
  let filtered = rows;
  for (const [k, v] of params.entries()) {
    if (RESERVED.has(k) || v === "") continue;
    const wanted = new Set(v.split(","));
    filtered = filtered.filter((r) => wanted.has((r as any)[k]));
  }
  const search = params.get("search");
  if (search) filtered = filtered.filter((r) => r.name.includes(search));
  const sort = params.get("sort");
  if (sort) {
    const dir = params.get("order") === "desc" ? -1 : 1;
    filtered = [...filtered].sort((a, b) =>
      String((a as any)[sort]).localeCompare(String((b as any)[sort])) * dir,
    );
  }
  const total = filtered.length;
  const page = Number(params.get("page") || "1");
  const pageSize = Number(params.get("pageSize") || "20");
  const slice = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: slice, meta: { total } }),
  } as Response;
}

function installServer(rows: Row[], opts: { manual?: boolean } = {}) {
  const pending: Pending[] = [];
  const calls: URLSearchParams[] = [];
  const fetchImpl = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://test.local");
    const params = url.searchParams;
    calls.push(params);
    if (opts.manual) {
      return new Promise<Response>((resolve, reject) => pending.push({ params, resolve, reject }));
    }
    return Promise.resolve(buildResponse(rows, params));
  });
  vi.stubGlobal("fetch", fetchImpl);
  return {
    calls,
    pending,
    /** Resuelve manualmente la primera pending que cumpla el predicado. */
    flush(pred: (p: URLSearchParams) => boolean) {
      const idx = pending.findIndex((p) => pred(p.params));
      if (idx === -1) throw new Error("no pending request matches");
      const [p] = pending.splice(idx, 1);
      p.resolve(buildResponse(rows, p.params));
    },
  };
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "clase", header: "Clase" },
];

const dataRowCount = () =>
  screen
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("cell").length > 0 && !within(r).queryByText(/^ui\.dataTable\./)).length;

const paginaText = () => screen.getByText(/Página/).textContent || "";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DataTable · modo servidor (dataset grande > umbral)", () => {
  beforeEach(() => installServer(makeRows(1000)));

  it("pagina en servidor: 20 filas, total→páginas, y navega", async () => {
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} />);
    await waitFor(() => expect(dataRowCount()).toBe(20));
    // 1000/20 = 50 páginas
    expect(paginaText()).toMatch(/Página 1 de 50/);
    // primera fila = row-0001
    expect(screen.getByText("row-0001")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(screen.queryByText("row-0021")).toBeTruthy());
    expect(paginaText()).toMatch(/Página 2 de 50/);
  });
});

describe("DataTable · modo cliente (dataset pequeño ≤ umbral)", () => {
  beforeEach(() => installServer(makeRows(36, "DOCTRINA")));

  it("carga una vez y pagina en cliente", async () => {
    const { calls } = installServer(makeRows(36, "DOCTRINA"));
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} />);
    await waitFor(() => expect(dataRowCount()).toBe(20));
    expect(paginaText()).toMatch(/Página 1 de 2/);
    // en modo cliente no debería refetchear al paginar
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(paginaText()).toMatch(/Página 2 de 2/));
    expect(dataRowCount()).toBe(16); // 36 - 20
    expect(calls.length).toBe(before);
  });
});

describe("DataTable · orden por columnas (servidor)", () => {
  it("click en cabecera ordenable → envía sort/order y persiste al paginar", async () => {
    const srv = installServer(makeRows(1000));
    render(
      <DataTable
        columns={columns}
        source={{ endpoint: "/api/x", sortableColumns: ["name"] }}
        pageSize={20}
      />,
    );
    await waitFor(() => expect(dataRowCount()).toBe(20));

    fireEvent.click(screen.getByRole("button", { name: /Nombre/i }));
    await waitFor(() =>
      expect(srv.calls.some((c) => c.get("sort") === "name" && c.get("order") === "asc")).toBe(true),
    );

    // el orden persiste al cambiar de página
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() =>
      expect(
        srv.calls.some((c) => c.get("page") === "2" && c.get("sort") === "name"),
      ).toBe(true),
    );
  });
});

describe("DataTable · paginación", () => {
  it("cambiar pageSize resetea a página 1", async () => {
    const srv = installServer(makeRows(1000));
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} pageSizeOptions={[20, 50]} />);
    await waitFor(() => expect(dataRowCount()).toBe(20));

    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(paginaText()).toMatch(/Página 2/));

    fireEvent.change(screen.getByLabelText("ui.dataTable.rowsPerPage"), { target: { value: "50" } });
    await waitFor(() => expect(paginaText()).toMatch(/Página 1/));
    await waitFor(() =>
      expect(srv.calls.some((c) => c.get("page") === "1" && c.get("pageSize") === "50")).toBe(true),
    );
  });
});

describe("DataTable · estados de error", () => {
  it("403 → errorForbidden (no 'sin datos')", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as Response),
    );
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} />);
    await waitFor(() => expect(screen.getByText("ui.dataTable.errorForbidden")).toBeTruthy());
  });

  it("fallo de red → errorGeneric + botón Reintentar recarga", async () => {
    let fail = true;
    const rows = makeRows(300);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (fail) return Promise.reject(new Error("network"));
        const url = new URL(String(input), "http://test.local");
        return Promise.resolve(buildResponse(rows, url.searchParams));
      }),
    );
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} />);
    await waitFor(() => expect(screen.getByText("ui.dataTable.errorGeneric")).toBeTruthy());
    fail = false;
    fireEvent.click(screen.getByText("ui.dataTable.retry"));
    await waitFor(() => expect(dataRowCount()).toBe(20));
  });
});

describe("DataTable · invariantes del refactor (fuente única)", () => {
  it("modo servidor: la carga inicial es UN solo fetch (sin doble probe+page)", async () => {
    const srv = installServer(makeRows(1000));
    render(<DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} />);
    await waitFor(() => expect(dataRowCount()).toBe(20));
    expect(srv.calls.length).toBe(1);
    expect(srv.calls[0].get("pageSize")).toBe("200");
  });

  it("nunca pide más de 200 filas por página aunque se seleccione un tamaño mayor", async () => {
    const srv = installServer(makeRows(1000));
    render(
      <DataTable columns={columns} source={{ endpoint: "/api/x" }} pageSize={20} pageSizeOptions={[20, 500]} />,
    );
    await waitFor(() => expect(dataRowCount()).toBe(20));
    fireEvent.change(screen.getByLabelText("ui.dataTable.rowsPerPage"), { target: { value: "500" } });
    await waitFor(() =>
      expect(srv.calls.some((c) => c.get("pageSize") === "200" && c.get("page") === "1")).toBe(true),
    );
    expect(srv.calls.every((c) => Number(c.get("pageSize")) <= 200)).toBe(true);
  });

  it("cambiar de filtro estando en página posterior aterriza en la página 1 (no vacía)", async () => {
    const rows = [...makeRows(1000, "ALL"), ...makeRows(36, "DOCTRINA").map((r) => ({ ...r, id: "d" + r.id }))];
    installServer(rows);
    const { rerender } = render(
      <DataTable columns={columns} source={{ endpoint: "/api/x", extraParams: { clase: undefined } }} pageSize={20} />,
    );
    await waitFor(() => expect(dataRowCount()).toBe(20));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(paginaText()).toMatch(/Página 3/));

    rerender(
      <DataTable columns={columns} source={{ endpoint: "/api/x", extraParams: { clase: "DOCTRINA" } }} pageSize={20} />,
    );
    await waitFor(() => expect(paginaText()).toMatch(/Página 1 de 2/));
    expect(dataRowCount()).toBe(20);
  });

  it("catálogo pequeño con clientCacheMax explícito: 1 fetch, 'Todos' sin refetch, orden en memoria", async () => {
    const srv = installServer(makeRows(411, "ACTO"));
    render(
      <DataTable
        columns={columns}
        source={{ endpoint: "/api/x", clientCacheMax: 1000, sortableColumns: [] }}
        initialSort={{ id: "name", desc: false }}
        pageSize={20}
        pageSizeOptions={[20, 50, 100]}
      />,
    );
    await waitFor(() => expect(dataRowCount()).toBe(20));
    expect(srv.calls.length).toBe(1); // un solo fetch primario trae los 411
    expect(paginaText()).toMatch(/de 21/); // 411/20 = 21 páginas

    // "Todos" (value=411) muestra los 411 SIN fetch adicional
    const before = srv.calls.length;
    fireEvent.change(screen.getByLabelText("ui.dataTable.rowsPerPage"), { target: { value: "411" } });
    await waitFor(() => expect(dataRowCount()).toBe(411));
    expect(srv.calls.length).toBe(before);

    // orden en memoria por una columna NO declarada en sortableColumns
    fireEvent.click(screen.getByRole("button", { name: /Nombre/i })); // asc→desc
    await waitFor(() => {
      const first = screen.getAllByRole("row").find((r) => within(r).queryAllByRole("cell").length > 0);
      return expect(within(first!).getByText("row-0411")).toBeTruthy();
    });
    expect(srv.calls.length).toBe(before); // el orden cliente no dispara fetch
  });

  it("si el total encoge por debajo de la página actual, reconduce (clamp) sin dejar vacío", async () => {
    const rows = makeRows(1000);
    installServer(rows);
    const { rerender } = render(
      <DataTable columns={columns} source={{ endpoint: "/api/x", refreshKey: 1 }} pageSize={20} />,
    );
    await waitFor(() => expect(dataRowCount()).toBe(20));
    for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(paginaText()).toMatch(/Página 10/));

    rows.splice(25); // el dataset encoge a 25 filas
    rerender(<DataTable columns={columns} source={{ endpoint: "/api/x", refreshKey: 2 }} pageSize={20} />);
    await waitFor(() => expect(paginaText()).toMatch(/de 2/));
    expect(dataRowCount()).toBeGreaterThan(0);
  });
});

describe("DataTable · BUG total>0 con 0 filas (carrera de offset)", () => {
  it("un cambio de filtro estando en página posterior NUNCA deja total>0 con 0 filas", async () => {
    // 1000 filas ALL (servidor). Al filtrar clase=DOCTRINA quedan 36.
    const rows = [...makeRows(1000, "ALL"), ...makeRows(36, "DOCTRINA").map((r) => ({ ...r, id: "d" + r.id }))];
    const srv = installServer(rows, { manual: true });

    const { rerender } = render(
      <DataTable columns={columns} source={{ endpoint: "/api/x", extraParams: { clase: undefined } }} pageSize={20} />,
    );
    // carga primaria (clase=ALL → total 1036 > 200 → servidor). Sirve la 1ª
    // página desde el propio fetch primario: SIN doble fetch.
    await waitFor(() => expect(srv.pending.some((p) => !p.params.get("clase"))).toBe(true));
    srv.flush((p) => p.get("pageSize") === "200" && !p.get("clase"));
    await waitFor(() => expect(dataRowCount()).toBe(20));

    // navegar a página 2 y luego 3; la de página 3 queda EN VUELO (offset viejo)
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    srv.flush((p) => p.get("page") === "2" && p.get("pageSize") === "20");
    await waitFor(() => expect(paginaText()).toMatch(/Página 2/));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() => expect(srv.pending.some((p) => p.params.get("page") === "3")).toBe(true));
    // NO resolvemos page=3: queda pendiente con skip=40 (clase=ALL)

    // cambiar filtro a DOCTRINA (primaria rápida, total 36 → cliente, página 1)
    rerender(
      <DataTable columns={columns} source={{ endpoint: "/api/x", extraParams: { clase: "DOCTRINA" } }} pageSize={20} />,
    );
    await waitFor(() => expect(srv.pending.some((p) => p.params.get("clase") === "DOCTRINA")).toBe(true));
    srv.flush((p) => p.get("clase") === "DOCTRINA" && p.get("pageSize") === "200");
    await waitFor(() => expect(dataRowCount()).toBeGreaterThan(0));

    // resolvemos AHORA la request vieja de page=3 (clase=ALL, skip=40): NO debe ganar
    if (srv.pending.some((p) => p.params.get("page") === "3" && !p.params.get("clase"))) {
      srv.flush((p) => p.get("page") === "3" && !p.get("clase"));
    }

    // invariante duro: total > 0 ⟹ filas > 0 (nunca tabla vacía con total)
    await waitFor(() => expect(dataRowCount()).toBeGreaterThan(0));
    expect(dataRowCount()).toBeGreaterThan(0);
  });
});
