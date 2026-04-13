"use client";

import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  side?: "left" | "right";
  maxWidth?: string;
}

export function SidePanel({
  open,
  onOpenChange,
  title,
  children,
  side = "right",
  maxWidth = "max-w-md",
}: SidePanelProps) {
  const slideIn = side === "right" ? "data-[state=open]:slide-in-from-right" : "data-[state=open]:slide-in-from-left";
  const slideOut = side === "right" ? "data-[state=closed]:slide-out-to-right" : "data-[state=closed]:slide-out-to-left";
  const position = side === "right" ? "right-0" : "left-0";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed ${position} top-0 z-50 h-full w-full ${maxWidth} border-l bg-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out ${slideOut} ${slideIn} duration-200`}
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="h-[calc(100%-56px)] overflow-y-auto p-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
