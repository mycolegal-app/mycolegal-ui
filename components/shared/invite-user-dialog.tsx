"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export interface InviteFormData {
  email: string;
  displayName: string;
  phoneNumber?: string;
  appRole?: string;
  language?: string;
}

export interface RoleOption {
  value: string;
  label: string;
}

export interface LanguageOption {
  value: string;
  label: string;
}

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InviteFormData) => Promise<void>;
  /** Role options. If provided, a role selector is shown. */
  roles?: RoleOption[];
  /** Hint text shown below the role selector */
  roleHint?: string;
  /** Language options. If provided, a language selector is shown (used by admin). */
  languages?: LanguageOption[];
  /** Default language value */
  defaultLanguage?: string;
  /** Email placeholder (e.g. "usuario@dominio.com") */
  emailPlaceholder?: string;
  /** Whether submission is in progress (controlled externally) */
  submitting?: boolean;
}

const DEFAULT_LANGUAGES: LanguageOption[] = [
  { value: "CAST", label: "Castellano" },
  { value: "CAT", label: "Catalán" },
  { value: "VAL", label: "Valenciano" },
  { value: "GAL", label: "Gallego" },
  { value: "EUS", label: "Euskera" },
];

export function InviteUserDialog({
  open,
  onOpenChange,
  onSubmit,
  roles,
  roleHint,
  languages,
  defaultLanguage = "CAST",
  emailPlaceholder = "usuario@ejemplo.com",
  submitting = false,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [appRole, setAppRole] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);

  const resetForm = useCallback(() => {
    setEmail("");
    setDisplayName("");
    setPhoneNumber("");
    setAppRole("");
    setLanguage(defaultLanguage);
  }, [defaultLanguage]);

  const canSubmit =
    email.length > 0 &&
    displayName.length > 0 &&
    (!roles || appRole.length > 0) &&
    !submitting;

  async function handleSubmit() {
    const data: InviteFormData = {
      email,
      displayName,
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(roles && appRole ? { appRole } : {}),
      ...(languages ? { language } : {}),
    };

    await onSubmit(data);
    resetForm();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Introduce los datos del nuevo usuario. Recibira un email de
            activacion para establecer su contrasena.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={emailPlaceholder}
            />
          </div>

          <div>
            <Label htmlFor="invite-displayName">Nombre completo</Label>
            <Input
              id="invite-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nombre y apellidos"
            />
          </div>

          <div>
            <Label htmlFor="invite-phone">Teléfono móvil</Label>
            <Input
              id="invite-phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+34 600 000 000"
            />
          </div>

          {roles && roles.length > 0 && (
            <div>
              <Label htmlFor="invite-role">Rol</Label>
              <Select value={appRole} onValueChange={setAppRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleHint && (
                <p className="text-xs text-muted-foreground mt-1">
                  {roleHint}
                </p>
              )}
            </div>
          )}

          {languages && (
            <div>
              <Label htmlFor="invite-language">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(languages.length > 0 ? languages : DEFAULT_LANGUAGES).map(
                    (l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Invitando..." : "Invitar usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
