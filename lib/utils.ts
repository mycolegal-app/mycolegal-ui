import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --------------------------------------------------------------------------
// Tailwind className merge — the core utility for all components
// --------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --------------------------------------------------------------------------
// Currency formatting
// --------------------------------------------------------------------------

export function formatCurrency(amount: number | { toNumber(): number }): string {
  const num = typeof amount === 'number' ? amount : amount.toNumber();
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// --------------------------------------------------------------------------
// Date formatting (no date-fns dependency — use Intl)
// --------------------------------------------------------------------------

function toDate(date: Date | string): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

export function formatDate(date: Date | string): string {
  return toDate(date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return toDate(date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
