"use client";

/**
 * PUBLIER UNE FORMATION OU UN ÉVÈNEMENT.
 *
 * Le formulaire suit l'ordre dans lequel on y pense, et non celui des colonnes :
 * ce que c'est, quand ça se tient, qui l'encadre, ce que ça coûte, et à quoi ça
 * ressemble.
 *
 * LA PIÈCE PARTICULIÈRE EST LE CALENDRIER. On donne une période — du 4 au
 * 18 mars — et l'écran DÉPLIE toutes ses journées, une case par jour, groupées
 * par mois. On coche celles où la formation se tient vraiment. C'est plus long
 * qu'une règle « tous les mardis », et c'est le but : un jour férié, une semaine
 * de vacances ou une séance de rattrapage se disent sans qu'on ait à inventer
 * une exception à une règle que personne ne saurait relire.
 *
 * Ne rien cocher est une réponse valable : cela veut dire « toute la période »,
 * ce qu'est un évènement d'un seul tenant.
 */

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Check,
  ImagePlus,
  Loader2,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useT } from "@/lib/i18n/useT";
import { uploadImage } from "@/lib/accounts/uploadImage";
import { todayIso } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import {
  daysInPeriod,
  longDate,
  longMonth,
  monthsOfPeriod,
  weekdayOfKey,
} from "@/lib/site/formations";
import type { Formation, FormationKind } from "@/lib/types";

/** L'abrégé du jour de la semaine, sous le quantième, dans le calendrier. */
const WEEKDAY_SHORT: Record<string, string> = {
  saturday: "Sam",
  sunday: "Dim",
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Jeu",
  friday: "Ven",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { tr } = useT();
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{tr(label)}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted">{tr(hint)}</p>}
    </div>
  );
}

