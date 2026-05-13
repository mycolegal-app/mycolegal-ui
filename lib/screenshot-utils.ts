/**
 * Helpers compartidos por `incident-reporter` (captura inicial al abrir un
 * incidente) y `incident-thread` (adjuntos opcionales del soporte). Aíslan
 * la dependencia con `html2canvas` y la compresión a JPEG para que el
 * formato persistido en `incident_reports.screenshot` y `incident_messages.
 * screenshot` quede idéntico independientemente del origen.
 */

export interface CaptureResult {
  /** `data:image/jpeg;base64,...` listo para POST. */
  dataUrl: string;
}

/** Captura la pantalla actual del usuario via html2canvas. */
export async function captureViewport(): Promise<CaptureResult> {
  const mod = await import("html2canvas");
  const html2canvas = (mod.default || mod) as typeof import("html2canvas").default;
  const canvas = await html2canvas(document.body, {
    backgroundColor: null,
    logging: false,
    useCORS: true,
    // Cap scale so the resulting JPEG stays reasonable on 4K screens.
    scale: Math.min(window.devicePixelRatio || 1, 1.5),
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.clientHeight,
  });
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.7) };
}

/**
 * Lee un File/Blob como data URL JPEG, opcionalmente redimensionando a
 * `maxWidth`. Útil para subidas (drag&drop, <input file>) y pegados desde
 * el portapapeles donde el blob puede venir como PNG enorme.
 */
export async function blobToCompressedJpeg(
  blob: Blob,
  maxWidth = 1600,
  quality = 0.8,
): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    // Fondo blanco para que un PNG con transparencia no salga negro tras
    // pasar a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/**
 * Extrae la primera imagen del ClipboardEvent y devuelve un Blob, o `null`
 * si el evento no contiene ninguna. Útil como onPaste en un textarea para
 * el flujo "pega una captura aquí".
 */
export function imageBlobFromPaste(e: ClipboardEvent): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return blob;
    }
  }
  return null;
}
