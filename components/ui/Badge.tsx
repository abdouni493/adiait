import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "primary" | "accent" | "neutral";

const tones: Record<Tone, string> = {
  success: "bg-success/15 text-success ring-1 ring-success/25",
  warning: "bg-warning/15 text-warning ring-1 ring-warning/25",
  danger: "bg-danger/15 text-danger ring-1 ring-danger/25",
  primary: "bg-primary/12 text-primary ring-1 ring-primary/25",
  accent: "bg-accent/15 text-accent-ink ring-1 ring-accent/35",
  neutral: "bg-muted/12 text-muted ring-1 ring-muted/20",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
