import * as React from "react";
import { marked } from "marked";

/**
 * Render de Markdown a HTML para uso compartido (resúmenes de resoluciones
 * editados por el revisor, respuestas del bot, etc.). El texto viene siempre
 * de fuentes internas (LLM o editor de personal con permiso), pero
 * neutralizamos `<` para impedir HTML crudo y XSS — la sintaxis markdown
 * (negritas, listas, encabezados, citas con `>`…) no la usa.
 *
 * Si necesitas pasar el HTML resultante a otro componente, usa
 * `renderMarkdown(text)`; si solo quieres pintarlo, monta `<Markdown />`.
 */

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(text: string): string {
  return marked.parse(text.replace(/</g, "&lt;"), { async: false }) as string;
}

interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto markdown. Vacío/nulo → componente no renderiza nada. */
  children?: string | null;
}

/**
 * Renderiza un bloque de markdown como HTML. Hereda el className para que el
 * llamador aplique tipografía/espaciados (clases `prose` u otras). No añade
 * estilos por defecto: si quieres negritas visibles, asegura `prose` o reglas
 * propias en el contenedor padre.
 */
export function Markdown({ children, className, ...rest }: MarkdownProps): React.ReactElement | null {
  if (!children || !children.trim()) return null;
  return (
    <div
      {...rest}
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(children) }}
    />
  );
}
