"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
}) {
  const { tr } = useT();
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1"
      >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={cn(
                "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer",
                selected ? "text-white" : "text-muted hover:text-ink",
              )}
            >
              {/* Le fond de l'onglet actif GLISSE d'un onglet à l'autre :
                  le mouvement dit lequel on vient de quitter. */}
              {selected && (
                <motion.span
                  layoutId="tabs-indicator"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-primary"
                  transition={{ type: "spring", stiffness: 440, damping: 36 }}
                />
              )}
              {tr(tab.label)}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
