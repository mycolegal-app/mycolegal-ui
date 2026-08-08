"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardPaste,
  Download,
  Eye,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  History,
  Info,
  Inbox,
  Lock,
  Mail,
  Move,
  Pencil,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageTitle } from "../layout/page-title";
import { DataTable } from "../shared/data-table";
import { DocumentPreviewModal, isPreviewable } from "../shared/document-preview-modal";
import { useI18n } from "../i18n/i18n-context";

interface PreviewState {
  open: boolean;
  nodeId: string | null;
  name: string;
  mimeType: string | null;
  url: string | null;
  loading: boolean;
  error: string | null;
}

// Nombre legible de cada app para las raíces `APP:{slug}` del área "Documentos".
const APP_NAMES: Record<string, string> = {
  notaria: "Notaría",
  legifirma: "Legifirma",
  polizas: "Pólizas",
  archivo: "Archivo",
  cancelaciones: "Cancelaciones",
  copias: "Copias",
  moratorias: "Moratorias",
  actas: "Actas",
  consultor: "Consultor",
  tributos: "Tributos",
  peticiones: "Peticiones",
};
function appDisplayName(slug: string): string {
  return APP_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

const PREVIEW_CLOSED: PreviewState = {
  open: false,
  nodeId: null,
  name: "",
  mimeType: null,
  url: null,
  loading: false,
  error: null,
};

// Iconos disponibles para smart folders (B.5). `SmartFolderType.icon` = una de
// estas claves; si no casa, se usa la carpeta normal. Se mantiene curado (no se
// resuelve dinámicamente cualquier nombre de lucide) para no inflar el bundle.
const SMART_ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  mail: Mail,
  alert: AlertTriangle,
  warning: AlertTriangle,
  star: Star,
  folderinput: FolderInput,
  file: FileText,
  folder: Folder,
};

export interface DriveNode {
  id: string;
  type: "FOLDER" | "FILE";
  name: string;
  visibility: "ORG" | "PRIVATE";
  rootKey: string | null;
  managed: boolean;
  mine: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Metadatos visuales del smart folder (B.5). */
  smartFolder?: { color: string | null; icon: string | null; description: string | null } | null;
}

/** Ítem devuelto por `POST /search` (DTO ligero por nombre). */
interface SearchItem {
  id: string;
  name: string;
  type: "FOLDER" | "FILE";
  mimeType: string | null;
  sizeBytes: number | null;
}

interface Crumb {
  id: string;
  name: string;
  rootKey: string | null;
}

interface DriveVersion {
  generation: string;
  size: number;
  updated?: string;
}

interface ListResponse {
  breadcrumb: Crumb[];
  parent: { id: string; name: string; rootKey: string | null; managed?: boolean; writable?: boolean; trash?: boolean } | null;
  nodes: DriveNode[];
  truncated?: boolean;
}

export interface UnidadExplorerProps {
  /** `browse` (por defecto) = explorador completo; `picker` = modo selección
   *  (los ficheros muestran "Seleccionar" y emiten `onPick`). */
  mode?: "browse" | "picker";
  /** Callback al seleccionar un fichero en modo picker. */
  onPick?: (node: DriveNode) => void;
  /** Base de la API (por defecto `/api/unidad`). El "Área de archivos" (modo
   *  partner) monta el mismo factory en `/api/area-archivos`. */
  basePath?: string;
  /** Título/raíz a mostrar (por defecto la Unidad de red). */
  title?: string;
  subtitle?: string;
}

