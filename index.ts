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
export { IncidentReporter } from './components/shared/incident-reporter';
export { SpainCCAAMap } from './components/shared/spain-ccaa-map';
export type { SpainCCAAMapJurisdiccion, SpainCCAAMapProps } from './components/shared/spain-ccaa-map';
export { NotificationsBell } from './components/shared/notifications-bell';
export type { NotificationEntry } from './components/shared/notifications-bell';
export { IncidentThread } from './components/shared/incident-thread';
export type {
  IncidentThreadIncident,
  IncidentThreadMessage,
} from './components/shared/incident-thread';
export { SortableList } from './components/shared/sortable-list';
export type { SortableListProps } from './components/shared/sortable-list';
export { IdleTimeout } from './components/layout/idle-timeout';

// Utilities
export { cn, formatCurrency, formatDate, formatDateTime } from './lib/utils';

// Hooks
export { toast, useToast } from './hooks/use-toast';
export type { ToastVariant, Toast as ToastType } from './hooks/use-toast';
export { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
export type { KeyboardShortcut } from './hooks/use-keyboard-shortcuts';
export { useVersionInfo } from './hooks/use-version-info';
export type { VersionInfo } from './hooks/use-version-info';
export { useAuthFetchGuard } from './hooks/use-auth-fetch-guard';

// DocFilling integration
export { DocFillingModal } from './components/docfilling/DocFillingModal';
export type { DocFillingModalProps } from './components/docfilling/DocFillingModal';
