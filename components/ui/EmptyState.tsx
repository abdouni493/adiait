import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

/** L'écran vide : un emblème estompé, une phrase, et — quand il y a quelque
 *  chose à faire — l'action qui remplira la liste. */
export function EmptyState({
  icon: Icon = Inbox,
  message,
  hint,
  action,
}: {
  icon?: LucideIcon;
  message: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-14 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-accent/20"
        aria-hidden="true"
      >
        <Icon className="h-6 w-6 text-accent-ink opacity-80" strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{message}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
