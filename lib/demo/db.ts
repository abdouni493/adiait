"use client";

/**
 * LA « BASE DE DONNÉES » DE LA DÉMONSTRATION.
 *
 * Elle garde les fonctions, les signatures et le contrat que le magasin
 * attendait de la couche de lecture qu'elle remplace — mais rien ne part sur le
 * réseau.
 *
 * OÙ VIVENT LES DONNÉES
 *
 *  1. le jeu de démonstration (`buildDemoSeed`), fabriqué à chaque démarrage ;
 *  2. un INSTANTANÉ dans le navigateur, écrit après chaque modification.
 *
 * L'instantané est ce qui fait que la démonstration se comporte comme une vraie
 * application : un élève créé, un paiement encaissé ou une présence pointée sont
 * toujours là après un rechargement de page. Il est propre à ce navigateur et à
 * cette machine — personne d'autre ne le voit — et « Réinitialiser la
 * démonstration » l'efface pour repartir du jeu d'origine.
 */

import type { Database } from "@/lib/store/data";
import type { School } from "@/lib/types";
import { COLLECTION_ORDER } from "./collections";
import { buildDemoDatabase } from "./seed";

/** Là où l'instantané est rangé dans le navigateur. Le suffixe de version évite
 *  qu'un instantané écrit par une version antérieure du modèle soit relu. */
const SNAPSHOT_KEY = "altech-demo-db-v1";

/** L'établissement vide — ce que la page de connexion affiche avant tout. */
export function emptySchool(): School {
  return {
    id: "school",
    name: "École",
    description: "",
    phone: "",
    email: "",
    address: "",
  };
}

/** Une base sans la moindre ligne. */
export function emptyDatabase(): Database {
  const db = { school: emptySchool() } as Database;
  for (const key of COLLECTION_ORDER) {
    (db as unknown as Record<string, unknown>)[key] = [];
  }
  return db;
}

/**
 * L'instantané du navigateur, quand il y en a un et qu'il est lisible.
 *
 * Un instantané corrompu (édité à la main, tronqué par un onglet fermé au
 * mauvais moment) ne doit pas bloquer la démonstration : il est ignoré, et le
 * jeu d'origine reprend la main.
 */
export function readSnapshot(): Database | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Database>;
    if (!parsed || typeof parsed !== "object" || !parsed.school) return null;

    // Une collection absente de l'instantané (ajoutée par une mise à jour du
    // modèle) revient vide plutôt que `undefined` : aucun écran ne lit alors
    // une liste qui n'existe pas.
    const db = { school: { ...emptySchool(), ...parsed.school } } as Database;
    for (const key of COLLECTION_ORDER) {
      const list = (parsed as unknown as Record<string, unknown>)[key];
      (db as unknown as Record<string, unknown>)[key] = Array.isArray(list) ? list : [];
    }
    return db;
  } catch {
    return null;
  }
}

/** Combien de fois l'écriture a échoué — pour n'avertir qu'une seule fois. */
let quotaWarned = false;

/**
 * Range l'instantané. Un navigateur qui refuse d'écrire (navigation privée,
 * quota atteint, stockage désactivé) ne doit RIEN casser : la démonstration
 * continue en mémoire, et le message n'est dit qu'une fois.
 */
export function writeSnapshot(db: Database): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(db));
  } catch {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn(
        "[demo] Impossible d'enregistrer l'instantané dans ce navigateur — " +
          "la démonstration continue en mémoire, mais les modifications seront " +
          "perdues au rechargement.",
      );
    }
  }
}

/** Efface l'instantané : le prochain chargement repart du jeu d'origine. */
export function clearSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* rien à faire : il n'y avait rien à effacer */
  }
}

/** Le jeu de démonstration d'origine, tel qu'il sort de `seed.ts`. */
export function buildDemoSeed(): Database {
  return buildDemoDatabase();
}

/**
 * L'établissement seul. La page de connexion l'affiche (nom, logo) avant que
 * quiconque soit connecté, exactement comme lorsqu'il venait de la base.
 */
export async function loadSchool(): Promise<School> {
  const snapshot = readSnapshot();
  if (snapshot) return snapshot.school;
  return buildDemoSeed().school;
}

/**
 * Toute la base, en un seul appel. `async` par fidélité au contrat que le
 * magasin attend — la démonstration, elle, répond immédiatement.
 */
export async function loadDatabase(): Promise<Database> {
  return readSnapshot() ?? buildDemoSeed();
}

/** Repart de zéro : l'instantané est jeté et le jeu d'origine reconstruit. */
export function resetDemoDatabase(): Database {
  clearSnapshot();
  return buildDemoSeed();
}
