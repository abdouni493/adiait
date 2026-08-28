"use client";

import { motion } from "framer-motion";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { navMetaForHref } from "@/lib/nav";
import { navIcon } from "@/lib/icons";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function ModulePlaceholder({ href }: { href: string }) {
  const { t } = useTranslation();
  const meta = navMetaForHref(href);
  const key = meta?.key ?? href.replace(/^\//, "");
  const title = meta ? t(`nav.${meta.key}`) : key;
  const Icon = navIcon(key);

  return (
    <div>
      <PageHeader icon={Icon} title={title} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card gradient>
          <CardBody className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-accent/25">
              <Icon className="h-7 w-7 text-accent-ink" strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            <p className="max-w-md text-sm text-muted">{t("common.moduleInProgress")}</p>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
