"use client";

/**
 * « CRÉER MON COMPTE » — la porte que les familles poussent elles-mêmes.
 *
 * Deux personnes ont besoin d'un accès, et pour deux raisons différentes :
 *
 *  - LE CHEVALIER, pour suivre SES cartes, SES présences, SES absences, SES
 *    paiements et les annonces qui le concernent ;
 *  - LE PARENT, pour suivre la même chose sur CHACUN de ses fils, sans avoir à
 *    demander au comptoir.
 *
 * Le formulaire demande exactement ce que le comptoir demanderait — ni plus, ni
 * moins — et pose LA question qui change tout : « êtes-vous déjà inscrit au
 * club ? ». Un membre qui veut seulement son accès n'a pas à se réinscrire ;
 * un nouveau venu dit qu'il l'est, et l'intendance créera sa fiche.
 *
 * CE QUE LA CRÉATION FAIT VRAIMENT : une ligne dans `auth.users` (le compte se
 * connecte tout de suite, par la porte normale) et une DEMANDE en attente. Le
 * compte ne pilote encore aucune fiche : tant que l'intendance ne l'a pas
 * rattaché, l'application ne lui montre que « votre compte attend son
 * activation ».
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Plus,
  ShieldQuestion,
  Swords,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { requestAccount } from "@/lib/accounts/requests";
import type { AccountRequestChild, AccountRequestKind } from "@/lib/types";

/** Un fils en cours de saisie, avec la clé qui le suit dans la liste. */
interface ChildDraft extends AccountRequestChild {
  key: string;
}

