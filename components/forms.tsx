"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, X } from "lucide-react";
import { Alert, Button, buttonStyles } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

export type FormAction = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(buttonStyles(variant, size), className)}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/**
 * Form that calls a server action, shows validation / server errors and a
 * success message, and can run a callback (e.g. close a dialog) on success.
 */
export function ActionForm({
  action,
  children,
  onSuccess,
  className,
  resetOnSuccess = false,
  hideSuccess = false,
}: {
  action: FormAction;
  children: (state: { fieldErrors: Record<string, string[] | undefined>; result: ActionResult<unknown> | null }) => ReactNode;
  onSuccess?: () => void;
  className?: string;
  resetOnSuccess?: boolean;
  hideSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult<unknown> | null>(null);

  useEffect(() => {
    if (state && state.ok && handled.current !== state) {
      handled.current = state;
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess, resetOnSuccess]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form ref={ref} action={formAction} className={className} noValidate={false}>
      {state && !state.ok && (
        <div className="mb-4">
          <Alert tone="error">{state.message}</Alert>
        </div>
      )}
      {state && state.ok && state.message && !hideSuccess && (
        <div className="mb-4">
          <Alert tone="success">{state.message}</Alert>
        </div>
      )}
      {children({ fieldErrors, result: state })}
    </form>
  );
}

export function fieldError(errors: Record<string, string[] | undefined>, name: string) {
  return errors[name]?.[0];
}

/** Button that calls a server action with fixed arguments (delete, cancel, ...). */
export function ConfirmActionButton({
  action,
  confirmText,
  children,
  variant = "secondary",
  size = "sm",
  className,
}: {
  action: () => Promise<ActionResult<unknown>>;
  confirmText?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (!res.ok) setError(res.message);
          });
        }}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {children}
      </Button>
      {error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {error}
        </span>
      )}
    </>
  );
}

const ModalCloseContext = createContext<(() => void) | null>(null);

export function useModalClose(): () => void {
  return useContext(ModalCloseContext) ?? (() => {});
}

/** Accessible modal dialog built on the native <dialog> element. */
export function Modal({
  trigger,
  title,
  children,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerVariant?: "primary" | "secondary" | "danger" | "ghost";
  triggerSize?: "sm" | "md";
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const close = () => setOpen(false);
  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/40"
      >
        {open && (
          <ModalCloseContext.Provider value={close}>
            <div className="max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                <button type="button" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-5">{typeof children === "function" ? children(close) : children}</div>
            </div>
          </ModalCloseContext.Provider>
        )}
      </dialog>
    </>
  );
}
