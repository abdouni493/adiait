"use client";

/**
 * S'INSCRIRE À UNE FORMATION, DEPUIS LE SITE.
 *
 * LE FORMULAIRE EST CELUI DE LA PAGE DE CONNEXION — le vrai, pas une copie.
 * `SignupFlow` est rendu tel quel, avec en plus la formation visée : mêmes
 * champs, mêmes questions, mêmes messages d'erreur, mêmes règles. C'est
 * délibéré, et pas de la paresse : deux formulaires écrits séparément finissent
 * toujours par diverger, et l'intendance recevrait alors deux dossiers de
 * nature différente pour un seul et même geste.
 *
 * On demande donc d'abord QUI s'inscrit — un chevalier pour lui-même, un parent
 * pour ses fils — puis exactement ce que le comptoir demanderait. Le compte est
 * créé tout de suite ; la PLACE, elle, attend que le club vérifie. Et rien
 * n'est encaissé en ligne : la famille règle sur place.
 */

import { Modal } from "@/components/ui/Modal";
import { SignupFlow } from "@/components/auth/SignupFlow";
import { useT } from "@/lib/i18n/useT";
import { formatDA } from "@/lib/utils";
import { periodLabel } from "@/lib/site/formations";
import type { Formation } from "@/lib/types";

export function SubscribeModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const { tr, language } = useT();

  return (
    <Modal open onClose={onClose} wide title="S'inscrire">
      <div className="space-y-4">
        <div className="rounded-2xl border border-accent/40 bg-accent-wash/60 p-3">
          <p className="font-display text-sm font-bold text-ink">{formation.name}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            {periodLabel(formation, language)}
            {" · "}
            {formation.price > 0 ? formatDA(formation.price, language) : tr("Gratuit")}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink">
            {tr("Aucun paiement en ligne : votre demande part au club, qui la vérifie et vous rappelle. Vous réglerez sur place.")}
          </p>
        </div>

        <SignupFlow
          source="website"
          formationId={formation.id}
          formationName={formation.name}
          cancelLabel="Fermer"
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
