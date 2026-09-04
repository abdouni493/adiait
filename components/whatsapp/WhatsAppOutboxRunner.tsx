"use client";

/**
 * =============================================================================
 *  LE RATTRAPAGE DE LA FILE — déclenché par le NAVIGATEUR
 * =============================================================================
 *
 *  En serverless, rien ne tourne entre deux requêtes : aucune tâche de fond ne
 *  peut reprendre les messages en attente. C'est donc l'application OUVERTE
 *  DANS LE NAVIGATEUR qui s'en charge.
 *
 *  Ce n'est pas un pis-aller : le poste de l'écurie a l'application ouverte
 *  toute la journée, et c'est LE MÊME POSTE qui héberge la passerelle. Quand il
 *  est allumé — le seul moment où un envoi peut aboutir — le rattrapage part.
 *
 *  CINQ RÈGLES L'EMPÊCHENT DE DEVENIR NUISIBLE :
 *
 *   1. il COMPTE des lignes (route dédiée, aucun appel à la passerelle) au lieu
 *      de vider à l'aveugle, et il compte toutes les 90 secondes ;
 *   2. il ne vide QUE s'il reste quelque chose ;
 *   3. un verrou empêche deux vidages de se chevaucher ;
 *   4. il s'arrête DÉFINITIVEMENT sur 401/403 et sur « route non déployée » —
 *      insister ne réparerait rien et remplirait les journaux ;
 *   5. son premier passage est différé de 8 secondes, parce que le composant est
 *      remonté à chaque navigation.
 *
 *  IL N'AFFICHE RIEN TANT QUE LA FILE EST VIDE : un encart permanent finit par
 *  ne plus être lu, et celui-ci doit se remarquer le jour où il apparaît.
 */

import { useEffect, useRef, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { ApiError, fetchOutbox, flushOutbox } from "@/lib/whatsapp/client";

/** L'intervalle du COMPTAGE — pas celui du vidage. */
const COUNT_EVERY_MS = 90_000;
/** Le premier passage attend : le composant est remonté à chaque navigation. */
const FIRST_RUN_DELAY_MS = 8000;

export function WhatsAppOutboxRunner() {
  const [pending, setPending] = useState(0);
  const [flushing, setFlushing] = useState(false);
  /** Le verrou : deux vidages concurrents se marcheraient dessus. */
  const busy = useRef(false);
  /** L'arrêt définitif : 401/403, ou routes non déployées. */
  const stopped = useRef(false);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (!alive || stopped.current || busy.current) return;
      try {
        const counts = await fetchOutbox();
        if (!alive) return;
        setPending(counts.pending);
        // Règle 2 : on ne vide que s'il reste quelque chose.
        if (counts.pending === 0 || !counts.persistence) return;

        busy.current = true;
        setFlushing(true);
        const res = await flushOutbox();
        if (!alive) return;
        setPending(res.remaining);
      } catch (err) {
        if (err instanceof ApiError && (err.notDeployed || err.status === 401 || err.status === 403)) {
          // Règle 4 : insister ne réparerait rien.
          stopped.current = true;
          setPending(0);
        }
      } finally {
        busy.current = false;
        if (alive) setFlushing(false);
      }
    };

    const first = setTimeout(() => void tick(), FIRST_RUN_DELAY_MS);
    const interval = setInterval(() => void tick(), COUNT_EVERY_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  if (pending === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 end-4 z-40 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-[11px] font-semibold text-ink backdrop-blur">
      {flushing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
      ) : (
        <Inbox className="h-3.5 w-3.5 text-warning" />
      )}
      {pending} message(s) WhatsApp en attente
      {flushing ? " — envoi en cours…" : " — reprise automatique"}
    </div>
  );
}