export function FormationFormModal({
  formation,
  onClose,
}: {
  /** la formation à corriger, ou rien pour en publier une */
  formation?: Formation | null;
  onClose: () => void;
}) {
  const { tr } = useT();
  const teachers = useData((s) => s.teachers);
  const saveFormation = useData((s) => s.saveFormation);
  const { addToast } = useToast();

  const [kind, setKind] = useState<FormationKind>(formation?.kind ?? "formation");
  const [name, setName] = useState(formation?.name ?? "");
  const [description, setDescription] = useState(formation?.description ?? "");

  const [startDate, setStartDate] = useState(formation?.startDate || todayIso());
  const [startTime, setStartTime] = useState(formation?.startTime || "09:00");
  const [endDate, setEndDate] = useState(formation?.endDate || todayIso());
  const [endTime, setEndTime] = useState(formation?.endTime || "12:00");
  const [days, setDays] = useState<string[]>(formation?.days ?? []);

  const [trainerId, setTrainerId] = useState(formation?.trainerId ?? "");
  const [trainerSearch, setTrainerSearch] = useState("");
  const [trainerNote, setTrainerNote] = useState(formation?.trainerNote ?? "");

  const [price, setPrice] = useState<number>(formation?.price ?? 0);
  const [seances, setSeances] = useState<number>(formation?.seances ?? 0);

  const [images, setImages] = useState<string[]>(formation?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const months = useMemo(() => monthsOfPeriod(startDate, endDate), [startDate, endDate]);
  const allDays = useMemo(() => daysInPeriod(startDate, endDate), [startDate, endDate]);

  /**
   * UNE PÉRIODE QUI SE RESSERRE EMPORTE LES JOURS QUI N'EN SONT PLUS.
   *
   * Sans ce filtre, ramener la fin du 18 au 11 mars laisserait le 18 coché —
   * hors période, invisible dans le calendrier, et pourtant enregistré. La
   * formation afficherait alors sur le site une date que son propre calendrier
   * ne montre pas.
   *
   * Le tri se fait ICI, à la lecture, et non dans un effet qui corrigerait
   * l'état après coup : la sélection brute peut très bien garder un jour
   * momentanément hors bornes — on élargit souvent la période APRÈS avoir
   * coché — sans qu'il soit ni affiché ni enregistré tant qu'il n'y est pas
   * revenu.
   */
  const chosenDays = useMemo(() => {
    const inPeriod = new Set(allDays);
    return days.filter((d) => inPeriod.has(d));
  }, [days, allDays]);

  const q = trainerSearch.trim().toLowerCase();
  const trainerMatches = useMemo(() => {
    const list = teachers.filter((t) => !t.isPassager);
    if (!q) return list.slice(0, 8);
    return list
      .filter((t) => `${t.firstName} ${t.lastName} ${t.phone ?? ""}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [teachers, q]);

  const trainer = teachers.find((t) => t.id === trainerId);

  const toggleDay = (key: string) =>
    setDays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push(await uploadImage("logos", file));
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      addToast({
        type: "danger",
        title: "Image refusée",
        message: err instanceof Error ? err.message : "L'envoi de l'image a échoué.",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      addToast({ type: "danger", title: "Titre manquant", message: "Nommez cette formation." });
      return;
    }
    if (endDate < startDate) {
      addToast({
        type: "danger",
        title: "Période impossible",
        message: "La fin ne peut pas précéder le début.",
      });
      return;
    }
    setBusy(true);
    const result = await saveFormation({
      id: formation?.id,
      kind,
      name,
      description,
      startDate,
      startTime,
      endDate,
      endTime,
      days: chosenDays,
      trainerId: trainerId || undefined,
      trainerNote,
      price,
      seances,
      images,
    });
    setBusy(false);
    if (!result.ok) {
      addToast({
        type: "danger",
        title: "Enregistrement refusé",
        message: "Vérifiez le titre et la période.",
      });
      return;
    }
    addToast({
      type: "success",
      title: formation ? "Formation modifiée" : "Formation publiée",
      message: `${name.trim()} — ${chosenDays.length || allDays.length} journée(s)`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={formation ? "Modifier la formation" : "Publier une formation ou un évènement"}
    >
      <div className="space-y-4">
        {/* ---- CE QUE C'EST -------------------------------------------- */}
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🏷️ {tr("Ce que c'est")}
          </span>

          <div className="grid grid-cols-2 gap-2">
            {(["formation", "event"] as FormationKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-xl border p-2.5 text-start transition-colors ${
                  kind === k
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-ink hover:bg-primary-50"
                }`}
              >
                <strong className="block text-[12px]">
                  {tr(k === "formation" ? "Formation" : "Évènement")}
                </strong>
                <span className={`text-[9px] ${kind === k ? "text-white/80" : "text-muted"}`}>
                  {tr(
                    k === "formation"
                      ? "Un cycle de séances, sur plusieurs jours"
                      : "Un tournoi, une démonstration, une journée portes ouvertes",
                  )}
                </span>
              </button>
            ))}
          </div>

          <Field label="Titre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stage d'initiation au sabre"
            />
          </Field>

          <Field
            label="Description"
            hint="C'est le texte que le visiteur lit sur la carte du site, puis en tête du détail."
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={tr("À qui elle s'adresse, ce qu'on y apprend, ce qu'il faut apporter…")}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
            />
          </Field>
        </section>

        {/* ---- QUAND ELLE SE TIENT ------------------------------------- */}
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <CalendarRange className="h-3.5 w-3.5" /> {tr("Quand elle se tient")}
          </span>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Premier jour">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Heure de début">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="Dernier jour">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field label="Heure de fin">
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>

          {/* ---- LE CALENDRIER DE LA PÉRIODE, JOUR PAR JOUR ---- */}
          <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-wash/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                <CalendarDays className="h-3.5 w-3.5" /> {tr("Les journées retenues")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={chosenDays.length > 0 ? "success" : "neutral"} className="text-[9px]">
                  {chosenDays.length > 0
                    ? `${chosenDays.length} ${tr("journée(s) cochée(s)")}`
                    : `${tr("toute la période")} · ${allDays.length} ${tr("jour(s)")}`}
                </Badge>
                <button
                  type="button"
                  onClick={() => setDays(allDays)}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary-50"
                >
                  {tr("Tout cocher")}
                </button>
                <button
                  type="button"
                  onClick={() => setDays([])}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-muted transition-colors hover:bg-primary-50"
                >
                  {tr("Tout décocher")}
                </button>
              </div>
            </div>

            {allDays.length === 0 ? (
              <p className="p-2 text-[11px] italic text-muted">
                {tr("Choisissez d'abord une période — le calendrier s'ouvrira ici.")}
              </p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto pe-1">
                {months.map(({ month, days: monthDays }) => (
                  <div key={month}>
                    <p className="mb-1.5 text-[11px] font-bold capitalize text-ink">
                      {longMonth(month)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {monthDays.map((key) => {
                        const on = chosenDays.includes(key);
                        const weekday = WEEKDAY_SHORT[weekdayOfKey(key)] ?? "";
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleDay(key)}
                            title={longDate(key)}
                            className={`flex w-[52px] flex-col items-center rounded-lg border px-1 py-1 text-center transition-colors ${
                              on
                                ? "border-primary bg-primary text-white"
                                : "border-line bg-surface text-ink hover:bg-primary-50"
                            }`}
                          >
                            <span
                              className={`text-[8px] font-bold uppercase ${
                                on ? "text-white/75" : "text-muted"
                              }`}
                            >
                              {tr(weekday)}
                            </span>
                            <span className="text-[13px] font-bold tabular-nums">
                              {Number(key.slice(8, 10))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-muted">
              {tr("Ne rien cocher veut dire « toute la période » — ce qu'est un évènement d'un seul tenant. Cocher, c'est dire les journées réelles, jour férié sauté compris.")}
            </p>
          </div>
        </section>

        {/* ---- QUI L'ENCADRE ------------------------------------------- */}
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <UserRound className="h-3.5 w-3.5" /> {tr("Qui l'encadre")}
          </span>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={trainerSearch}
              onChange={(e) => setTrainerSearch(e.target.value)}
              placeholder="Chercher un entraîneur par son nom…"
              className="ps-9"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {trainerMatches.length === 0 && (
              <p className="p-1 text-[11px] italic text-muted">
                {tr("Aucun entraîneur ne correspond.")}
              </p>
            )}
            {trainerMatches.map((t) => {
              const on = trainerId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrainerId(on ? "" : t.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-surface text-ink hover:bg-primary-50"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                  {t.firstName} {t.lastName}
                </button>
              );
            })}
          </div>

          {trainer && (
            <p className="rounded-xl border border-primary/30 bg-primary-50/50 p-2 text-[11px] text-ink">
              {tr("Le site affichera")}{" "}
              <strong>
                {trainer.firstName} {trainer.lastName}
              </strong>{" "}
              {tr("comme encadrant. Son nom est recopié sur la formation : un visiteur non connecté ne lit pas les fiches des entraîneurs.")}
            </p>
          )}

          <Field
            label="Ce que le club veut dire de lui"
            hint="Titres, parcours, palmarès, années d'expérience — tout ce qui donne envie de s'inscrire et que sa fiche ne dit pas."
          >
            <textarea
              value={trainerNote}
              onChange={(e) => setTrainerNote(e.target.value)}
              rows={3}
              placeholder={tr("Ceinture noire 4e dan, quinze ans d'enseignement, ancien champion national…")}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
            />
          </Field>
        </section>

        {/* ---- CE QUE ÇA COÛTE ----------------------------------------- */}
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            💰 {tr("Ce que ça coûte")}
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Prix (DA)"
              hint="0 pour une formation offerte : rien ne sera porté au compte des inscrits."
            >
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </Field>
            <Field label="Nombre de séances">
              <Input
                type="number"
                min={0}
                value={seances}
                onChange={(e) => setSeances(Number(e.target.value))}
              />
            </Field>
          </div>
          {price > 0 && seances > 0 && (
            <p className="text-[10px] text-muted">
              {tr("Soit")} <strong className="text-ink">{formatDA(price / seances)}</strong>{" "}
              {tr("la séance.")}
            </p>
          )}
        </section>

        {/* ---- À QUOI ÇA RESSEMBLE ------------------------------------- */}
        <section className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <ImagePlus className="h-3.5 w-3.5" /> {tr("Les images")}
          </span>

          <div className="flex flex-wrap gap-2">
            {images.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-20 w-28 rounded-xl border border-line object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                  aria-label={tr("Retirer cette image")}
                  className="absolute -end-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <label className="flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface text-[10px] font-semibold text-muted transition-colors hover:border-accent/60 hover:text-ink">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {tr(uploading ? "Envoi…" : "Ajouter")}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void addImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            {tr("La première image illustre la carte du site ; les suivantes s'affichent dans le détail. 5 Mo par image au maximum.")}
          </p>
        </section>

        {/* ---- LE GESTE FINAL ------------------------------------------ */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button className="gap-1.5" disabled={busy || uploading} onClick={() => void submit()}>
            <Check className="h-4 w-4" />
            {busy ? tr("Enregistrement…") : tr(formation ? "Enregistrer" : "Publier sur le site")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * « SUPPRIMER, MAIS VRAIMENT ? »
 *
 * La confirmation dit ce qui part ET ce qui reste : une annonce retirée
 * n'efface pas l'argent qu'elle a facturé. C'est la seule chose qu'on puisse
 * regretter ici, donc c'est ce qu'il faut lire avant de cliquer.
 */
export function FormationDeleteModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const { tr } = useT();
  const deleteFormation = useData((s) => s.deleteFormation);
  const formationEnrollments = useData((s) => s.formationEnrollments);
  const { addToast } = useToast();
  const enrolled = formationEnrollments.filter((e) => e.formationId === formation.id).length;

  return (
    <Modal open onClose={onClose} title="Supprimer la formation">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-ink">
            <strong>{formation.name}</strong>{" "}
            {tr("sera retirée du site et de la gestion, avec la liste de ses inscrits.")}
            {enrolled > 0 && (
              <>
                {" "}
                <strong className="text-danger">
                  {enrolled} {tr("inscrit(s)")}
                </strong>{" "}
                {tr("perdront leur inscription — mais les frais déjà portés à leur compte, eux, RESTENT : ils ont été facturés, et parfois payés.")}
              </>
            )}
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          {tr("Pour la retirer du site sans rien perdre, préférez « Masquer ».")}
        </p>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            className="gap-1.5"
            onClick={() => {
              void deleteFormation(formation.id);
              addToast({
                type: "success",
                title: "Formation supprimée",
                message: formation.name,
              });
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Supprimer définitivement
          </Button>
        </div>
      </div>
    </Modal>
  );
}
