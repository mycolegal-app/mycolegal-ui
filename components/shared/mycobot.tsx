"use client";

import { useEffect, useState } from "react";
import { MycoBotRail } from "./mycobot-rail";

/**
 * MycoBot listo para montar en CUALQUIER app de mycolegal-app. Autodetecta la
 * disponibilidad: solo aparece si la org tiene Consultor entre sus apps
 * (`/api/auth/me`). El deep-link de citas usa la URL pública de Consultor que
 * devuelve ese endpoint. Las llamadas (ask, conversaciones, detalle) van por el
 * proxy `/api/resoluciones/[[...path]]` de la app → Consultor inter.
 *
 * Incluir MycoBot en una app nueva = montar `<MycoBot/>` (de @mycolegal-app/ui)
 * en su app-shell + el catch-all `api/resoluciones/[[...path]]/route.ts` +
 * env CONSULTOR_INTERNAL_URL e INTER_SERVICE_KEY. Nada más.
 *
 * Dentro de Consultor NO se usa este wrapper: allí se monta `<MycoBotRail/>`
 * directamente (siempre disponible, endpoints y deep-links relativos).
 */
export function MycoBot() {
  const [cfg, setCfg] = useState<{ available: boolean; consultorUrl?: string }>({ available: false });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const c = j?.data?.apps?.find((a: { slug: string }) => a.slug === "consultor");
        if (c) setCfg({ available: true, consultorUrl: c.appUrl });
      })
      .catch(() => {});
  }, []);

  return <MycoBotRail available={cfg.available} consultorUrl={cfg.consultorUrl} />;
}
