"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/store/session";
import { setCurrentActor, useData } from "@/lib/store/data";
import {
  onPersistError,
  pauseSync,
  resumeSync,
  setBaseline,
  startSync,
  stopSync,
} from "@/lib/supabase/persist";
import { useToast } from "@/lib/store/toast";

/**
 * Le démarrage de l'application : la session Supabase est restaurée,
 * l'établissement est lu (la page de connexion affiche son nom et son logo
 * avant que quiconque soit connecté), et — une fois quelqu'un connecté — la
 * base entière est chargée puis tenue à jour à chaque modification.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const initSession = useSession((s) => s.initSession);
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const fetchSchool = useData((s) => s.fetchSchool);
  const fetchAll = useData((s) => s.fetchAll);
  const clear = useData((s) => s.clear);
  const processWeeklyAbsences = useData((s) => s.processWeeklyAbsences);
  const addToast = useToast((s) => s.addToast);

  useEffect(() => {
    fetchSchool();
    initSession();
  }, [initSession, fetchSchool]);

  /**
   * UN ENREGISTREMENT REFUSÉ NE DOIT PAS PASSER INAPERÇU.
   *
   * L'écran affiche ce que le magasin contient, et le magasin est modifié
   * AVANT que la base réponde : sans ce message, une écriture refusée — droits
   * insuffisants, réseau coupé — laisserait quelqu'un travailler sur un écran
   * qui ment.
   */
  useEffect(() => {
    onPersistError((message) =>
      addToast({
        type: "danger",
        title: "Enregistrement refusé",
        message,
      }),
    );
    return () => onPersistError(null);
  }, [addToast]);

  /**
   * QUI SIGNE LES OPÉRATIONS.
   *
   * Le magasin pose son nom sur chaque ligne créée, mais ses actions sont des
   * fonctions ordinaires : elles ne peuvent pas lire un hook. Le compte connecté
   * leur est donc DÉPOSÉ ici, dès qu'il est connu, et retiré à la déconnexion.
   *
   * La signature porte l'identifiant de la FICHE (`entityId`), pas celui du
   * compte : c'est la fiche que l'historique doit désigner. Les deux ne
   * diffèrent que pour un travailleur à qui l'accès a été ouvert APRÈS sa
   * création — son compte est né plus tard, sa fiche existait déjà, et c'est
   * sous elle que vivent ses pointages, ses acomptes et ses règlements.
   */
  useEffect(() => {
    setCurrentActor(
      user ? { id: user.entityId ?? user.id, name: user.name, role: user.role } : null,
    );
  }, [user]);

  useEffect(() => {
    if (!hydrated) return;

    if (!user) {
      // Déconnecté : on cesse d'enregistrer et on jette les données du compte
      // précédent, pour que le suivant ne les voie jamais.
      stopSync();
      clear();
      fetchSchool();
      return;
    }

    let cancelled = false;
    // On s'abonne d'abord mais on retient les écritures : les lignes qu'on
    // s'apprête à LIRE ne doivent pas repartir aussitôt vers la base.
    startSync();
    pauseSync();

    void fetchAll().then(() => {
      if (cancelled) return;
      // Ce qui vient d'être lu EST ce qui est en base : c'est le point de
      // départ à partir duquel la réplication mesurera les écarts.
      setBaseline(useData.getState());
      resumeSync();
      // Le chargement du personnel est le déclencheur de secours de la
      // facturation automatique des absences (idempotente, une fois par jour).
      if (user.role === "admin" || user.role === "reception") {
        processWeeklyAbsences();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id]);

  return <>{children}</>;
}
