"use client";

/**
 * LES INSCRIPTIONS VENUES DU SITE.
 *
 * Quelqu'un a lu une formation sur la vitrine, cliqué « Je m'inscris » et
 * rempli le même formulaire que sur la page de connexion. Son compte existe
 * déjà dans `auth.users` — il se connecte — mais il ne pilote AUCUNE fiche :
 * l'application ne lui montre qu'un écran d'attente, et le club ne lui a encore
 * rien facturé.
 *
 * Cet écran est la file d'attente de ce qui arrive du dehors. Quatre gestes :
 *
 *   VÉRIFIER  — la même fenêtre que « Comptes en attente » du tableau de bord,
 *               à ceci près qu'elle inscrit AUSSI sur la formation demandée,
 *               sans encaisser : le prix devient une dette ordinaire, réglée au
 *               comptoir le jour où la famille passe ;
 *   MODIFIER  — corriger ce que quelqu'un a mal tapé sur son téléphone (un nom,
 *               un numéro) AVANT de créer la fiche, plutôt qu'après ;
 *   SUPPRIMER — écarter une inscription manifestement fausse ;
 *   FILTRER   — chevaliers, parents, ou une formation en particulier.
 *
 * POURQUOI PAS LE MÊME ÉCRAN QUE LE TABLEAU DE BORD. Parce que ce ne sont pas
 * les mêmes gens qui les regardent, ni au même moment : le comptoir traite les
 * comptes de familles déjà au club le matin ; la vitrine, elle, rapporte des
 * INCONNUS, et ce qu'ils demandent — une formation précise, à un prix précis —
 * n'a rien à voir avec « activez-moi mon accès ».
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Inbox,
  Mail,
  Megaphone,
  Pencil,
  Phone,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, SearchInput, Select } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivationModal, usePendingRequests } from "@/components/accounts/AccountRequests";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/usePermissions";
import { formatDateFr } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import type { AccountRequest } from "@/lib/types";

export function WebsiteInscriptionsPage() {
  const { tr } = useT();
  const can = useCan("website-inscriptions");
  const pending = usePendingRequests(undefined, "website");
  const formations = useData((s) => s.formations);
  const requests = useData((s) => s.accountRequests);

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "student" | "parent">("all");
  const [formationFilter, setFormationFilter] = useState("all");

  const [reviewing, setReviewing] = useState<AccountRequest | null>(null);
  const [editing, setEditing] = useState<AccountRequest | null>(null);
  const [deleting, setDeleting] = useState<AccountRequest | null>(null);

  /** Ce que le site a rapporté EN TOUT, traité ou non — le chiffre qui compte. */
  const fromSite = requests.filter((r) => r.source === "website");
  const accepted = fromSite.filter((r) => r.status === "linked").length;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pending
      .filter((r) => kindFilter === "all" || r.kind === kindFilter)
      .filter((r) => formationFilter === "all" || r.formationId === formationFilter)
      .filter((r) =>
        !q
          ? true
          : `${r.firstName} ${r.lastName} ${r.phone} ${r.email}`.toLowerCase().includes(q),
      );
  }, [pending, kindFilter, formationFilter, search]);

  const formationOf = (id?: string) => formations.find((f) => f.id === id);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Inscriptions du site"
        subtitle="Ce que la vitrine rapporte : des inconnus qui demandent une formation précise"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Inbox} label="En attente de vérification" value={pending.length} tone="warning" index={0} />
        <StatCard icon={CheckCircle2} label="Acceptées" value={accepted} tone="success" index={1} />
        <StatCard
          icon={Swords}
          label="Chevaliers"
          value={pending.filter((r) => r.kind === "student").length}
          tone="accent"
          index={2}
        />
        <StatCard
          icon={Users}
          label="Parents"
          value={pending.filter((r) => r.kind === "parent").length}
          index={3}
        />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Nom, téléphone ou email…"
              className="flex-1"
            />
            <Select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            >
              <option value="all">Chevaliers et parents</option>
              <option value="student">Chevaliers seulement</option>
              <option value="parent">Parents seulement</option>
            </Select>
            <Select
              value={formationFilter}
              onChange={(e) => setFormationFilter(e.target.value)}
            >
              <option value="all">Toutes les formations</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              message="Aucune inscription en attente"
              hint="Les inscriptions déposées depuis le site du club apparaissent ici, en attente d'être vérifiées et rattachées à une fiche."
            />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const formation = formationOf(r.formationId);
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <strong className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                        {r.kind === "parent" ? (
                          <Users className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Swords className="h-3.5 w-3.5 text-primary" />
                        )}
                        {r.firstName} {r.lastName}
                        <Badge
                          tone={r.kind === "parent" ? "primary" : "accent"}
                          className="text-[9px]"
                        >
                          {tr(r.kind === "parent" ? "Parent" : "Chevalier")}
                        </Badge>
                        <Badge
                          tone={r.existingMember ? "primary" : "neutral"}
                          className="text-[9px]"
                        >
                          {tr(r.existingMember ? "Se dit déjà inscrit" : "Première inscription")}
                        </Badge>
                        {/* Le numéro l'a reconnu à la création du compte : cette
                            personne voit déjà sa fiche, et il ne reste ici que
                            sa place sur la formation. */}
                        {r.autoLinked && (
                          <Badge tone="success" className="text-[9px]">
                            <BadgeCheck className="h-3 w-3" /> {tr("Compte actif")}
                          </Badge>
                        )}
                      </strong>

                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {r.phone || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {r.email}
                        </span>
                        <span>
                          {r.createdAt ? formatDateFr(r.createdAt.slice(0, 10)) : ""}
                        </span>
                        {r.kind === "parent" && !r.childrenSubscribed && (
                          <span>
                            {(r.children ?? []).length} {tr("fils déclaré(s)")}
                          </span>
                        )}
                      </span>

                      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <Megaphone className="h-3.5 w-3.5 text-accent-ink" />
                        {formation ? (
                          <>
                            <strong className="text-ink">{formation.name}</strong>
                            <Badge tone="accent" className="text-[9px]">
                              {formation.price > 0
                                ? formatDA(formation.price)
                                : tr("Offerte")}
                            </Badge>
                          </>
                        ) : (
                          <em className="text-muted">
                            {tr("La formation demandée n'existe plus.")}
                          </em>
                        )}
                      </span>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {can("verify") && (
                        <Button size="sm" className="gap-1.5" onClick={() => setReviewing(r)}>
                          <BadgeCheck className="h-3.5 w-3.5" /> Vérifier
                        </Button>
                      )}
                      {can("edit") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Modifier
                        </Button>
                      )}
                      {can("delete") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-danger"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Supprimer
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pending.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {tr("Tant qu'une inscription reste ici, sa place sur la formation n'est pas encore prise — et la personne ne voit qu'un écran d'attente, sauf si son numéro de téléphone l'a déjà fait reconnaître (« compte actif »).")}
            </p>
          )}
        </CardBody>
      </Card>

      {reviewing && (
        <ActivationModal request={reviewing} onClose={() => setReviewing(null)} />
      )}
      {editing && <InscriptionEditModal request={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <InscriptionDeleteModal request={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

// ===========================================================================
//  CORRIGER CE QU'UN TÉLÉPHONE A MAL TAPÉ
// ===========================================================================

/**
 * On corrige la DEMANDE, jamais le compte.
 *
 * L'email est celui de la connexion : le changer ici ne changerait pas le mot
 * de passe avec lequel la personne s'est déjà connectée, et l'on se retrouverait
 * avec deux adresses pour un seul compte. Il est donc affiché, et verrouillé.
 *
 * Tout le reste — le nom, les numéros, la naissance, l'adresse, la formation —
 * n'est encore recopié NULLE PART : le corriger avant de créer la fiche évite
 * d'avoir à le corriger ensuite à deux endroits.
 */
function InscriptionEditModal({
  request,
  onClose,
}: {
  request: AccountRequest;
  onClose: () => void;
}) {
  const { tr } = useT();
  const updateItem = useData((s) => s.updateItem);
  const formations = useData((s) => s.formations);
  const { addToast } = useToast();

  const [firstName, setFirstName] = useState(request.firstName);
  const [lastName, setLastName] = useState(request.lastName);
  const [phone, setPhone] = useState(request.phone);
  const [phone2, setPhone2] = useState(request.phone2 ?? "");
  const [birthDate, setBirthDate] = useState(request.birthDate ?? "");
  const [address, setAddress] = useState(request.address ?? "");
  const [formationId, setFormationId] = useState(request.formationId ?? "");

  const save = () => {
    updateItem("accountRequests", request.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      phone2: phone2.trim() || undefined,
      birthDate: birthDate || undefined,
      address: address.trim() || undefined,
      formationId: formationId || undefined,
    });
    addToast({
      type: "success",
      title: "Inscription corrigée",
      message: `${firstName.trim()} ${lastName.trim()}`.trim(),
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Modifier l'inscription">
      <div className="space-y-4">
        <p className="rounded-xl border border-line bg-canvas/40 p-2.5 text-[11px] leading-relaxed text-muted">
          {tr("Corrigez ce que la personne a mal saisi depuis son téléphone AVANT de créer sa fiche : ce qui est écrit ici sera recopié tel quel.")}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{tr("Prénom")}</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{tr("Nom")}</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{tr("Téléphone")}</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              {tr("Deuxième téléphone")}
            </label>
            <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              {tr("Date de naissance")}
            </label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{tr("Adresse")}</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">
            {tr("La formation demandée")}
          </label>
          <Select
            value={formationId}
            onChange={(e) => setFormationId(e.target.value)}
            className="w-full"
          >
            <option value="">Aucune formation</option>
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-xl border border-line bg-canvas/40 p-2.5 text-[11px] text-muted">
          {tr("Email de connexion")} : <strong className="text-ink">{request.email}</strong>
          <p className="mt-1 text-[10px] leading-relaxed">
            {tr("Il ne se change pas d'ici : c'est avec lui que la personne s'est déjà connectée, et le mot de passe qu'elle a choisi lui est attaché.")}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
//  ÉCARTER UNE INSCRIPTION
// ===========================================================================

/**
 * La ligne s'en va de la file d'attente. LE COMPTE, LUI, RESTE.
 *
 * Il n'est rattaché à aucune fiche, donc il ne voit rien et ne coûte rien —
 * mais le supprimer d'ici demanderait de toucher à `auth.users` pour une
 * demande qu'on écarte peut-être à tort. C'est dit en toutes lettres plutôt que
 * laissé à deviner.
 */
function InscriptionDeleteModal({
  request,
  onClose,
}: {
  request: AccountRequest;
  onClose: () => void;
}) {
  const { tr } = useT();
  const deleteFrom = useData((s) => s.deleteFrom);
  const { addToast } = useToast();

  return (
    <Modal open onClose={onClose} title="Supprimer l'inscription">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-ink">
            {tr("L'inscription de")}{" "}
            <strong>
              {request.firstName} {request.lastName}
            </strong>{" "}
            {tr("sera retirée de cette file d'attente. Son compte de connexion, lui, RESTE : il ne pilote aucune fiche, ne voit rien et ne coûte rien — mais il pourra être rattaché plus tard si la personne se manifeste.")}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            className="gap-1.5"
            onClick={() => {
              deleteFrom("accountRequests", request.id);
              addToast({
                type: "success",
                title: "Inscription supprimée",
                message: `${request.firstName} ${request.lastName}`.trim(),
              });
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
