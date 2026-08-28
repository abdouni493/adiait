"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Renders modal content into a portal at document.body so that
 *  it is never caught in a parent component's unmount cascade
 *  (which previously caused `null.removeChild` crashes when
 *  navigating away while a modal's host page was being destroyed). */
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  full,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** near-fullscreen: for the dense screens (feuille de présence) that need
   *  every pixel on a desktop yet must still breathe on a phone */
  full?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /**
   * LE CLAVIER ENTRE DANS LA BOÎTE AVEC LES YEUX.
   *
   * Sans cela, la tabulation repart du haut de la page derrière le voile :
   * on tabule à l'aveugle dans un écran qu'on ne voit plus. Le panneau prend
   * donc le focus à l'ouverture — et le rend à l'élément qui l'avait, une
   * fois refermé.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previous?.focus?.();
    };
  }, [open]);

  /** Le fond de page ne défile plus tant que la boîte est ouverte. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center ${
              full ? "p-1 sm:p-4" : "p-4"
            }`}
          >
            <motion.div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              tabIndex={-1}
              className={`relative z-10 w-full outline-none ${
                full
                  ? "max-h-[97vh] max-w-[1600px]"
                  : wide
                    ? "max-h-[90vh] max-w-3xl"
                    : "max-h-[90vh] max-w-lg"
              } overflow-y-auto rounded-2xl border border-line bg-surface card-shadow-lg`}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              // La sortie est plus courte que l'entrée : une boîte qu'on ferme
              // doit paraître obéir tout de suite.
              exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
            >
              {title && (
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
                  <h2 id={titleId} className="font-display text-base font-bold text-ink">
                    {title}
                  </h2>
                  <button
                    onClick={onClose}
                    aria-label="Fermer"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-50 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className={full ? "p-3 sm:p-5" : "p-5"}>{children}</div>
              {footer && (
                <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
