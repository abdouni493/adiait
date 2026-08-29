"use client";

/**
 * CE QUI ATTEND QUELQU'UN, ÉCRAN PAR ÉCRAN.
 *
 * Une famille crée son compte à 22 h ; quelqu'un s'inscrit à une formation
 * depuis le site un dimanche. Ces demandes dorment dans une table que personne
 * n'ouvre tant qu'on ne lui a pas dit qu'il y avait quelque chose dedans.
 *
 * Les cloches existaient déjà — sur le tableau de bord — mais elles ne sonnent
 * que pour qui EST DÉJÀ sur le tableau de bord. La barre latérale, elle, est
 * sous les yeux en permanence : c'est là qu'un chiffre doit apparaître, et
 * c'est ce que ce crochet fournit.
 *
 * IL NE COMPTE QUE CE QU'ON PEUT TRAITER. Un travailleur à qui l'écran des
 * inscriptions du site n'a pas été ouvert n'a pas à voir un chiffre rouge
 * réclamer un geste qu'il ne peut pas poser ; et un versement saisi par un
 * travailleur ne remonte qu'à l'administration, qui seule a à le relire.
 *
 * Une clé absente du dictionnaire = aucun chiffre, ce qui est le cas de la
 * quasi-totalité des écrans.
 */

import { useMemo } from "react";
import { useData } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";
import { useAccessRights } from "@/lib/usePermissions";
import { canSeePage } from "@/lib/permissions";

export function useNavAlerts(): Record<string, number> {
  const role = useSession((s) => s.user?.role);
  const rights = useAccessRights();
  const requests = useData((s) => s.accountRequests);
  const payments = useData((s) => s.payments);

  return useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending");
    // Une demande sans origine est antérieure à la vitrine : elle vient donc de
    // la page de connexion, et se compte avec les autres du tableau de bord.
    const fromLogin = pending.filter((r) => (r.source ?? "login") !== "website").length;
    const fromSite = pending.filter((r) => r.source === "website").length;

    // Les encaissements qu'un travailleur a saisis et que la direction n'a pas
    // encore relus. Eux non plus ne concernent qu'elle.
    const unreadPayments =
      role === "admin"
        ? payments.filter((p) => p.createdByRole === "reception" && !p.alertRead).length
        : 0;

    const counts: Record<string, number> = {
      dashboard: fromLogin + unreadPayments,
      "website-inscriptions": fromSite,
    };

    // On n'annonce pas un travail qu'on ne peut pas faire.
    for (const key of Object.keys(counts)) {
      if (counts[key] <= 0 || !canSeePage(rights, key)) delete counts[key];
    }
    return counts;
  }, [requests, payments, role, rights]);
}
