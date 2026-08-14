// #575 — El viejo sistema de ayuda "overlay" (HelpProvider/HelpOverlay/HelpButton/
// HelpTooltip/usePageHelp) se ha jubilado en favor del Centro de Ayuda (HelpMenu,
// en components/shared/help-menu). Este barrel solo conserva ya el sistema de Manual.
export { ManualLayout, type ManualSection } from "./manual-layout";
export { createManualResolver } from "./manual-resolver";
export { makeManualSectionPage } from "./manual-section-page";
