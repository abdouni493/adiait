"use client";

/**
 * LES DEUX NOUVELLES QU'UNE SAISON PEUT ANNONCER.
 *
 *  1. ELLE A DÉBORDÉ. Une séance annulée pour tout un groupe s'est rejouée la
 *     semaine d'après, la carte a fini après la date annoncée, et la date de
 *     fin a été repoussée d'elle-même. Ce n'est pas une erreur — mais personne
 *     ne doit l'apprendre trois semaines plus tard en lisant un rapport.
 *
 *  2. ELLE EST TERMINÉE. Toutes les cartes de tous ses emplois du temps ont
 *     donné leurs séances, et LE POINTAGE EST FERMÉ : plus aucune présence ne
 *     s'écrit tant que le semestre suivant n'a pas été créé. La bannière le dit
 *     là où le geste se fait — au tableau de bord et sur l'écran Présences — et
 *     non seulement sur l'écran des semestres, que personne n'ouvre le matin.
 *
 * Le composant ne décide de rien : il lit `lib/semesters.ts`, qui lit le
 * magasin.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarRange, Clock, Lock } from "lucide-react";
import { useData } from "@/lib/store/data";
import { formatDateFr, todayIso } from "@/lib/helpers";
import { presenceLock, semesterProgress, semestersOf } from "@/lib/semesters";

/** Ce que les écrans de pointage ont besoin de savoir sur la saison. */
export function useSemesterAlerts(day = todayIso()) {
  const db = useData();
  const syncCartes = db.syncCartes;

  /**
   * LE MOTEUR DES CARTES TOURNE À L'OUVERTURE DE L'ÉCRAN.
   *
   * Une carte prend sa date au pointage, mais un poste qui ouvre le tableau de
   * bord le matin doit voir l'état du jour même si les présences de la veille
   * ont été saisies ailleurs. Le moteur est idempotent : sans rien à faire, il
   * n'écrit rien.
   */
  useEffect(() => {
    void syncCartes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(() => {
    const lock = presenceLock(db, day);
    /** Les semestres dont la date de fin a été repoussée sans être encore vue. */
    const extended = semestersOf(db).filter(
      (s) => !!s.plannedEndDate && s.plannedEndDate !== s.endDate && !s.closedAt,
    );
    /** Ceux qui ont dépassé leur date de fin mais gardent une carte en cours. */
    const overdue = semestersOf(db).filter(
      (s) => !s.closedAt && semesterProgress(db, s, day).state === "overdue",
    );
    return { lock, extended, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.semesters, db.emploiCartes, db.sessions, db.attendance, day]);
}

/**
 * LA BANNIÈRE — posée en haut des écrans où l'on pointe.
 *
 * Elle ne s'affiche que lorsqu'elle a quelque chose à dire : une saison qui a
 * débordé, ou une saison fermée qui bloque le pointage.
 */
export function SemesterAlerts({ day = todayIso() }: { day?: string }) {
  const { lock, extended, overdue } = useSemesterAlerts(day);

  if (!lock.locked && extended.length === 0 && overdue.length === 0) return null;

  return (
    <div className="space-y-2">
      {lock.locked && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border-2 border-danger/50 bg-danger/10 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <strong className="block text-sm font-bold text-danger">
              Le pointage est fermé
            </strong>
            <p className="mt-0.5 text-xs leading-relaxed text-danger/90">
              {lock.reason}{" "}
              {lock.semester?.closedAt && (
                <>
                  Toutes les cartes de « {lock.semester.name} » ont donné leurs séances, la saison
                  s&apos;est close le {formatDateFr(lock.semester.closedAt)}.
                </>
              )}
            </p>
            <p className="mt-1 text-[11px] text-danger/80">
              Aucune présence ne peut être saisie — ni ici, ni au badge — tant que le semestre
              suivant n&apos;existe pas. Corriger un pointage déjà écrit reste possible.
            </p>
          </div>
          <Link
            href="/semesters"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-danger/85"
          >
            <CalendarRange className="h-4 w-4" /> Créer le semestre suivant
          </Link>
        </div>
      )}

      {extended.map((s) => (
        <div
          key={`ext-${s.id}`}
          className="flex flex-wrap items-start gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-3.5"
        >
          <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <strong className="block text-xs font-bold text-warning">
              Semestre prolongé — « {s.name} »
            </strong>
            <p className="mt-0.5 text-[11px] leading-relaxed text-warning/90">
              La fin était annoncée au{" "}
              <strong>{formatDateFr(s.plannedEndDate)}</strong>, elle est portée au{" "}
              <strong>{formatDateFr(s.endDate)}</strong> : une carte décalée — une séance annulée
              pour tout un groupe, rejouée la semaine d&apos;après — devait encore donner sa
              dernière séance.
            </p>
          </div>
        </div>
      ))}

      {overdue
        .filter((s) => !extended.some((e) => e.id === s.id))
        .map((s) => (
          <div
            key={`late-${s.id}`}
            className="flex flex-wrap items-start gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-3.5"
          >
            <Clock className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <strong className="block text-xs font-bold text-warning">
                « {s.name} » a dépassé sa date de fin
              </strong>
              <p className="mt-0.5 text-[11px] leading-relaxed text-warning/90">
                Le semestre ne se ferme pas tant que chaque emploi du temps n&apos;a pas terminé sa
                carte en cours. Les cartes restantes vont jusqu&apos;au bout ; aucune nouvelle ne
                s&apos;ouvrira.
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}
