"use client";

import { motion } from "framer-motion";
import { useT } from "@/lib/i18n/useT";
import type { LucideIcon } from "lucide-react";

const GRADIENTS = {
  primary: "bg-gradient-primary",
  accent: "bg-gradient-accent",
  success: "bg-gradient-success",
  warning: "bg-gradient-warning",
  danger: "bg-gradient-danger",
} as const;

/** Le ton `accent` est de l'or : son texte doit être SOMBRE, sinon le
 *  chiffre se noie. C'est le seul ton dont l'encre change. */
const INK = {
  primary: "text-white",
  accent: "text-[#241a05]",
  success: "text-white",
  warning: "text-white",
  danger: "text-white",
} as const;

const SUB_INK = {
  primary: "text-white/85",
  accent: "text-[#241a05]/75",
  success: "text-white/85",
  warning: "text-white/85",
  danger: "text-white/85",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
  index = 0,
}: {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  tone?: keyof typeof GRADIENTS;
  index?: number;
}) {
  // Le libellé est écrit en français dans les écrans : il passe ici par le
  // dictionnaire, une fois, et toutes les cartes de chiffres suivent.
  const { tr } = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.32 }}
      className={`${GRADIENTS[tone]} ${INK[tone]} relative overflow-hidden rounded-2xl p-5 card-shadow card-interactive`}
    >
      {Icon && (
        <Icon
          className="pointer-events-none absolute -end-4 -top-4 h-24 w-24 opacity-[0.14]"
          strokeWidth={1.2}
          aria-hidden="true"
        />
      )}
      <p className={`text-sm font-medium ${SUB_INK[tone]}`}>{tr(label)}</p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums md:text-3xl">{value}</p>
    </motion.div>
  );
}
