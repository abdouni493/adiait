"use client";

/**
 * LES COMPTES CRÉÉS DEPUIS LA PAGE DE CONNEXION — et ce qu'on en fait.
 *
 * Une famille a rempli le formulaire de la page de connexion. Son compte existe
 * dans `auth.users` et se connecte déjà — mais il ne pilote AUCUNE fiche, donc
 * l'application ne lui montre que « votre compte attend son activation ».
 *
 * CE QUI N'ARRIVE PLUS JUSQU'ICI. Quand le numéro de téléphone désigne une fiche
 * du club — une seule, et que personne ne pilote déjà — la base rattache et
 * active le compte à l'instant même où il est créé (`request_account`). Ces
 * demandes-là ne s'affichent donc pas dans cette file : elles sont déjà closes.
 * Restent ici les cas qu'aucune machine ne peut trancher — un numéro inconnu,
 * un numéro porté par deux fiches — et ceux où l'activation ne suffit pas :
 * une formation à facturer, des fils déclarés à créer. Ceux-là arrivent marqués
 * « compte actif », et il ne reste à poser que le geste qui manque.
 *
 * Tout le travail de l'intendance tient ici, et il n'a que deux issues :
 *
 *   RATTACHER — la personne EXISTE DÉJÀ au club. Son numéro de téléphone la
 *   désigne le plus souvent tout seul : l'écran propose la fiche trouvée, on
 *   vérifie, on confirme. Quand le numéro ne dit rien (il a changé, il a été
 *   mal tapé), on cherche par le nom.
 *
 *   CRÉER — la personne est NOUVELLE. Sa fiche naît de la demande elle-même :
 *   le nom, le téléphone, la date de naissance et l'adresse sont déjà là, il ne
 *   reste qu'à lui choisir sa CATÉGORIE et son GROUPE — ce qui l'inscrit pour
 *   de bon, avec son abonnement. Pour un parent, ses fils naissent en même
 *   temps que lui et lui sont rattachés.
 *
 * Dans les deux cas, le geste final est le même : le profil du compte pointe
 * la fiche, et il est marqué ACTIF. À sa prochaine ouverture, la famille voit
 * exactement ce qu'elle verrait si le comptoir avait tout saisi lui-même.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Megaphone,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Link2,
  Phone,
  Search,
  ShieldQuestion,
  Swords,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ClassTimingPicker,
  toggleTimingSelection,
  useClassTimings,
  type ClassTimingOption,
} from "@/components/students/ClassTimingPicker";
import { useData, uid } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";
import { useToast } from "@/lib/store/toast";
import { linkAccountToEntity } from "@/lib/accounts/requests";
import { formatDateFr, joinPointFor, nextRegistrationNumber, todayIso } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import { periodLabel } from "@/lib/site/formations";
import { toInternational } from "@/lib/whatsapp/phone";
import type {
  AccountRequest,
  AccountRequestChild,
  AccountRequestSource,
  Parent,
  Student,
  SubscriptionDates,
} from "@/lib/types";

/** Deux numéros désignent-ils la même personne ? La comparaison passe par le
 *  format international : « 0555 12 34 56 » et « +213555123456 » sont un seul
 *  et même numéro, et l'écrire autrement ne doit pas casser la détection. */
function samePhone(a?: string, b?: string): boolean {
  const x = toInternational(a);
  const y = toInternational(b);
  return !!x && !!y && x === y;
}

/**
 * Les demandes encore à traiter, les plus récentes d'abord.
 *
 * `source` sépare LES DEUX PORTES par lesquelles une demande arrive : la page
 * de connexion de l'application (`login`) et le site public du club
 * (`website`). Elles se traitent avec le même geste, mais elles ne s'affichent
 * pas au même endroit — le tableau de bord ne doit pas sonner deux fois pour ce
 * que l'écran « Inscriptions du site » montre déjà.
 *
 * Une demande SANS origine est une demande d'avant la vitrine : elle vient
 * forcément de la page de connexion, et compte comme telle.
 */
export function usePendingRequests(
  kind?: "student" | "parent",
  source?: AccountRequestSource,
): AccountRequest[] {
  const requests = useData((s) => s.accountRequests);
  return useMemo(
    () =>
      requests
        .filter((r) => r.status === "pending")
        .filter((r) => !kind || r.kind === kind)
        .filter((r) => !source || (r.source ?? "login") === source)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [requests, kind, source],
  );
}

// ===========================================================================
//  LA FENÊTRE D'ACTIVATION
// ===========================================================================

