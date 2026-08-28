"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useSettings, type Theme } from "@/lib/store/settings";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: "light", icon: Sun, labelKey: "common.lightTheme" },
  { value: "dark", icon: Moon, labelKey: "common.darkTheme" },
];

/** Jour ou nuit. Le jeton actif GLISSE sous l'icône choisie plutôt que de
 *  clignoter d'un bord à l'autre — c'est le mouvement qui dit ce qui a
 *  changé, et il ne coûte qu'un `transform`. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-full border border-line bg-surface/70 p-1 backdrop-blur",
        className,
      )}
      role="radiogroup"
      aria-label={t("common.theme")}
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={t(opt.labelKey)}
            title={t(opt.labelKey)}
            onClick={() => setTheme(opt.value)}
            className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200"
          >
            {active && (
              <motion.span
                layoutId="theme-knob"
                className="absolute inset-0 rounded-full bg-gradient-accent"
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
              />
            )}
            <Icon
              className={cn(
                "relative h-3.5 w-3.5 transition-colors duration-200",
                active ? "text-[#241a05]" : "text-muted",
              )}
              strokeWidth={2.1}
            />
          </button>
        );
      })}
    </div>
  );
}
