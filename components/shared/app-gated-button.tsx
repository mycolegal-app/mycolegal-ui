"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useIsAppEnabled } from "../../hooks/use-org-apps";

interface AppGatedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Slug de la app cuya habilitación gobierna este botón (p.ej. "docfilling"). */
  appSlug: string;
  /**
   * Mensaje del tooltip cuando la app NO está habilitada para la org.
   * Se renderiza vía `title` del wrapper para que aparezca en hover sin
   * cargar tooling extra. Para componentes con tooltip rico, envolver
   * directamente con un Tooltip personalizado y usar `useIsAppEnabled`.
   */
  disabledTooltip: string;
  /**
   * Si `true`, muestra el botón disabled mientras está cargando el estado
   * de apps habilitadas (evita FOUC). Default: `true`. Para acciones poco
   * frecuentes que merece la pena dejar disponibles desde el primer paint
   * (asumiendo enabled), pasar `false`.
   */
  disableWhileLoading?: boolean;
  children: ReactNode;
}

/**
 * Botón gateado por la habilitación de una app.
 *
 * - Si la app está activa para la org → renderiza el button normal.
 * - Si NO está activa → button disabled con `title=disabledTooltip` (tooltip
 *   del navegador). El click queda bloqueado y se preserva todo el styling.
 *
 * Uso típico (DocFilling):
 *
 *   <AppGatedButton
 *     appSlug="docfilling"
 *     disabledTooltip="La generación documental con IA (DocFilling) no está habilitada para tu organización."
 *     onClick={() => setDocFillingOpen(true)}
 *     className="..."
 *   >
 *     Generar documento
 *   </AppGatedButton>
 */
export const AppGatedButton = forwardRef<HTMLButtonElement, AppGatedButtonProps>(
  function AppGatedButton(
    { appSlug, disabledTooltip, disableWhileLoading = true, disabled, title, onClick, children, ...rest },
    ref,
  ) {
    const enabled = useIsAppEnabled(appSlug);
    const isLoading = enabled === null;
    const isGatedDisabled = enabled === false;
    const finalDisabled = !!disabled || isGatedDisabled || (isLoading && disableWhileLoading);

    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        disabled={finalDisabled}
        title={isGatedDisabled ? disabledTooltip : title}
        aria-disabled={finalDisabled || undefined}
        onClick={isGatedDisabled ? undefined : onClick}
      >
        {children}
      </button>
    );
  },
);
