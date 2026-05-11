export interface AppInfo {
  slug: string;
  name: string;
  appUrl: string;
  /** Raw SVG markup (not a URL). Rendered via dangerouslySetInnerHTML. */
  logoSvg?: string | null;
}
