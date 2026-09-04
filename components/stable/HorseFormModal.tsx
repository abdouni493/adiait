"use client";

/**
 * =============================================================================
 *  LA FICHE D'UN CHEVAL — créer, modifier
 * =============================================================================
 *
 *  UN SEUL FORMULAIRE POUR LES DEUX ÉCRANS. « Achat & vente » et « L'écurie »
 *  décrivent le même animal ; seuls les prix changent :
 *
 *   • mode `purchase` — le cheval ENTRE au club contre de l'argent : prix
 *     d'achat et prix de vente sont exigés, et l'achat sort de la caisse ;
 *   • mode `stable`   — le cheval est déjà là (né sur place, mis en pension) :
 *     pas de prix d'achat. S'il est au club, on lui donne un prix de vente ;
 *     s'il appartient à quelqu'un, on rattache ce quelqu'un et il n'y a AUCUN
 *     prix — on ne vend pas le cheval d'autrui.
 *
 *  TOUT LE RESTE EST FACULTATIF, ET C'EST DÉLIBÉRÉ. Une écurie ne connaît pas
 *  la robe, la taille, le pedigree et l'historique vétérinaire de chaque cheval
 *  le jour où il arrive. Exiger vingt champs ferait saisir vingt
 *  approximations — et une approximation dans un carnet de vaccination est pire
 *  qu'une case vide.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { PersonPicker, type PersonValue } from "./PersonPicker";
import { todayIso } from "@/lib/helpers";
import type { Horse, HorseGender, HorseOwnerKind } from "@/lib/types";

type Mode = "purchase" | "stable";

const SECTIONS = [
  { id: "basic", label: "Identité" },
  { id: "health", label: "Santé" },
  { id: "sport", label: "Travail" },
  { id: "pedigree", label: "Origines" },
  { id: "money", label: "Prix & propriétaire" },
] as const;

export function HorseFormModal({
  mode,
  horse,
  onClose,
}: {
  mode: Mode;
  horse?: Horse | null;
  onClose: () => void;
}) {
  const saveHorse = useData((s) => s.saveHorse);
  const { addToast } = useToast();

  const [tab, setTab] = useState<(typeof SECTIONS)[number]["id"]>("basic");
  const [form, setForm] = useState(() => ({
    name: horse?.name ?? "",
    reference: horse?.reference ?? "",
    breed: horse?.breed ?? "",
    gender: (horse?.gender ?? "") as HorseGender | "",
    birthDate: horse?.birthDate ?? "",
    age: horse?.age ?? "",
    color: horse?.color ?? "",
    height: horse?.height ?? "",
    weight: horse?.weight ?? "",
    vaccination: horse?.vaccination ?? "",
    medicalHistory: horse?.medicalHistory ?? "",
    vetExam: horse?.vetExam ?? "",
    discipline: horse?.discipline ?? "",
    trainingLevel: horse?.trainingLevel ?? "",
    competitionHistory: horse?.competitionHistory ?? "",
    awards: horse?.awards ?? "",
    sire: horse?.sire ?? "",
    dam: horse?.dam ?? "",
    pedigreeDocs: horse?.pedigreeDocs ?? "",
    purchasePrice: horse?.purchasePrice != null ? String(horse.purchasePrice) : "",
    sellerName: horse?.sellerName ?? "",
    sellerPhone: horse?.sellerPhone ?? "",
    sellerNote: horse?.sellerNote ?? "",
    purchaseDate: horse?.purchaseDate ?? todayIso(),
    sellingPrice: horse?.sellingPrice != null ? String(horse.sellingPrice) : "",
  }));

  /** Le cheval appartient-il au club ? En mode achat, toujours. */
  const [clubOwned, setClubOwned] = useState(
    mode === "purchase" ? true : (horse?.ownerKind ?? "club") === "club",
  );
  const [owner, setOwner] = useState<PersonValue>(() => ({
    kind:
      horse?.ownerKind === "student"
        ? "student"
        : horse?.ownerKind === "parent"
          ? "parent"
          : "external",
    studentId: horse?.ownerStudentId,
    parentId: horse?.ownerParentId,
    name: horse?.ownerName ?? "",
    phone: horse?.ownerPhone ?? "",
    note: horse?.ownerNote ?? "",
  }));

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const num = (v: string) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const problem = !form.name.trim()
    ? "Donnez un nom au cheval."
    : mode === "purchase" && num(form.purchasePrice) <= 0
      ? "Le prix d'achat est obligatoire."
      : mode === "purchase" && num(form.sellingPrice) <= 0
        ? "Le prix de vente est obligatoire."
        : !clubOwned && owner.kind === "external" && !owner.name.trim()
          ? "Nommez le propriétaire du cheval."
          : !clubOwned && owner.kind !== "external" && !owner.studentId && !owner.parentId
            ? "Choisissez la fiche du propriétaire, ou décrivez-le à la main."
            : "";

  const submit = async () => {
    if (problem) return;

    const ownerKind: HorseOwnerKind = clubOwned
      ? "club"
      : owner.kind === "student"
        ? "student"
        : owner.kind === "parent"
          ? "parent"
          : "external";

    const res = await saveHorse({
      id: horse?.id,
      name: form.name.trim(),
      reference: form.reference.trim() || undefined,
      breed: form.breed.trim() || undefined,
      gender: form.gender || undefined,
      birthDate: form.birthDate || undefined,
      age: form.age.trim() || undefined,
      color: form.color.trim() || undefined,
      height: form.height.trim() || undefined,
      weight: form.weight.trim() || undefined,
      vaccination: form.vaccination.trim() || undefined,
      medicalHistory: form.medicalHistory.trim() || undefined,
      vetExam: form.vetExam.trim() || undefined,
      discipline: form.discipline.trim() || undefined,
      trainingLevel: form.trainingLevel.trim() || undefined,
      competitionHistory: form.competitionHistory.trim() || undefined,
      awards: form.awards.trim() || undefined,
      sire: form.sire.trim() || undefined,
      dam: form.dam.trim() || undefined,
      pedigreeDocs: form.pedigreeDocs.trim() || undefined,
      // Le prix d'achat n'existe QUE sur un cheval acheté : le poser en mode
      // écurie sortirait de l'argent qui n'est jamais sorti.
      purchasePrice: mode === "purchase" ? num(form.purchasePrice) : horse?.purchasePrice,
      sellerName: mode === "purchase" ? form.sellerName.trim() || undefined : horse?.sellerName,
      sellerPhone: mode === "purchase" ? form.sellerPhone.trim() || undefined : horse?.sellerPhone,
      sellerNote: mode === "purchase" ? form.sellerNote.trim() || undefined : horse?.sellerNote,
      purchaseDate: mode === "purchase" ? form.purchaseDate : horse?.purchaseDate,
      // On ne fixe un prix de vente que sur un cheval qu'on a le droit de
      // vendre : celui du club.
      sellingPrice: clubOwned ? num(form.sellingPrice) || undefined : undefined,
      origin: horse?.origin ?? (mode === "purchase" ? "purchase" : "stable"),
      status: horse?.status ?? "available",
      ownerKind,
      ownerStudentId: ownerKind === "student" ? owner.studentId : undefined,
      ownerParentId: ownerKind === "parent" ? owner.parentId : undefined,
      ownerName: ownerKind === "club" ? undefined : owner.name.trim() || undefined,
      ownerPhone: ownerKind === "club" ? undefined : owner.phone?.trim() || undefined,
      ownerNote: ownerKind === "club" ? undefined : owner.note?.trim() || undefined,
    });

    if (!res.ok) {
      addToast({ type: "danger", title: "Enregistrement refusé", message: "Vérifiez les champs." });
      return;
    }
    addToast({
      type: "success",
      title: horse ? "Cheval modifié" : "Cheval enregistré",
      message: `${form.name.trim()} est à jour.`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={
        horse
          ? `Modifier « ${horse.name} »`
          : mode === "purchase"
            ? "Nouvel achat de cheval"
            : "Nouveau cheval à l'écurie"
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!!problem}>
            {horse ? "Enregistrer" : "Créer la fiche"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-primary/25 bg-primary-50/40 p-2.5 text-[10px] leading-relaxed text-muted">
          <strong className="text-ink">Seul le nom est obligatoire</strong>
          {mode === "purchase" ? ", avec le prix d'achat et le prix de vente" : ""}. Tout le reste se
          complète au fil du temps : on n&apos;a presque jamais le carnet complet d&apos;un cheval le
          jour de son arrivée, et une case vide vaut mieux qu&apos;une approximation.
        </p>

        {/* ---- Les rubriques ---- */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === s.id ? "bg-gradient-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {tab === "basic" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nom du cheval" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Référence / matricule">
              <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
            </Field>
            <Field label="Race">
              <Input value={form.breed} onChange={(e) => set("breed", e.target.value)} />
            </Field>
            <Field label="Sexe">
              <Select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
                className="w-full"
              >
                <option value="">Non précisé</option>
                <option value="stallion">Étalon</option>
                <option value="mare">Jument</option>
                <option value="gelding">Hongre</option>
              </Select>
            </Field>
            <Field label="Date de naissance">
              <Input
                type="date"
                value={form.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
              />
            </Field>
            <Field label="Âge (si la date est inconnue)">
              <Input
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="Ex. 7 ans"
              />
            </Field>
            <Field label="Robe">
              <Input
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="Bai, alezan, gris…"
              />
            </Field>
            <Field label="Taille au garrot">
              <Input
                value={form.height}
                onChange={(e) => set("height", e.target.value)}
                placeholder="Ex. 1,62 m"
              />
            </Field>
            <Field label="Poids">
              <Input
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
                placeholder="Ex. 480 kg"
              />
            </Field>
          </div>
        )}

        {tab === "health" && (
          <div className="space-y-3">
            <Field label="Vaccinations">
              <Area value={form.vaccination} onChange={(v) => set("vaccination", v)} rows={3} />
            </Field>
            <Field label="Antécédents médicaux">
              <Area value={form.medicalHistory} onChange={(v) => set("medicalHistory", v)} rows={4} />
            </Field>
            <Field label="Examen vétérinaire">
              <Area value={form.vetExam} onChange={(v) => set("vetExam", v)} rows={3} />
            </Field>
          </div>
        )}

        {tab === "sport" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Discipline">
                <Input
                  value={form.discipline}
                  onChange={(e) => set("discipline", e.target.value)}
                  placeholder="Course, saut d'obstacles, dressage…"
                />
              </Field>
              <Field label="Niveau de dressage">
                <Input
                  value={form.trainingLevel}
                  onChange={(e) => set("trainingLevel", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Historique des compétitions">
              <Area
                value={form.competitionHistory}
                onChange={(v) => set("competitionHistory", v)}
                rows={4}
              />
            </Field>
            <Field label="Récompenses et titres">
              <Area value={form.awards} onChange={(v) => set("awards", v)} rows={3} />
            </Field>
          </div>
        )}

        {tab === "pedigree" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Père (étalon)">
                <Input value={form.sire} onChange={(e) => set("sire", e.target.value)} />
              </Field>
              <Field label="Mère (jument)">
                <Input value={form.dam} onChange={(e) => set("dam", e.target.value)} />
              </Field>
            </div>
            <Field label="Documents d'origine">
              <Area
                value={form.pedigreeDocs}
                onChange={(v) => set("pedigreeDocs", v)}
                rows={4}
                placeholder="Références des papiers, numéro de stud-book, liens…"
              />
            </Field>
          </div>
        )}

        {tab === "money" && (
          <div className="space-y-3">
            {mode === "purchase" ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Prix d'achat (DA)" required>
                    <Input
                      type="number"
                      min={0}
                      value={form.purchasePrice}
                      onChange={(e) => set("purchasePrice", e.target.value)}
                    />
                  </Field>
                  <Field label="Prix de vente affiché (DA)" required>
                    <Input
                      type="number"
                      min={0}
                      value={form.sellingPrice}
                      onChange={(e) => set("sellingPrice", e.target.value)}
                    />
                  </Field>
                  <Field label="Date de l'achat">
                    <Input
                      type="date"
                      value={form.purchaseDate}
                      onChange={(e) => set("purchaseDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Vendeur">
                    <Input
                      value={form.sellerName}
                      onChange={(e) => set("sellerName", e.target.value)}
                    />
                  </Field>
                  <Field label="Téléphone du vendeur">
                    <Input
                      value={form.sellerPhone}
                      onChange={(e) => set("sellerPhone", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Informations sur le vendeur">
                  <Area value={form.sellerNote} onChange={(v) => set("sellerNote", v)} rows={3} />
                </Field>
                <p className="rounded-xl border border-warning/35 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-ink">
                  Le prix d&apos;achat <strong>sort de la caisse</strong> au jour indiqué. Le
                  modifier ensuite AJUSTE ce mouvement au lieu d&apos;en créer un second : corriger
                  une faute de frappe ne double jamais la dépense.
                </p>
              </>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3">
                  <input
                    type="checkbox"
                    checked={!clubOwned}
                    onChange={(e) => setClubOwned(!e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line bg-surface text-primary focus:ring-primary"
                  />
                  <span className="text-xs leading-relaxed text-ink">
                    <strong>Ce cheval n&apos;appartient pas au club.</strong>
                    <span className="mt-0.5 block text-[10px] text-muted">
                      Ses dépenses deviendront alors une <strong>dette de son propriétaire</strong>{" "}
                      au lieu de sortir de la caisse — et il n&apos;a plus de prix de vente : on ne
                      vend pas le cheval d&apos;autrui.
                    </span>
                  </span>
                </label>

                {clubOwned ? (
                  <Field label="Prix de vente affiché (DA)">
                    <Input
                      type="number"
                      min={0}
                      value={form.sellingPrice}
                      onChange={(e) => set("sellingPrice", e.target.value)}
                      placeholder="Laissez vide s'il n'est pas à vendre"
                    />
                  </Field>
                ) : (
                  <PersonPicker
                    value={owner}
                    onChange={setOwner}
                    label="Le propriétaire du cheval"
                    externalLabel="Hors du club"
                  />
                )}
              </>
            )}

            {clubOwned && mode === "stable" && (
              <Badge tone="primary" className="text-[10px]">
                Cheval du club — ses dépenses sortent de la caisse
              </Badge>
            )}
          </div>
        )}

        {problem && (
          <p
            role="alert"
            className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
          >
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function Area({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
    />
  );
}