let childSeq = 0;
const newChild = (): ChildDraft => ({
  key: `child-${++childSeq}`,
  firstName: "",
  lastName: "",
  phone: "",
  phone2: "",
  birthDate: "",
});

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** Une case à cocher exclusive, dessinée comme une carte cliquable. */
function ChoiceCard({
  active,
  title,
  description,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-start transition-colors ${
        active
          ? "border-primary bg-primary/10 text-ink"
          : "border-line bg-surface text-ink hover:border-accent/50 hover:bg-primary-50/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-gradient-primary text-white" : "bg-primary-50 text-primary"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm">{title}</strong>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{description}</span>
      </span>
    </button>
  );
}

export function SignupFlow({ onCancel }: { onCancel: () => void }) {
  /** `null` = on n'a pas encore choisi qui l'on est. */
  const [kind, setKind] = useState<AccountRequestKind | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  /**
   * DÉJÀ MEMBRE, OU PREMIÈRE INSCRIPTION ?
   *
   * C'est la seule question qui change le travail de l'intendance : rattacher
   * un compte à une fiche qui existe, ou créer la fiche depuis la demande.
   * `null` tant que rien n'est coché — on ne devine pas à sa place.
   */
  const [existingMember, setExistingMember] = useState<boolean | null>(null);

  /** Parent : ses fils sont-ils déjà inscrits au club ? */
  const [childrenSubscribed, setChildrenSubscribed] = useState<boolean | null>(null);
  const [children, setChildren] = useState<ChildDraft[]>([newChild()]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const setChild = (key: string, fields: Partial<ChildDraft>) =>
    setChildren((prev) => prev.map((c) => (c.key === key ? { ...c, ...fields } : c)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!kind) return;
    if (!firstName.trim() && !lastName.trim()) {
      setError("Indiquez au moins un nom ou un prénom.");
      return;
    }
    if (!phone.trim()) {
      setError("Le téléphone est obligatoire : c'est lui qui permet de vous retrouver au club.");
      return;
    }
    if (!email.trim()) {
      setError("L'email est obligatoire — c'est votre identifiant de connexion.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    if (existingMember === null) {
      setError(
        kind === "student"
          ? "Dites-nous si vous êtes déjà inscrit au club, ou si c'est votre première inscription."
          : "Dites-nous si vous êtes déjà connu du club, ou si c'est votre première venue.",
      );
      return;
    }
    if (kind === "parent" && childrenSubscribed === null) {
      setError("Dites-nous si vos fils sont déjà inscrits au club.");
      return;
    }

    // Les fils ne sont demandés QUE s'ils ne sont pas déjà inscrits : sinon
    // l'intendance les retrouvera elle-même, et les faire ressaisir n'apporte
    // qu'un risque de doublon.
    const declared =
      kind === "parent" && childrenSubscribed === false
        ? children
            .filter((c) => c.firstName.trim() || c.lastName.trim())
            .map(({ firstName: f, lastName: l, phone: p, phone2: p2, birthDate: b }) => ({
              firstName: f.trim(),
              lastName: l.trim(),
              phone: p?.trim() || undefined,
              phone2: p2?.trim() || undefined,
              birthDate: b || undefined,
            }))
        : undefined;

    if (kind === "parent" && childrenSubscribed === false && (declared?.length ?? 0) === 0) {
      setError("Indiquez au moins un fils, ou dites qu'ils sont déjà inscrits au club.");
      return;
    }

    setBusy(true);
    try {
      await requestAccount({
        kind,
        email,
        password,
        firstName,
        lastName,
        phone,
        phone2,
        birthDate,
        address,
        existingMember,
        childrenSubscribed: kind === "parent" ? childrenSubscribed === true : undefined,
        children: declared,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La création du compte a échoué.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Le compte est créé : il ne reste qu'à se connecter ------------------
  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-base font-bold text-ink">Votre compte est créé</h2>
        <p className="text-sm leading-relaxed text-muted">
          Connectez-vous dès maintenant avec <strong className="text-ink">{email.trim().toLowerCase()}</strong>{" "}
          et le mot de passe que vous venez de choisir. Vous verrez d&apos;abord un écran
          d&apos;attente&nbsp;: l&apos;intendance du club doit rattacher votre compte à votre fiche
          avant que vos séances, vos présences et vos paiements s&apos;affichent.
        </p>
        <Button className="w-full" onClick={onCancel}>
          Aller à la connexion
        </Button>
      </motion.div>
    );
  }

  // ---- Étape 1 : qui êtes-vous ? ------------------------------------------
  if (!kind) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="font-display text-lg font-bold text-ink">Créer mon compte</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Un compte vous donne accès, depuis votre téléphone, à tout ce que le comptoir
            sait de vous. Dites-nous d&apos;abord qui vous êtes.
          </p>
        </div>

        <ChoiceCard
          active={false}
          icon={Swords}
          title="Je suis chevalier"
          description="Voir mes abonnements, mes présences, mes absences, mes paiements et les annonces du club."
          onClick={() => setKind("student")}
        />
        <ChoiceCard
          active={false}
          icon={Users}
          title="Je suis parent"
          description="Inscrire mes fils et suivre leurs présences, leurs absences, leurs paiements et les annonces."
          onClick={() => setKind("parent")}
        />

        <Button variant="ghost" className="w-full gap-2" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Button>
      </div>
    );
  }

  const isParent = kind === "parent";

  // ---- Étape 2 : le formulaire --------------------------------------------
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setKind(null)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-50 hover:text-ink"
          aria-label="Revenir au choix"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="font-display text-base font-bold text-ink">
          {isParent ? "Compte parent" : "Compte chevalier"}
        </h2>
      </div>

      {/* ---- Identité ---- */}
      <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          👤 Informations personnelles
        </span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Prénom">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Amine" />
          </Field>
          <Field label="Nom">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Benali" />
          </Field>
          <Field label="Téléphone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 12 34 56" />
          </Field>
          <Field label="Deuxième téléphone (optionnel)">
            <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="0661 98 76 54" />
          </Field>
          <Field label="Date de naissance">
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label="Adresse (optionnel)">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cité, rue, ville" />
          </Field>
        </div>
      </div>

      {/* ---- Identifiants ---- */}
      <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          🔑 Identifiants de connexion
        </span>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 caractères minimum"
            />
          </Field>
          <Field label="Confirmer le mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Le même, une seconde fois"
            />
          </Field>
        </div>
      </div>

      {/* ---- Déjà membre, ou première inscription ? ---- */}
      <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent-wash/60 p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
          <ShieldQuestion className="h-3.5 w-3.5" /> Êtes-vous déjà connu du club&nbsp;?
        </span>
        <ChoiceCard
          active={existingMember === true}
          icon={BadgeCheck}
          title={
            isParent
              ? "Je suis déjà connu du club — je veux seulement mon accès"
              : "Je suis déjà inscrit — je veux seulement activer mon accès"
          }
          description="Votre fiche existe déjà au club. L'intendance retrouvera votre dossier grâce à votre numéro de téléphone et y rattachera ce compte."
          onClick={() => setExistingMember(true)}
        />
        <ChoiceCard
          active={existingMember === false}
          icon={UserPlus}
          title="C'est ma première inscription"
          description="Vous n'êtes pas encore inscrit au club. L'intendance créera votre fiche à partir de cette demande et vous placera dans une catégorie."
          onClick={() => setExistingMember(false)}
        />
      </div>

      {/* ---- Parent : ses fils ---- */}
      {isParent && (
        <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary-50/30 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🧒 Vos fils sont-ils déjà inscrits au club&nbsp;?
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setChildrenSubscribed(true)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                childrenSubscribed === true
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-surface text-ink hover:bg-primary-50"
              }`}
            >
              Oui, ils le sont
            </button>
            <button
              type="button"
              onClick={() => setChildrenSubscribed(false)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                childrenSubscribed === false
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-surface text-ink hover:bg-primary-50"
              }`}
            >
              Non, pas encore
            </button>
          </div>

          {childrenSubscribed === true && (
            <p className="rounded-xl border border-line bg-surface p-2.5 text-[11px] leading-relaxed text-muted">
              Parfait — inutile de les ressaisir. L&apos;intendance retrouvera leurs fiches et
              les rattachera à votre compte.
            </p>
          )}

          <AnimatePresence initial={false}>
            {childrenSubscribed === false && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
                className="space-y-2 overflow-hidden"
              >
                <p className="text-[11px] leading-relaxed text-muted">
                  Décrivez chacun de vos fils. Ils n&apos;ont ni email ni mot de passe&nbsp;:
                  c&apos;est votre compte qui les suit.
                </p>

                {children.map((child, index) => (
                  <div key={child.key} className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
                    <div className="flex items-center justify-between">
                      <strong className="text-[11px] text-ink">Fils {index + 1}</strong>
                      {children.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setChildren((prev) => prev.filter((c) => c.key !== child.key))}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-danger transition-colors hover:bg-danger/10"
                        >
                          <Trash2 className="h-3 w-3" /> Retirer
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Field label="Prénom">
                        <Input
                          value={child.firstName}
                          onChange={(e) => setChild(child.key, { firstName: e.target.value })}
                          placeholder="Amine"
                        />
                      </Field>
                      <Field label="Nom">
                        <Input
                          value={child.lastName}
                          onChange={(e) => setChild(child.key, { lastName: e.target.value })}
                          placeholder="Benali"
                        />
                      </Field>
                      <Field label="Téléphone (optionnel)">
                        <Input
                          value={child.phone ?? ""}
                          onChange={(e) => setChild(child.key, { phone: e.target.value })}
                          placeholder="0555 12 34 56"
                        />
                      </Field>
                      <Field label="Deuxième téléphone (optionnel)">
                        <Input
                          value={child.phone2 ?? ""}
                          onChange={(e) => setChild(child.key, { phone2: e.target.value })}
                          placeholder="0661 98 76 54"
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Date de naissance">
                          <Input
                            type="date"
                            value={child.birthDate ?? ""}
                            onChange={(e) => setChild(child.key, { birthDate: e.target.value })}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setChildren((prev) => [...prev, newChild()])}
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter un autre fils
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <p className="rounded-xl border border-line bg-canvas/50 p-2.5 text-[10px] leading-relaxed text-muted">
        Votre compte sera créé tout de suite et vous pourrez vous connecter — mais il
        n&apos;affichera vos données qu&apos;une fois <strong>activé par l&apos;intendance</strong> du
        club.
      </p>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" disabled={busy} onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Création…" : "Créer mon compte"}
        </Button>
      </div>
    </form>
  );
}