export function UnidadExplorer({
  mode = "browse",
  onPick,
  basePath = "/api/unidad",
  title,
  subtitle,
}: UnidadExplorerProps = {}) {
  const { t } = useI18n();
  const [parentId, setParentId] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<DriveNode | null>(null);
  const [versions, setVersions] = useState<{ node: DriveNode; list: DriveVersion[]; loading: boolean } | null>(null);
  const [preview, setPreview] = useState<PreviewState>(PREVIEW_CLOSED);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Búsqueda por nombre (B.2): consulta el endpoint `/search` (scope del backend).
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Nombre a mostrar: las raíces se traducen por rootKey.
  const displayName = useCallback(
    (n: { name: string; rootKey: string | null }) => {
      if (n.rootKey === "COMPARTIDO") return t("unidad.compartido");
      if (n.rootKey?.startsWith("MIESPACIO")) return t("unidad.miEspacio");
      if (n.rootKey?.startsWith("TRASH:")) return t("unidad.papelera");
      // Raíz de app en "Documentos": `APP:{slug}` → nombre legible de la app.
      if (n.rootKey?.startsWith("APP:")) return appDisplayName(n.rootKey.slice(4));
      return n.name;
    },
    [t],
  );

  const load = useCallback(
    async (pid: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = pid ? `?parentId=${encodeURIComponent(pid)}` : "";
        const res = await fetch(`${basePath}/list${qs}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error?.message ?? t("unidad.errorCargar"));
          setData(null);
          return;
        }
        setData(json.data as ListResponse);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    load(parentId);
  }, [parentId, load]);

  // Búsqueda por nombre contra el backend (respeta el scope del gate). Debounce
  // 300ms; <2 caracteres = sin búsqueda (vuelve a la vista de carpeta).
  const runSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const res = await fetch(`${basePath}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = await res.json();
        setSearchResults(res.ok ? ((json.data?.items ?? []) as SearchItem[]) : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [basePath],
  );

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(timer);
  }, [search, runSearch]);

  // Adapta un resultado de búsqueda (DTO ligero) a `DriveNode` para reusar los
  // handlers de vista previa / descarga.
  const asNode = (r: SearchItem): DriveNode => ({
    id: r.id,
    name: r.name,
    type: r.type,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    visibility: "ORG",
    rootKey: null,
    managed: false,
    mine: false,
    createdAt: "",
  });

  // Escribible cuando estamos DENTRO de una carpeta NO de sistema (no raíz-
  // listado, no carpeta `managed` como una raíz de app). El backend lo reafirma.
  // Escritura: carpeta libre (no gestionada) O gestionada-writable (Biblioteca
  // particular, smart-inbox de aportaciones). El backend lo reafirma.
  const canWrite =
    parentId != null && data?.parent != null && (!data.parent.managed || !!data.parent.writable);
  // Los ficheros de una carpeta writable-gestionada (Biblioteca particular) se
  // pueden "Incorporar al corpus" privado de la org.
  const canIncorporate = !!(data?.parent?.managed && data?.parent?.writable);

  async function handleNewFolder() {
    if (!parentId) return;
    const name = window.prompt(t("unidad.nombreCarpeta"));
    if (!name || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorCrearCarpeta"));
        return;
      }
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(files: FileList) {
    if (!parentId || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const contentType = file.type || "application/octet-stream";
        const res = await fetch(`${basePath}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentId,
            filename: file.name,
            contentType,
            sizeBytes: file.size,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.data?.uploadUrl) {
          setError(json?.error?.message ?? t("unidad.errorSubir"));
          break;
        }
        // PUT directo a GCS. Si el bucket no tiene CORS para este origen el
        // `fetch` LANZA (no devuelve !ok), así que hay que capturarlo: sin el
        // catch la excepción escapaba y se saltaba el `load()` final — la vista
        // no refrescaba y el nodo quedaba en BD sin bytes (fichero fantasma).
        let ok = false;
        try {
          const put = await fetch(json.data.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: file,
          });
          ok = put.ok;
        } catch {
          ok = false;
        }
        if (!ok) {
          setError(t("unidad.errorSubir"));
          // Retira el nodo recién creado para no dejar un fichero sin contenido.
          if (json?.data?.created && json?.data?.node?.id) {
            await fetch(`${basePath}/node/${json.data.node.id}`, { method: "DELETE" }).catch(() => {});
          }
          break;
        }
        // Confirma la subida: contabiliza el almacenamiento facturable (lee el
        // tamaño real de GCS). Best-effort: no bloquea la subida si falla, pero
        // se espera para que el `load()` posterior ya vea el tamaño definitivo.
        const nodeId: string | undefined = json?.data?.node?.id;
        if (nodeId) {
          await fetch(`${basePath}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId }),
          }).catch(() => {});
        }
      }
    } finally {
      // Refresca SIEMPRE (también si la subida falló a medias): la lista debe
      // reflejar el estado real del servidor, no el que asumimos.
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load(parentId);
    }
  }

  async function handleDownload(node: DriveNode) {
    const res = await fetch(`${basePath}/download/${node.id}`);
    const json = await res.json();
    if (!res.ok || !json?.data?.url) {
      setError(json?.error?.message ?? t("unidad.errorDescargar"));
      return;
    }
    window.open(json.data.url, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(node: DriveNode) {
    if (!window.confirm(t("unidad.confirmarBorrar", { name: displayName(node) }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/node/${node.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorBorrar"));
        return;
      }
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  // Restaura un elemento (subárbol) desde la papelera de un área.
  async function handleRestoreTrash(node: DriveNode) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/node/${node.id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorRestaurar"));
        return;
      }
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(node: DriveNode) {
    const name = window.prompt(t("unidad.nuevoNombre"), displayName(node));
    if (!name || !name.trim() || name.trim() === node.name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/node/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorRenombrar"));
        return;
      }
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  async function handlePaste() {
    if (!moving || !parentId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/node/${moving.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorMover"));
        return;
      }
      setMoving(null);
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview(node: DriveNode) {
    setPreview({
      ...PREVIEW_CLOSED,
      open: true,
      nodeId: node.id,
      name: node.name,
      mimeType: node.mimeType,
      loading: true,
    });
    try {
      const res = await fetch(`${basePath}/download/${node.id}?disposition=inline`);
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        setPreview((p) =>
          p.nodeId === node.id
            ? { ...p, loading: false, error: json?.error?.message ?? t("unidad.errorPreview") }
            : p,
        );
        return;
      }
      setPreview((p) => (p.nodeId === node.id ? { ...p, loading: false, url: json.data.url } : p));
    } catch {
      setPreview((p) =>
        p.nodeId === node.id ? { ...p, loading: false, error: t("unidad.errorPreview") } : p,
      );
    }
  }

  async function handleVersions(node: DriveNode) {
    setVersions({ node, list: [], loading: true });
    setError(null);
    const res = await fetch(`${basePath}/node/${node.id}/versions`);
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? t("unidad.errorVersiones"));
      setVersions(null);
      return;
    }
    setVersions({ node, list: (json.data.versions ?? []) as DriveVersion[], loading: false });
  }

  async function handleRestore(node: DriveNode, generation: string) {
    if (!window.confirm(t("unidad.confirmarRestaurar"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/node/${node.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? t("unidad.errorRestaurar"));
        return;
      }
      setVersions(null);
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }

  const inTrash = data?.parent?.trash ?? false;

  const columns = useMemo<ColumnDef<DriveNode, unknown>[]>(
    () => [
      {
        id: "nombre",
        header: t("unidad.colNombre"),
        cell: ({ row }) => {
          const n = row.original;
          const isTrash = n.rootKey?.startsWith("TRASH:") ?? false;
          const sf = n.smartFolder;
          const label = displayName(n);
          if (n.type === "FOLDER") {
            // Smart folder (B.5): icono/color identificable + "(i)" con su comportamiento.
            const FolderIcon =
              (sf?.icon && SMART_ICONS[sf.icon.toLowerCase()]) || (isTrash ? Trash2 : Folder);
            const iconClass = isTrash
              ? "text-gray-400"
              : sf?.color
                ? ""
                : "text-mc-primary-700";
            return (
              <button
                type="button"
                onClick={() => setParentId(n.id)}
                className="flex items-center gap-2 min-w-0 text-left hover:underline"
              >
                <FolderIcon
                  className={`h-4 w-4 shrink-0 ${iconClass}`}
                  style={!isTrash && sf?.color ? { color: sf.color } : undefined}
                />
                <span className="truncate font-medium">{label}</span>
                {sf?.description && (
                  <span
                    title={sf.description}
                    aria-label={sf.description}
                    className="inline-flex shrink-0 cursor-help"
                  >
                    <Info className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                )}
                {n.managed && !isTrash && !sf && <Lock className="h-3 w-3 shrink-0 text-gray-400" />}
              </button>
            );
          }
          const Icon = FileText;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate">{label}</span>
            </div>
          );
        },
      },
      {
        id: "visibilidad",
        header: t("unidad.colVisibilidad"),
        cell: ({ row }) => {
          const n = row.original;
          return n.visibility === "PRIVATE" ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-800">
              <Lock className="h-3 w-3" /> {t("unidad.privado")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-800">
              <Users className="h-3 w-3" /> {t("unidad.compartidoBadge")}
            </span>
          );
        },
      },
      {
        id: "tamano",
        header: () => <div className="text-right">{t("unidad.colTamano")}</div>,
        cell: ({ row }) => (
          <div className="text-right text-gray-500">
            {row.original.sizeBytes != null ? `${(row.original.sizeBytes / 1024).toFixed(0)} KB` : "—"}
          </div>
        ),
      },
      {
        id: "acciones",
        header: () => null,
        cell: ({ row }) => {
          const n = row.original;
          // Vista de papelera: única acción posible = restaurar el elemento.
          if (inTrash) {
            return (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRestoreTrash(n)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("unidad.restaurar")}
                </button>
              </div>
            );
          }
          return (
            <div className="flex items-center justify-end gap-2">
              {mode === "picker" && n.type === "FILE" && (
                <button
                  type="button"
                  onClick={() => onPick?.(n)}
                  className="inline-flex items-center gap-1 rounded-md bg-mc-primary-700 px-3 py-1 text-xs font-medium text-white hover:bg-mc-primary-800"
                >
                  {t("unidad.seleccionar")}
                </button>
              )}
              {n.type === "FILE" && !n.managed && (
                <button
                  type="button"
                  onClick={() => handleVersions(n)}
                  title={t("unidad.historial")}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <History className="h-3 w-3" />
                </button>
              )}
              {n.type === "FILE" && isPreviewable(n.mimeType, n.name) && (
                <button
                  type="button"
                  onClick={() => handlePreview(n)}
                  title={t("unidad.previsualizar")}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="h-3 w-3" />
                </button>
              )}
              {n.type === "FILE" && (
                <button
                  type="button"
                  onClick={() => handleDownload(n)}
                  title={t("unidad.descargar")}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-3 w-3" />
                </button>
              )}
              {!n.rootKey && !n.managed && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRename(n)}
                    title={t("unidad.renombrar")}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMoving(n)}
                    title={t("unidad.mover")}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Move className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(n)}
                    title={t("unidad.borrar")}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, busy, displayName, mode, onPick, inTrash],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTitle title={title ?? t("unidad.titulo")} subtitle={subtitle ?? t("unidad.subtitulo")} />

      {/* Barra: breadcrumb + acciones */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1 text-sm text-gray-600">
          <button
            type="button"
            onClick={() => setParentId(null)}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <HardDrive className="h-4 w-4" />
            {title ?? t("unidad.titulo")}
          </button>
          {data?.breadcrumb.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <button type="button" onClick={() => setParentId(c.id)} className="hover:underline">
                {displayName(c)}
              </button>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("unidad.buscarPlaceholder")}
              className="w-56 rounded-md border border-gray-300 py-2 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
            />
          </div>
          {canWrite && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleNewFolder}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <FolderPlus className="h-4 w-4" />
                {t("unidad.nuevaCarpeta")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-md bg-mc-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-mc-primary-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {busy ? t("common.loading") : t("unidad.subir")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
              />
            </>
          )}
        </div>
      </div>

      {moving && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-mc-primary-200 bg-mc-primary-50 px-3 py-2 text-sm">
          <Move className="h-4 w-4 shrink-0 text-mc-primary-700" />
          <span className="truncate">{t("unidad.moviendo", { name: displayName(moving) })}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={handlePaste}
              className="inline-flex items-center gap-1 rounded-md bg-mc-primary-700 px-3 py-1 text-xs font-medium text-white hover:bg-mc-primary-800 disabled:opacity-50"
            >
              <ClipboardPaste className="h-3 w-3" />
              {t("unidad.pegarAqui")}
            </button>
            <button
              type="button"
              onClick={() => setMoving(null)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-3 w-3" />
              {t("unidad.cancelar")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col">
        {searchResults != null ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
              <span className="truncate">{t("unidad.resultadosBusqueda", { q: search.trim() })}</span>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="shrink-0 text-mc-primary-700 hover:underline"
              >
                {t("unidad.limpiarBusqueda")}
              </button>
            </div>
            {searchResults.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                {searching ? t("common.loading") : t("unidad.sinResultados")}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {searchResults.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                    {r.type === "FOLDER" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setParentId(r.id);
                          setSearch("");
                        }}
                        className="flex min-w-0 items-center gap-2 text-left hover:underline"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-mc-primary-700" />
                        <span className="truncate font-medium">{r.name}</span>
                      </button>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                        <span className="truncate">{r.name}</span>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          {isPreviewable(r.mimeType, r.name) && (
                            <button
                              type="button"
                              onClick={() => handlePreview(asNode(r))}
                              title={t("unidad.previsualizar")}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(asNode(r))}
                            title={t("unidad.descargar")}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {data && (
              <DataTable
                columns={columns}
                data={data.nodes}
                pageSize={20}
                scrollable
                fillParent
                searchable={false}
              />
            )}
            {data && data.nodes.length === 0 && !loading && (
              <p className="mt-4 text-sm text-gray-500">{t("unidad.vacio")}</p>
            )}
          </>
        )}
      </div>

      {versions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setVersions(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="truncate text-sm font-semibold">
                {t("unidad.historial")} — {versions.node.name}
              </h3>
              <button type="button" onClick={() => setVersions(null)} title={t("unidad.cancelar")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {versions.loading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : versions.list.length === 0 ? (
              <p className="text-sm text-gray-500">{t("unidad.sinVersiones")}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-gray-100 overflow-auto">
                {versions.list.map((v, i) => (
                  <li key={v.generation} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-gray-600">
                      {v.updated ? new Date(v.updated).toLocaleString("es-ES") : v.generation}
                      <span className="ml-2 text-xs text-gray-400">{(v.size / 1024).toFixed(0)} KB</span>
                      {i === 0 && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-800">
                          {t("unidad.versionActual")}
                        </span>
                      )}
                    </span>
                    <div className="ml-auto flex shrink-0 gap-2">
                      <a
                        href={`${basePath}/download/${versions.node.id}?generation=${v.generation}`}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                        title={t("unidad.descargar")}
                      >
                        <Download className="h-3 w-3" />
                      </a>
                      {i !== 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRestore(versions.node, v.generation)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t("unidad.restaurar")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <DocumentPreviewModal
        open={preview.open}
        onOpenChange={(open) => setPreview((p) => ({ ...p, open }))}
        url={preview.url}
        name={preview.name}
        mimeType={preview.mimeType}
        loading={preview.loading}
        error={preview.error}
        nodeId={preview.nodeId ?? undefined}
        canIncorporate={canIncorporate}
        onDownload={
          preview.nodeId
            ? () => {
                const node = data?.nodes.find((x) => x.id === preview.nodeId);
                if (node) handleDownload(node);
              }
            : undefined
        }
      />
    </div>
  );
}
