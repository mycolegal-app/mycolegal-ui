// UI Components
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';
export { Badge, badgeVariants } from './components/ui/badge';
export type { BadgeProps } from './components/ui/badge';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './components/ui/card';
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './components/ui/dialog';
export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';
export { Label } from './components/ui/label';
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectScrollUpButton, SelectScrollDownButton } from './components/ui/select';
export { Separator } from './components/ui/separator';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
export { Textarea } from './components/ui/textarea';
export type { TextareaProps } from './components/ui/textarea';
export { Toast } from './components/ui/toast';
export { Toaster } from './components/ui/toaster';

// Shared Components
export { PageHeader } from './components/shared/page-header';
export { DataTable } from './components/shared/data-table';
export { FirstRunWelcome } from './components/shared/first-run-welcome';
export type { WelcomeStep } from './components/shared/first-run-welcome';
export { HelpMenu } from './components/shared/help-menu';
export { AlertBanner } from './components/shared/alert-banner';
export { LoadingSpinner } from './components/shared/loading-spinner';
export { EmptyState } from './components/shared/empty-state';
export { KpiCard } from './components/shared/kpi-card';
export { LoginForm } from './components/shared/login-form';
export { SetPasswordForm } from './components/shared/set-password-form';
export { ChangePasswordForm } from './components/shared/change-password-form';
export { ForgotPasswordForm } from './components/shared/forgot-password-form';
export { AppCard } from './components/shared/app-card';
export { Breadcrumbs } from './components/shared/breadcrumbs';
export { CollapsibleSection } from './components/shared/collapsible-section';
export { SidePanel } from './components/shared/side-panel';
export { StatusBadge } from './components/shared/status-badge';
export { CommandPalette } from './components/shared/command-palette';
export type { CommandResultGroup, CommandResultItem, CommandQuickAction } from './components/shared/command-palette';
export { AppInfoButton } from './components/shared/app-info-button';
export { EmailConfigForm, deriveProvider } from './components/shared/email-config-form';
export type { EmailConfigValues, EmailProvider, EmailConfigFormProps } from './components/shared/email-config-form';
export { EmailTemplatesManager } from './components/shared/email-templates-manager';
export type { EmailTemplateEntry, EmailTemplatesManagerProps } from './components/shared/email-templates-manager';
export { DocumentProducer } from './components/shared/document-producer';
export type {
  DocumentProducerProps,
  DocumentProducerResolution,
  DocumentFieldSpec,
} from './components/shared/document-producer';
export { IncidentReporter } from './components/shared/incident-reporter';
export { BillingPanel } from './components/shared/billing-panel';
export type { BillingPanelProps } from './components/shared/billing-panel';
export { CreditBalanceBadge } from './components/shared/credit-balance-badge';
export { CreditsPurchaseModal } from './components/shared/credits-purchase-modal';
export { MycoBotRail } from './components/shared/mycobot-rail';
export { FuentesModal } from './components/shared/fuentes-modal';
export type { FuentesModalProps, FuenteCatalogoDTO } from './components/shared/fuentes-modal';
export { readFuentesSel, writeFuentesSel, FUENTES_CHANGED_EVENT } from './lib/biblioteca-fuentes';
export { readClasesSel, writeClasesSel, CLASES_CHANGED_EVENT } from './lib/biblioteca-clases';
export { ForoLauncher } from './components/foro/foro-launcher';
export { MycoBot } from './components/shared/mycobot';
export { UserAccountDialog } from './components/shared/user-account-dialog';
export { SpainCCAAMap } from './components/shared/spain-ccaa-map';
export type { SpainCCAAMapJurisdiccion, SpainCCAAMapProps } from './components/shared/spain-ccaa-map';
export { NotificationsBell } from './components/shared/notifications-bell';
export type { NotificationEntry } from './components/shared/notifications-bell';
export { IncidentThread } from './components/shared/incident-thread';
export type {
  IncidentThreadIncident,
  IncidentThreadMessage,
} from './components/shared/incident-thread';
export { IncidentProposalCard } from './components/shared/incident-proposal-card';
export type {
  IncidentProposalCardProps,
  IncidentProposalEntry,
  IncidentProposalIncidentSummary,
} from './components/shared/incident-proposal-card';
export { IncidentProposalsList } from './components/shared/incident-proposals-list';
export type { IncidentProposalsListProps } from './components/shared/incident-proposals-list';
// Shared "my incidents" pages — every consumer app re-exports these as
// the default export of their /incidencias and /incidencias/[number]
// route segments. See server/incidents-routes.ts for the matching
// API handler factory.
export { MyIncidentsPage } from './components/shared/incidents-pages/my-incidents-page';
export { IncidentDetailPage } from './components/shared/incidents-pages/incident-detail-page';
export { SortableList } from './components/shared/sortable-list';
export type { SortableListProps } from './components/shared/sortable-list';
export { AppGatedButton } from './components/shared/app-gated-button';
export { SearchableSelect } from './components/shared/searchable-select';
export type { SearchableOption } from './components/shared/searchable-select';
export { ClientPicker } from './components/shared/client-picker';
export type { ClientOption } from './components/shared/client-picker';
export { EstadoPeticionesConsole } from './components/shared/estado-peticiones-console';
export type {
  EstadoPeticionesConsoleProps,
  ConsoleGroup,
  ConsoleBucket,
  ConsoleAlarma,
} from './components/shared/estado-peticiones-console';
export { ClienteFormDialog } from './components/shared/cliente-form-dialog';
export type { ClienteFormData } from './components/shared/cliente-form-dialog';
export { ActPicker } from './components/shared/act-picker';
export type { ActOption } from './components/shared/act-picker';
export { ActSearchBox } from './components/shared/act-search-box';
export { EmpleadoAsignadoPicker } from './components/shared/empleado-asignado-picker';
export type { EmpleadoOption } from './components/shared/empleado-asignado-picker';
export { IdleTimeout } from './components/layout/idle-timeout';
export { Markdown, renderMarkdown } from './components/shared/markdown';
export { MarkdownEditor } from './components/shared/markdown-editor';

