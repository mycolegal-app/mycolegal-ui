"use client";

import { useState, useEffect } from "react";

export type ToastVariant = "default" | "destructive" | "success";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

let listeners: Array<(toasts: Toast[]) => void> = [];
let memoryToasts: Toast[] = [];
let counter = 0;

function dispatch(toasts: Toast[]) {
  memoryToasts = toasts;
  listeners.forEach((listener) => listener(toasts));
}

function addToast(toast: Omit<Toast, "id">) {
  const id = String(++counter);
  const newToast: Toast = { id, ...toast };
  dispatch([...memoryToasts, newToast]);

  setTimeout(() => {
    dispatch(memoryToasts.filter((t) => t.id !== id));
  }, 5000);

  return id;
}

function dismissToast(id: string) {
  dispatch(memoryToasts.filter((t) => t.id !== id));
}

export function toast(props: Omit<Toast, "id">) {
  return addToast(props);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryToasts);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  return {
    toasts,
    toast: addToast,
    dismiss: dismissToast,
  };
}
