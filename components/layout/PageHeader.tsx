import * as React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * L'EN-TÊTE D'ÉCRAN.
 *
 * L'emblème est une icône vectorielle, pas un émoji : il prend la couleur du
 * thème, garde son trait à toutes les tailles et se dessine pareil sur tous
 * les systèmes. Il est posé dans un cartouche d'acier bordé d'or — le même
 * motif que le blason de la barre latérale, à une échelle près.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        {Icon && (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 ring-1 ring-accent/25"
            aria-hidden="true"
          >
            <Icon className="h-5 w-5 text-accent-ink" strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl font-bold text-ink md:text-2xl">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
