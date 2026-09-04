"use client";

/**
 * =============================================================================
 *  QUI EST CETTE PERSONNE ? — chercher une fiche, ou la décrire à la main
 * =============================================================================
 *
 *  Trois écrans posent exactement la même question : à qui appartient ce cheval,
 *  qui l'achète, et qui doit cette autre dette. La réponse a toujours les mêmes
 *  trois formes — un chevalier du club, un parent, ou quelqu'un du dehors dont
 *  on ne garde qu'un nom et un numéro.
 *
 *  POURQUOI RATTACHER À UNE FICHE QUAND C'EST POSSIBLE : c'est ce rattachement,
 *  et lui seul, qui fait remonter la ligne sur le compte de l'intéressé. Un
 *  parent qui ouvre son espace doit y retrouver ce qu'il doit pour ses enfants
 *  ET ce qu'il doit pour son cheval, au même endroit. Saisi à la main, le nom
 *  reste une chaîne de caractères que rien ne relie à personne.
 */

import { useMemo, useState } from "react";
import { Search, User, Users, X } from "lucide-react";
import { Input, Select } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/store/data";

export type PersonKind = "student" | "parent" | "external";

export interface PersonValue {
  kind: PersonKind;
  studentId?: string;
  parentId?: string;
  name: string;
  phone?: string;
  note?: string;
}

export function PersonPicker({
  value,
  onChange,
  label = "La personne",
  allowExternal = true,
  externalLabel = "Quelqu'un d'autre",
}: {
  value: PersonValue;
  onChange: (next: PersonValue) => void;
  label?: string;
  allowExternal?: boolean;
  externalLabel?: string;
}) {
  const db = useData();
  const [query, setQuery] = useState("");

  /** La recherche ne rend que DIX résultats : au-delà, personne ne lit — on
   *  affine sa recherche, ce qui est plus rapide que de parcourir cent lignes. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    if (value.kind === "student") {
      return db.students
        .filter((s) =>
          `${s.firstName} ${s.lastName} ${s.phone ?? ""} ${s.registrationNumber ?? ""}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          phone: s.phone ?? "",
          hint: s.registrationNumber ? `N° ${s.registrationNumber}` : "",
        }));
    }
    if (value.kind === "parent") {
      return db.parents
        .filter((p) =>
          `${p.firstName} ${p.lastName} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q),
        )
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          phone: p.phone ?? "",
          hint: `${p.childIds.length} chevalier(s)`,
        }));
    }
    return [];
  }, [query, value.kind, db.students, db.parents]);

  const linked =
    (value.kind === "student" && value.studentId) || (value.kind === "parent" && value.parentId);

  const setKind = (kind: PersonKind) => {
    setQuery("");
    onChange({ kind, name: "", phone: "", note: value.note });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-semibold text-muted">{label}</label>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              ["student", "Chevalier", User],
              ["parent", "Parent", Users],
              ...(allowExternal ? ([["external", externalLabel, Search]] as const) : []),
            ] as Array<[PersonKind, string, typeof User]>
          ).map(([kind, text, Icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => setKind(kind)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                value.kind === kind ? "bg-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="h-3 w-3" /> {text}
            </button>
          ))}
        </div>
      </div>

      {value.kind === "external" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Nom et prénom"
          />
          <Input
            value={value.phone ?? ""}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            placeholder="Téléphone"
          />
          <textarea
            value={value.note ?? ""}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            rows={2}
            placeholder="Qui est cette personne, comment la joindre, ce qu'il faut savoir…"
            className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm text-ink outline-none focus:border-primary sm:col-span-2"
          />
        </div>
      ) : linked ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5">
          <div className="min-w-0">
            <strong className="block truncate text-xs text-ink">{value.name}</strong>
            <span className="block truncate text-[10px] text-muted">
              {value.phone || "aucun numéro"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge tone="primary" className="text-[9px]">
              {value.kind === "student" ? "Chevalier" : "Parent"}
            </Badge>
            <button
              type="button"
              onClick={() => onChange({ kind: value.kind, name: "", phone: "", note: value.note })}
              aria-label="Changer de personne"
              className="rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                value.kind === "student"
                  ? "Chercher un chevalier par nom, numéro d'inscription ou téléphone…"
                  : "Chercher un parent par nom, téléphone ou e-mail…"
              }
              className="ps-9"
            />
          </div>
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="px-1 text-[10px] italic text-muted">
              Aucune fiche ne correspond. Passez à «{" "}
              {allowExternal ? externalLabel : "une autre catégorie"} » si la personne n&apos;a pas
              de fiche au club.
            </p>
          )}
          {results.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-line">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      kind: value.kind,
                      studentId: value.kind === "student" ? r.id : undefined,
                      parentId: value.kind === "parent" ? r.id : undefined,
                      name: r.name,
                      phone: r.phone,
                      note: value.note,
                    });
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-start last:border-b-0 hover:bg-primary-50/50"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs text-ink">{r.name}</strong>
                    <span className="block truncate text-[10px] text-muted">
                      {r.phone || "aucun numéro"}
                      {r.hint ? ` · ${r.hint}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Le sélecteur de rubrique, avec création à la volée. Personne ne devrait
 *  avoir à quitter sa saisie pour aller déclarer une rubrique. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  onCreate,
  placeholder = "Nouvelle rubrique…",
}: {
  categories: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => void;
  placeholder?: string;
}) {
  const [fresh, setFresh] = useState("");
  return (
    <div className="space-y-1.5">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
        <option value="">Sans rubrique</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-1.5">
        <Input
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && fresh.trim()) {
              e.preventDefault();
              onCreate(fresh.trim());
              setFresh("");
            }
          }}
        />
        <button
          type="button"
          disabled={!fresh.trim()}
          onClick={() => {
            onCreate(fresh.trim());
            setFresh("");
          }}
          className="rounded-xl border border-line px-3 text-xs font-semibold text-ink transition-colors hover:bg-primary-50 disabled:opacity-40"
        >
          Créer
        </button>
      </div>
    </div>
  );
}
