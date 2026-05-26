"use client";

import { useEffect, useState } from "react";
import { MycoBotRail } from "./mycobot-rail";

/**
 * MycoBot listo para montar en CUALQUIER app de mycolegal-app. Aparece para
 * TODO usuario autenticado: la "ayuda de producto" (Manual de la app) NO está
 * gateada por suscripción. Tener Consultor solo AÑADE la doctrina (resoluciones)
 * y habilita el deep-link de citas a su página completa (`consultorUrl`). El
 * gating por carril lo aplica el backend (ayuda ungated; doctrina con
 * suscripción). Las llamadas (ask, conversaciones, detalle) van por el proxy
 * `/api/resoluciones/[[...path]]` de la app → Consultor inter.
 *
 * Incluir MycoBot en una app nueva = montar `<MycoBot appSlug="..."/>` (de
 * @mycolegal-app/ui) en su app-shell + el catch-all
 * `api/resoluciones/[[...path]]/route.ts` + env CONSULTOR_INTERNAL_URL e
 * INTER_SERVICE_KEY. Nada más.
 *
 * Dentro de Consultor NO se usa este wrapper: allí se monta `<MycoBotRail/>`
 * directamente (siempre disponible, endpoints y deep-links relativos).
 */
export function MycoBot({ appSlug }: { appSlug?: string }) {
  const [cfg, setCfg] = useState<{ available: boolean; consultorUrl?: string }>({ available: false });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // Usuario autenticado → MycoBot disponible (ayuda de producto ungated).
        // Si además la org tiene Consultor, guardamos su URL para el deep-link
        // de las citas de doctrina.
        if (!j?.data) return;
        const c = j.data.apps?.find((a: { slug: string }) => a.slug === "consultor");
        setCfg({ available: true, consultorUrl: c?.appUrl });
      })
      .catch(() => {});
  }, []);

  return <MycoBotRail available={cfg.available} consultorUrl={cfg.consultorUrl} appSlug={appSlug} />;
}