// Utilities
export { cn, formatCurrency, formatDate, formatDateTime } from './lib/utils';
export { apiErrorMessage, apiErrorFromResponse } from './lib/api-error';
export type { ApiErrorInfo, TranslateFn } from './lib/api-error';

// Hooks
export { toast, useToast } from './hooks/use-toast';
export type { ToastVariant, Toast as ToastType } from './hooks/use-toast';
export { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
export type { KeyboardShortcut } from './hooks/use-keyboard-shortcuts';
export { useVersionInfo } from './hooks/use-version-info';
export type { VersionInfo } from './hooks/use-version-info';
export { useReleaseNotes } from './hooks/use-release-notes';
export type { ReleaseNotesState } from './hooks/use-release-notes';
export { useAuthFetchGuard } from './hooks/use-auth-fetch-guard';
export { useOrgApps, useIsAppEnabled, invalidateOrgApps } from './hooks/use-org-apps';
export { useIsOrgAdmin } from './hooks/use-is-org-admin';
export { usePermissions, type UsePermissionsResult } from './hooks/use-permissions';

// i18n defaults (used by consumer apps' I18nProvider#defaults)
export { uiMessages, getUiDefaults } from './i18n';

// Document preview (modal reutilizable: PDF/imagen/audio/vídeo/HTML/texto/markdown/CSV)
export { DocumentPreviewModal, isPreviewable, previewKind } from './components/shared/document-preview-modal';
export type { DocumentPreviewModalProps, PreviewKind } from './components/shared/document-preview-modal';

// DocFilling integration
export { DocFillingModal } from './components/docfilling/DocFillingModal';

// NOTE: e2e shared-lock helpers (./e2e/shared-lock and ./e2e/shared-lock-fixture)
// are intentionally NOT re-exported here — they import `@playwright/test`,
// which is not a runtime dep. Consumer apps import them directly via subpath:
//   import { skipIfSharedAlreadyPassed } from '@mycolegal-app/ui/e2e/shared-lock-fixture';
export type { DocFillingModalProps } from './components/docfilling/DocFillingModal';
