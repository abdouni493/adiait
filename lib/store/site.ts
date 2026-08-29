"use client";

/**
 * CE QUE LE SITE PUBLIC A EN MÉMOIRE.
 *
 * Le site n'est PAS l'application : il n'a pas de session, pas de barre
 * latérale, pas de magasin de quarante collections. Il lui faut deux choses, et
 * pas une de plus — la fiche du club (nom, logo, vitrine, coordonnées) et les
 * formations publiées — lues une fois pour toutes au premier affichage.
 *
 * POURQUOI UN MAGASIN À PART, ET PAS `useData`. Parce que `useData` est rempli
 * par `SessionProvider`, qui exige une session : le brancher ici rendrait la
 * page d'accueil dépendante d'une connexion qu'un visiteur n'a pas, et ferait
 * partir vers Supabase des dizaines de requêtes auxquelles la RLS ne répondrait
 * rien. Le site lit ses deux tables ouvertes, et s'arrête là.
 *
 * `load()` est IDEMPOTENTE : chaque page du site l'appelle en s'affichant, et
 * seule la première fait un aller-retour. Passer par les pages ne recharge donc
 * jamais rien.
 */

import { create } from "zustand";
import { emptySchool } from "@/lib/supabase/db";
import { loadSiteFormation, loadSiteFormations, loadSiteSchool } from "@/lib/site/public";
import type { Formation, School } from "@/lib/types";

interface SiteState {
  school: School;
  formations: Formation[];
  /** la première lecture est-elle finie ? (elle l'est même quand elle échoue) */
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  /**
   * UNE formation, quand on arrive dessus par un lien partagé.
   *
   * La liste ne l'a peut-être pas : on peut atterrir directement sur son
   * adresse, sans être passé par la page d'accueil. On la lit alors seule, et
   * on la range avec les autres.
   */
  fetchFormation: (id: string) => Promise<Formation | null>;
}

export const useSite = create<SiteState>((set, get) => ({
  school: emptySchool(),
  formations: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    const [school, formations] = await Promise.all([loadSiteSchool(), loadSiteFormations()]);
    set({ school, formations, loaded: true, loading: false });
  },

  fetchFormation: async (id) => {
    const known = get().formations.find((f) => f.id === id);
    if (known) return known;

    const formation = await loadSiteFormation(id);
    if (formation) {
      set((state) =>
        state.formations.some((f) => f.id === formation.id)
          ? state
          : { formations: [...state.formations, formation] },
      );
    }
    return formation;
  },
}));
