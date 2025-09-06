"use client"

import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"

export const AlertDialog = Dialog.Root
export const AlertDialogTrigger = Dialog.Trigger

export function AlertDialogContent({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg focus:outline-none">
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export function AlertDialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 space-y-1">{children}</div>
}

export function AlertDialogTitle({ children }: { children: React.ReactNode }) {
  return <Dialog.Title className="text-lg font-semibold">{children}</Dialog.Title>
}

export function AlertDialogDescription({ children }: { children: React.ReactNode }) {
  return <Dialog.Description className="text-sm text-gray-600 dark:text-gray-300">{children}</Dialog.Description>
}

export function AlertDialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex items-center justify-end gap-3">{children}</div>
}