export function ActivationModal({
  request,
  onClose,
}: {
  request: AccountRequest;
  onClose: () => void;
}) {
  const db = useData();
  const { students, parents, push, updateItem } = db;
  const { addToast } = useToast();
  const actor = useSession((s) => s.user);
  const { subLabel } = useClassTimings();

  const isParent = request.kind === "parent";

  /**
   * LA DÉTECTION AUTOMATIQUE — par le numéro de téléphone.
   *
   * C'est le seul repère qu'une famille tape toujours pareil, et il désigne la
   * bonne fiche dans l'immense majorité des cas. Les DEUX numéros de la demande
   * sont comparés aux DEUX numéros de chaque fiche : la mère qui inscrit son
   * fils sous son propre numéro est retrouvée quand même.
   */
  const detected = useMemo(() => {
    const nums = [request.phone, request.phone2].filter(Boolean) as string[];
    if (nums.length === 0) return null;
    if (isParent) {
      return (
        parents.find((p) => nums.some((n) => samePhone(n, p.phone))) ??
        // Un parent peut n'être connu que par le numéro porté sur la fiche de
        // son enfant : on remonte alors du fils au père.
        (() => {
          const child = students.find((st) =>
            nums.some((n) => samePhone(n, st.phone) || samePhone(n, st.phone2)),
          );
          return child?.parentId ? parents.find((p) => p.id === child.parentId) ?? null : null;
        })() ??
        null
      );
    }
    return (
      students.find((st) => nums.some((n) => samePhone(n, st.phone) || samePhone(n, st.phone2))) ??
      null
    );
  }, [request.phone, request.phone2, isParent, students, parents]);

  /**
   * Ce qu'on va rattacher : la fiche que la BASE a déjà reconnue à la création
   * du compte, à défaut celle que le téléphone désigne ici, à défaut celle
   * qu'on aura cherchée.
   */
  const [pickedId, setPickedId] = useState<string>(
    request.linkedEntityId ?? detected?.id ?? "",
  );
  const [search, setSearch] = useState("");
  /** `link` = rattacher à une fiche existante · `create` = la créer. */
  const [mode, setMode] = useState<"link" | "create">(detected ? "link" : "link");
  /** Le détail de la fiche visée est-il déplié ? (le bouton « Vérifier ») */
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Création : les créneaux choisis pour le chevalier lui-même. */
  const [subIds, setSubIds] = useState<string[]>([]);
  /** Création (parent) : les créneaux choisis pour CHACUN de ses fils. */
  const [childSubs, setChildSubs] = useState<Record<number, string[]>>({});
  /** Quel fils on est en train d'inscrire (l'index de la liste déclarée). */
  const [openChild, setOpenChild] = useState<number | null>(null);

  const declaredChildren: AccountRequestChild[] = request.children ?? [];

  /**
   * LA FORMATION D'OÙ LA DEMANDE EST PARTIE — quand elle vient du site.
   *
   * Quelqu'un qui s'inscrit depuis la vitrine ne demande pas « un compte » : il
   * demande UNE FORMATION. Activer son compte sans l'y inscrire lui donnerait
   * un accès à un club dont il ne suivrait rien, et l'intendance devrait
   * refaire à la main ce que le formulaire disait déjà.
   *
   * L'inscription naît donc AVEC l'activation, et SANS ARGENT : le prix est
   * porté au compte comme n'importe quel autre frais, et il se réglera au
   * comptoir, le jour où la famille passera.
   */
  const formation = request.formationId
    ? db.formations.find((f) => f.id === request.formationId)
    : undefined;

  /**
   * UN PARENT RATTACHÉ À UNE FICHE QUI EXISTE DÉJÀ : QUI PARTICIPE ?
   *
   * On ne peut pas le deviner. Ses fils sont peut-être trois, et un seul veut
   * faire le stage. La liste de ses enfants s'affiche donc, et l'on coche —
   * plutôt que d'inscrire tout le monde ou personne.
   */
  const [formationChildIds, setFormationChildIds] = useState<string[]>([]);

  const q = search.trim().toLowerCase();
  const candidates = useMemo(() => {
    if (!q) return [];
    if (isParent) {
      return parents
        .filter((p) => `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(q))
        .slice(0, 20);
    }
    return students
      .filter((st) =>
        `${st.firstName} ${st.lastName} ${st.phone} ${st.registrationNumber ?? ""}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 20);
  }, [q, isParent, parents, students]);

  const picked = isParent
    ? parents.find((p) => p.id === pickedId) ?? null
    : students.find((st) => st.id === pickedId) ?? null;

  /** La signature du traitement, posée sur la demande une fois close. */
  const stamp = () => ({
    status: "linked" as const,
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor?.entityId ?? actor?.id,
    reviewedByName: actor?.name,
  });

  const toggleFor = (target: "self" | number) => (option: ClassTimingOption) => {
    if (target === "self") {
      setSubIds((prev) => toggleTimingSelection(prev, option));
      return;
    }
    setChildSubs((prev) => ({
      ...prev,
      [target]: toggleTimingSelection(prev[target] ?? [], option),
    }));
  };

  /**
   * OÙ UNE FICHE FRAÎCHEMENT CRÉÉE ENTRE sur chacun de ses créneaux.
   *
   * Jamais à la séance 1 : elle entre LÀ OÙ EN EST LE GROUPE aujourd'hui — la
   * carte qu'il vit et la séance tenue ce jour-là. C'est ce que
   * `subscribeStudent` fait pour une inscription après coup ; la création écrit
   * `subscriptionIds` directement, donc elle doit le calculer elle-même.
   */
  const enrollNew = (ids: string[]) => {
    const day = todayIso();
    const dates: Record<string, SubscriptionDates> = {};
    for (const subId of ids) {
      if (!db.subscriptions.some((s) => s.id === subId)) continue;
      const point = joinPointFor(db, subId, day);
      dates[subId] = {
        subscribedAt: day,
        startDate: day,
        joinMonthCode: point.monthCode,
        joinSlotIndex: point.slotIndex,
      };
    }
    return dates;
  };

  /**
   * INSCRIT LES CHEVALIERS DÉSIGNÉS SUR LA FORMATION DE LA DEMANDE.
   *
   * Sans argent : `amountPaid` vaut zéro, donc le prix reste ENTIÈREMENT dû. Il
   * apparaît dès lors comme une dette ordinaire — sur la fiche du chevalier, sur
   * la feuille de présence de son groupe et dans les rapports — et se règle au
   * guichet, en une ou plusieurs fois.
   */
  const enrollOnFormation = async (studentIds: string[]) => {
    if (!formation) return 0;
    let done = 0;
    for (const studentId of studentIds) {
      const result = await db.enrollInFormation({
        formationId: formation.id,
        studentId,
        amountPaid: 0,
        source: "website",
      });
      if (result.ok) done += 1;
    }
    return done;
  };

  // ---- RATTACHER À UNE FICHE EXISTANTE ------------------------------------
  const confirmLink = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await linkAccountToEntity(request.accountId, picked.id, isParent ? "parent" : "student");

      // La fiche gagne l'email de connexion du compte : c'est par lui qu'on la
      // retrouvera, et l'écran de la fiche l'affiche comme n'importe quel autre.
      if (isParent) {
        updateItem("parents", picked.id, { email: request.email });
      } else {
        updateItem("students", picked.id, { email: request.email });
      }

      // La formation demandée depuis le site, posée sur la fiche qu'on vient de
      // rattacher : le chevalier lui-même, ou les fils que l'on a cochés.
      //
      // Les fils cochés sont RELUS sur la fiche retenue : on a pu changer de
      // parent après avoir coché, et l'on inscrirait alors l'enfant de
      // quelqu'un d'autre.
      const childIds = isParent
        ? formationChildIds.filter((id) =>
            students.some((st) => st.id === id && st.parentId === picked.id),
          )
        : [];
      const enrolled = await enrollOnFormation(isParent ? childIds : [picked.id]);

      updateItem("accountRequests", request.id, {
        ...stamp(),
        linkedEntityId: picked.id,
        ...(childIds.length > 0 ? { linkedChildIds: childIds } : {}),
      });

      addToast({
        type: "success",
        title: formation && enrolled > 0 ? "Compte activé & inscrit" : "Compte activé",
        message: `${request.firstName} ${request.lastName} pilote désormais la fiche « ${
          isParent
            ? `${(picked as Parent).firstName} ${(picked as Parent).lastName}`
            : `${(picked as Student).firstName} ${(picked as Student).lastName}`
        } ».`,
      });
      onClose();
    } catch (err) {
      addToast({
        type: "danger",
        title: "Rattachement refusé",
        message: err instanceof Error ? err.message : "Le rattachement a échoué.",
      });
    } finally {
      setBusy(false);
    }
  };

  // ---- CRÉER LA FICHE DEPUIS LA DEMANDE -----------------------------------
  const confirmCreate = async () => {
    setBusy(true);
    try {
      if (isParent) {
        /**
         * LE PARENT NAÎT AVEC SES FILS.
         *
         * Sa fiche prend l'identifiant du COMPTE : c'est ce qui relie sa
         * session à ses données, exactement comme un parent créé au comptoir
         * avec un accès. Ses fils, eux, sont des fiches ordinaires — sans
         * compte — rattachées à lui des deux côtés.
         */
        const parentId = request.accountId;
        const childIds: string[] = [];

        let numbering = nextRegistrationNumber(db);
        declaredChildren.forEach((child, index) => {
          const ids = childSubs[index] ?? [];
          const studentId = uid("stu");
          const student: Student = {
            id: studentId,
            registrationNumber: numbering,
            firstName: child.firstName,
            lastName: child.lastName || request.lastName,
            birthDate: child.birthDate ?? "",
            phone: child.phone || request.phone,
            phone2: child.phone2 || request.phone2,
            address: request.address,
            email: "",
            rfid: uid("rfid"),
            isFree: false,
            studentCase: "normal",
            parentId,
            subscriptionIds: ids,
            subscriptionDates: enrollNew(ids),
          };
          push("students", student);
          childIds.push(studentId);
          // Le numéro d'inscription suivant, sans relire un magasin qui n'a pas
          // encore vu la fiche qu'on vient d'y poser.
          numbering = String(Number(numbering) + 1).padStart(numbering.length, "0");
        });

        const parent: Parent = {
          id: parentId,
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone,
          phone2: request.phone2,
          birthDate: request.birthDate,
          address: request.address,
          email: request.email,
          childIds,
        };
        push("parents", parent);

        // L'engagement de chaque créneau rejoint est porté au compte du fils.
        for (const [index, studentId] of childIds.entries()) {
          await db.applyEngagementCharges(studentId, childSubs[index] ?? []);
        }

        // Et la formation du site, quand la demande en portait une : tous les
        // fils qui viennent de naître y sont inscrits, sans rien payer encore.
        await enrollOnFormation(childIds);

        await linkAccountToEntity(request.accountId, parentId, "parent");
        updateItem("accountRequests", request.id, {
          ...stamp(),
          linkedEntityId: parentId,
          linkedChildIds: childIds,
        });

        addToast({
          type: "success",
          title: "Parent créé et activé",
          message:
            childIds.length > 0
              ? `${request.firstName} ${request.lastName} · ${childIds.length} chevalier(s) créé(s) et rattaché(s).`
              : `${request.firstName} ${request.lastName} est créé et son compte est actif.`,
        });
        onClose();
        return;
      }

      /**
       * LE CHEVALIER NAÎT SOUS L'IDENTIFIANT DE SON COMPTE — comme n'importe
       * quel chevalier créé avec un accès. Ses créneaux cochés l'inscrivent
       * pour de bon : il entre LÀ OÙ EN EST LE GROUPE aujourd'hui, pas à la
       * séance 1 d'une carte qu'il n'a pas vécue.
       */
      const studentId = request.accountId;
      const student: Student = {
        id: studentId,
        registrationNumber: nextRegistrationNumber(db),
        firstName: request.firstName,
        lastName: request.lastName,
        birthDate: request.birthDate ?? "",
        phone: request.phone,
        phone2: request.phone2,
        address: request.address,
        email: request.email,
        rfid: uid("rfid"),
        isFree: false,
        studentCase: "normal",
        subscriptionIds: subIds,
        subscriptionDates: enrollNew(subIds),
      };
      push("students", student);
      await db.applyEngagementCharges(studentId, subIds);
      await enrollOnFormation([studentId]);

      await linkAccountToEntity(request.accountId, studentId, "student");
      updateItem("accountRequests", request.id, { ...stamp(), linkedEntityId: studentId });

      addToast({
        type: "success",
        title: "Chevalier créé et activé",
        message:
          subIds.length > 0
            ? `${request.firstName} ${request.lastName} · inscrit sur ${subIds.length} emploi(s) du temps.`
            : `${request.firstName} ${request.lastName} est créé. Ses créneaux se choisiront depuis sa fiche.`,
      });
      onClose();
    } catch (err) {
      addToast({
        type: "danger",
        title: "Création refusée",
        message: err instanceof Error ? err.message : "La création a échoué.",
      });
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    if (!confirm("Écarter cette demande ? Le compte restera en attente d'activation.")) return;
    updateItem("accountRequests", request.id, {
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor?.entityId ?? actor?.id,
      reviewedByName: actor?.name,
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Activer un compte" wide>
      <div className="space-y-4">
        {/* ---- CE QUE LA DEMANDE DIT ------------------------------------ */}
        <div className="rounded-2xl border border-line bg-canvas/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {isParent ? <Users className="h-3.5 w-3.5" /> : <Swords className="h-3.5 w-3.5" />}
              {isParent ? "Demande d'un parent" : "Demande d'un chevalier"}
            </span>
            <Badge tone={request.existingMember ? "primary" : "accent"} className="text-[9px]">
              {request.existingMember ? "Se dit déjà inscrit" : "Première inscription"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
            <div>
              <span className="block text-[9px] uppercase text-muted">Nom</span>
              <strong className="text-ink">
                {request.firstName} {request.lastName}
              </strong>
            </div>
            <div>
              <span className="block text-[9px] uppercase text-muted">Téléphone</span>
              <strong className="text-ink">{request.phone || "—"}</strong>
            </div>
            <div>
              <span className="block text-[9px] uppercase text-muted">2e téléphone</span>
              <strong className="text-ink">{request.phone2 || "—"}</strong>
            </div>
            <div>
              <span className="block text-[9px] uppercase text-muted">Naissance</span>
              <strong className="text-ink">
                {request.birthDate ? formatDateFr(request.birthDate) : "—"}
              </strong>
            </div>
            <div className="col-span-2">
              <span className="block text-[9px] uppercase text-muted">Adresse</span>
              <strong className="text-ink">{request.address || "—"}</strong>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="block text-[9px] uppercase text-muted">Email de connexion</span>
              <strong className="text-ink">{request.email}</strong>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="block text-[9px] uppercase text-muted">Demandé le</span>
              <strong className="text-ink">
                {request.createdAt ? formatDateFr(request.createdAt.slice(0, 10)) : "—"}
              </strong>
            </div>
          </div>

          {isParent && (
            <p className="mt-2 rounded-xl border border-line bg-surface p-2 text-[10px] leading-relaxed text-muted">
              {request.childrenSubscribed
                ? "Ce parent déclare que ses fils sont DÉJÀ inscrits au club : retrouvez sa fiche ci-dessous, ses enfants y sont déjà rattachés."
                : `Ce parent déclare ${declaredChildren.length} fils PAS ENCORE inscrit(s) : ils seront créés avec sa fiche.`}
            </p>
          )}
        </div>

        {/*
          ---- LE COMPTE S'EST ACTIVÉ TOUT SEUL ---------------------------

          Le numéro de téléphone a désigné une fiche à la création du compte, et
          la base est allée au bout : la famille voit déjà tout. Si la demande
          est encore là, c'est qu'elle porte autre chose — une formation à
          facturer, des fils à créer. Le dire évite de refaire un rattachement
          déjà fait, et de croire que quelqu'un attend derrière son écran.
        */}
        {request.autoLinked && (
          <div className="rounded-2xl border border-success/40 bg-success/10 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-success">
              <BadgeCheck className="h-3.5 w-3.5" /> Compte déjà actif
            </span>
            <p className="mt-1 text-[11px] leading-relaxed text-ink">
              Le numéro de téléphone a reconnu cette personne au moment de la création du compte :
              il est <strong>rattaché et actif</strong>, et la famille voit déjà sa fiche. Il ne
              reste ici que{" "}
              {formation
                ? "l'inscription sur la formation demandée"
                : "les fils déclarés, à créer et à rattacher"}
              .
            </p>
          </div>
        )}

        {/* ---- LA FORMATION DEMANDÉE, quand la demande vient du site ---- */}
        {formation && (
          <div className="space-y-2 rounded-2xl border border-accent/40 bg-accent-wash/60 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
              <Megaphone className="h-3.5 w-3.5" /> Inscription venue du site
            </span>
            <p className="text-[11px] leading-relaxed text-ink">
              Cette demande porte sur{" "}
              <strong>{formation.name}</strong>
              {" — "}
              {periodLabel(formation)}
              {formation.price > 0 ? (
                <>
                  , <strong>{formatDA(formation.price)}</strong>.
                </>
              ) : (
                <>, offerte.</>
              )}{" "}
              L&apos;activation inscrira {isParent ? "les fils cochés" : "le chevalier"}{" "}
              <strong>sans encaisser quoi que ce soit</strong> : le prix est porté au compte
              comme un frais ordinaire, et se règle au comptoir le jour où la famille passe.
            </p>

            {/* Un parent RATTACHÉ à une fiche existante : lesquels de ses fils
                participent ? On ne le devine pas — on le demande. */}
            {isParent && mode === "link" && picked && (
              <div className="space-y-1.5 rounded-xl border border-line bg-surface p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Qui participe ?
                </span>
                {students.filter((st) => st.parentId === picked.id).length === 0 ? (
                  <p className="text-[11px] italic text-muted">
                    Aucun fils n&apos;est rattaché à cette fiche. Rattachez-les d&apos;abord
                    depuis l&apos;écran Parents, puis inscrivez-les depuis leur fiche.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {students
                      .filter((st) => st.parentId === picked.id)
                      .map((st) => {
                        const on = formationChildIds.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() =>
                              setFormationChildIds((prev) =>
                                on ? prev.filter((x) => x !== st.id) : [...prev, st.id],
                              )
                            }
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                              on
                                ? "border-primary bg-primary text-white"
                                : "border-line bg-surface text-ink hover:bg-primary-50"
                            }`}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {st.firstName} {st.lastName}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {isParent && mode === "create" && (
              <p className="rounded-xl border border-line bg-surface p-2 text-[10px] leading-relaxed text-muted">
                Les fils créés depuis cette demande seront TOUS inscrits sur la formation.
              </p>
            )}
          </div>
        )}

        {/* ---- LA DÉTECTION AUTOMATIQUE --------------------------------
             Muette quand la base a DÉJÀ tranché à la création du compte : le
             bandeau vert ci-dessus le dit mieux, et deux fois la même nouvelle
             ferait douter de la première. */}
        {request.autoLinked ? null : detected ? (
          <div className="space-y-2 rounded-2xl border border-success/40 bg-success/10 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-success">
              <BadgeCheck className="h-3.5 w-3.5" /> Fiche trouvée par le numéro de téléphone
            </span>
            <p className="text-[11px] leading-relaxed text-ink">
              Le compte « {request.firstName} {request.lastName} » correspond à la fiche{" "}
              <strong>
                {isParent
                  ? `${(detected as Parent).firstName} ${(detected as Parent).lastName}`
                  : `${(detected as Student).firstName} ${(detected as Student).lastName}`}
              </strong>{" "}
              déjà enregistrée au club, avec le même numéro{" "}
              <strong>{isParent ? (detected as Parent).phone : (detected as Student).phone}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setPickedId(detected.id);
                  setMode("link");
                  setVerifying((v) => !v);
                }}
              >
                <Search className="h-3.5 w-3.5" /> {verifying ? "Masquer" : "Vérifier"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => {
                  setPickedId(detected.id);
                  setMode("link");
                  void confirmLink();
                }}
              >
                <Link2 className="h-3.5 w-3.5" /> Confirmer le rattachement
              </Button>
            </div>

            {verifying && (
              <div className="rounded-xl border border-line bg-surface p-2.5 text-[10px] text-muted">
                {isParent ? (
                  <>
                    <div>
                      Enfants rattachés :{" "}
                      <strong className="text-ink">
                        {students
                          .filter((st) => st.parentId === detected.id)
                          .map((st) => `${st.firstName} ${st.lastName}`)
                          .join(", ") || "aucun"}
                      </strong>
                    </div>
                    <div>
                      Email actuel de la fiche :{" "}
                      <strong className="text-ink">{(detected as Parent).email || "—"}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      N° d&apos;inscription :{" "}
                      <strong className="text-ink">
                        {(detected as Student).registrationNumber ?? "—"}
                      </strong>
                    </div>
                    <div>
                      Emplois du temps suivis :{" "}
                      <strong className="text-ink">
                        {(detected as Student).subscriptionIds.map(subLabel).join(", ") || "aucun"}
                      </strong>
                    </div>
                    <div>
                      Naissance :{" "}
                      <strong className="text-ink">
                        {(detected as Student).birthDate
                          ? formatDateFr((detected as Student).birthDate)
                          : "—"}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warning">
              <ShieldQuestion className="h-3.5 w-3.5" /> Aucune fiche ne porte ce numéro
            </span>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Le numéro <strong className="text-ink">{request.phone || "—"}</strong> ne correspond à
              aucune fiche du club. Cherchez la personne par son nom — un numéro change, une faute
              de frappe arrive — ou créez sa fiche depuis cette demande.
            </p>
          </div>
        )}

        {/* ---- LES DEUX CHEMINS ----------------------------------------- */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`rounded-xl border p-2.5 text-start transition-colors ${
              mode === "link"
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink hover:bg-primary-50"
            }`}
          >
            <strong className="flex items-center gap-1.5 text-[11px]">
              <Link2 className="h-3.5 w-3.5" /> Rattacher à une fiche existante
            </strong>
            <span className={`text-[9px] ${mode === "link" ? "text-white/80" : "text-muted"}`}>
              La personne est déjà au club
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-xl border p-2.5 text-start transition-colors ${
              mode === "create"
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink hover:bg-primary-50"
            }`}
          >
            <strong className="flex items-center gap-1.5 text-[11px]">
              <UserPlus className="h-3.5 w-3.5" /> Créer la fiche
            </strong>
            <span className={`text-[9px] ${mode === "create" ? "text-white/80" : "text-muted"}`}>
              {isParent ? "Le parent et ses fils" : "Le chevalier, avec sa catégorie"}
            </span>
          </button>
        </div>

        {/* ---- CHEMIN 1 : RATTACHER ------------------------------------- */}
        {mode === "link" && (
          <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Chercher {isParent ? "le parent" : "le chevalier"} par son nom
            </span>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, prénom ou téléphone…"
                className="ps-9"
              />
            </div>

            {q && candidates.length === 0 && (
              <p className="p-1.5 text-[11px] italic text-muted">
                Aucune fiche ne correspond. Passez par « Créer la fiche ».
              </p>
            )}

            <div className="max-h-44 space-y-1 overflow-y-auto">
              {candidates.map((c) => {
                const on = pickedId === c.id;
                const label = `${c.firstName} ${c.lastName}`;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickedId(c.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-ink hover:bg-primary-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {label}
                      <span className={`text-[9px] ${on ? "text-white/80" : "text-muted"}`}>
                        <Phone className="me-0.5 inline h-2.5 w-2.5" />
                        {c.phone || "—"}
                      </span>
                    </span>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>

            {picked && (
              <p className="rounded-xl border border-primary/30 bg-primary-50/50 p-2 text-[11px] text-ink">
                Le compte sera rattaché à{" "}
                <strong>
                  {picked.firstName} {picked.lastName}
                </strong>
                . Il verra alors exactement ce que cette fiche contient.
              </p>
            )}
          </div>
        )}

        {/* ---- CHEMIN 2 : CRÉER ---------------------------------------- */}
        {mode === "create" && (
          <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
            {isParent ? (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Les fils déclarés — leur catégorie et leur groupe
                </span>
                {declaredChildren.length === 0 ? (
                  <p className="rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning">
                    Ce parent n&apos;a déclaré aucun fils (il dit qu&apos;ils sont déjà inscrits).
                    Sa fiche sera créée seule — rattachez-lui ses enfants depuis l&apos;écran
                    Parents.
                  </p>
                ) : (
                  declaredChildren.map((child, index) => {
                    const ids = childSubs[index] ?? [];
                    const open = openChild === index;
                    return (
                      <div key={index} className="rounded-xl border border-line bg-surface p-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenChild(open ? null : index)}
                          className="flex w-full flex-wrap items-center justify-between gap-2 text-start"
                        >
                          <span className="text-[11px] font-bold text-ink">
                            {child.firstName} {child.lastName || request.lastName}
                            <span className="ms-2 text-[9px] font-normal text-muted">
                              {child.birthDate ? formatDateFr(child.birthDate) : "date inconnue"}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={ids.length > 0 ? "success" : "warning"} className="text-[9px]">
                              {ids.length} créneau(x)
                            </Badge>
                            <span className="text-[10px] font-bold text-primary">
                              {open ? "Masquer" : "Choisir la catégorie"}
                            </span>
                          </span>
                        </button>
                        {open && (
                          <div className="mt-2 border-t border-line pt-2">
                            <ClassTimingPicker
                              selectedSubIds={ids}
                              onToggle={toggleFor(index)}
                              showTotal={false}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <p className="text-[10px] leading-relaxed text-muted">
                  Un fils sans créneau coché est quand même créé et rattaché à son père : ses
                  inscriptions se choisiront plus tard, depuis l&apos;écran Chevaliers.
                </p>
              </>
            ) : (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Sa catégorie et son groupe
                </span>
                <ClassTimingPicker selectedSubIds={subIds} onToggle={toggleFor("self")} />
                <p className="text-[10px] leading-relaxed text-muted">
                  Sans créneau coché, la fiche est créée quand même : ses inscriptions se
                  choisiront plus tard, depuis l&apos;écran Chevaliers.
                </p>
              </>
            )}
          </div>
        )}

        {/* ---- LE GESTE FINAL ------------------------------------------ */}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" className="gap-1.5 text-danger" disabled={busy} onClick={reject}>
            <X className="h-4 w-4" /> Écarter la demande
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Fermer
            </Button>
            {mode === "link" ? (
              <Button className="gap-1.5" disabled={busy || !picked} onClick={() => void confirmLink()}>
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Activation…" : "Vérifier & activer"}
              </Button>
            ) : (
              <Button className="gap-1.5" disabled={busy} onClick={() => void confirmCreate()}>
                <UserPlus className="h-4 w-4" />
                {busy ? "Création…" : isParent ? "Créer le parent & activer" : "Créer le chevalier & activer"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
//  LA LISTE DES DEMANDES
// ===========================================================================

export function AccountRequestsPanel({
  kind,
  source = "login",
  title,
  emptyHint,
}: {
  /** `undefined` = les deux natures de demande (le tableau de bord) */
  kind?: "student" | "parent";
  /**
   * D'où viennent les demandes qu'on montre ici. Par défaut celles de la PAGE
   * DE CONNEXION : celles du site ont leur propre écran, et les afficher deux
   * fois ferait croire à deux files d'attente là où il n'y en a qu'une.
   */
  source?: AccountRequestSource;
  title?: string;
  emptyHint?: string;
}) {
  const pending = usePendingRequests(kind, source);
  const [open, setOpen] = useState<AccountRequest | null>(null);

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <BellRing className="h-3.5 w-3.5" /> {title}
          </span>
          <Badge tone={pending.length > 0 ? "warning" : "neutral"} className="text-[9px]">
            {pending.length} en attente
          </Badge>
        </div>
      )}

      {pending.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          message="Aucune demande en attente"
          hint={
            emptyHint ??
            "Les comptes créés depuis la page de connexion apparaîtront ici, en attente d'être rattachés à une fiche."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5"
            >
              <span className="min-w-0">
                <strong className="flex items-center gap-1.5 text-[12px] text-ink">
                  {r.kind === "parent" ? (
                    <Users className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Swords className="h-3.5 w-3.5 text-primary" />
                  )}
                  {r.firstName} {r.lastName}
                  <Badge tone={r.kind === "parent" ? "primary" : "accent"} className="text-[9px]">
                    {r.kind === "parent" ? "Parent" : "Chevalier"}
                  </Badge>
                  {/* Le numéro l'a reconnu tout seul : la famille n'attend
                      derrière aucun écran, il reste seulement du travail. */}
                  {r.autoLinked && (
                    <Badge tone="success" className="text-[9px]">
                      <BadgeCheck className="h-3 w-3" /> Compte actif
                    </Badge>
                  )}
                </strong>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-muted">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {r.phone || "—"}
                  </span>
                  <span>{r.email}</span>
                  <span>
                    {r.existingMember ? "Se dit déjà inscrit" : "Première inscription"}
                    {r.kind === "parent" && !r.childrenSubscribed
                      ? ` · ${(r.children ?? []).length} fils déclaré(s)`
                      : ""}
                  </span>
                  <span>
                    {r.createdAt ? formatDateFr(r.createdAt.slice(0, 10)) : ""}
                  </span>
                </span>
              </span>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setOpen(r)}>
                <BadgeCheck className="h-3.5 w-3.5" /> Activer
              </Button>
            </div>
          ))}
        </div>
      )}

      {open && <ActivationModal request={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ===========================================================================
//  LA CLOCHE DU TABLEAU DE BORD
// ===========================================================================

/**
 * LE BOUTON D'ALERTE — il ne sonne que s'il y a quelque chose à traiter.
 *
 * Une famille qui crée son compte à 22 h attend que quelqu'un l'active. Sans
 * cette cloche, sa demande dormirait dans une table que personne n'ouvre : le
 * tableau de bord est le seul écran que l'intendance regarde tous les matins.
 */
export function AccountRequestsAlert() {
  const pending = usePendingRequests(undefined, "login");
  const [open, setOpen] = useState(false);

  const students = pending.filter((r) => r.kind === "student").length;
  const parents = pending.filter((r) => r.kind === "parent").length;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={`relative gap-2 ${pending.length > 0 ? "border-warning/50 text-warning" : ""}`}
        title="Comptes créés depuis la page de connexion"
      >
        {pending.length > 0 ? (
          <BellRing className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4 text-muted" />
        )}
        Comptes en attente
        {pending.length > 0 && (
          <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-white">
            {pending.length}
          </span>
        )}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Comptes créés depuis la page de connexion"
        wide
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-line bg-canvas/40 p-3 text-[11px] leading-relaxed text-muted">
            Ces comptes existent déjà et se connectent — mais ils ne pilotent aucune fiche, donc
            ils ne voient qu&apos;un écran d&apos;attente. Activez-en un pour le rattacher à une
            fiche du club, ou pour créer cette fiche depuis sa demande.
            <br />
            Ceux dont le numéro de téléphone a reconnu une fiche du club{" "}
            <strong className="text-ink">ne passent pas par ici</strong> : ils sont actifs
            d&apos;emblée. Il ne reste ici que ce que la machine ne peut pas décider.
          </p>

          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent" className="text-[10px]">
                <Swords className="h-3 w-3" /> {students} chevalier(s)
              </Badge>
              <Badge tone="primary" className="text-[10px]">
                <Users className="h-3 w-3" /> {parents} parent(s)
              </Badge>
            </div>
          )}

          <AccountRequestsPanel />

          {pending.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Tant qu&apos;une demande reste ici, la famille voit « votre compte attend son
              activation » et rien d&apos;autre — sauf celles marquées « compte actif », dont le
              numéro a déjà tout ouvert.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
