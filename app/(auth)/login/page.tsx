"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { ThemeToggle } from "@/components/controls/ThemeToggle";
import { LanguageSwitcher } from "@/components/controls/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useData } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";
import { roleHome } from "@/lib/nav";
import {
  bootstrapAdmin,
  lastSchemaError,
  schemaState,
  type SchemaState,
} from "@/lib/supabase/auth";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const school = useData((s) => s.school);
  const signIn = useSession((s) => s.signIn);
  const sessionUser = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && sessionUser) router.replace(roleHome(sessionUser.role));
  }, [hydrated, sessionUser, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * LE PREMIER ADMINISTRATEUR.
   *
   * Un club qui vient d'être installée n'a AUCUN compte : personne ne peut se
   * connecter, donc personne ne peut créer le premier administrateur. Ce
   * formulaire est la seule porte d'entrée de ce cas-là.
   *
   * `null` = on ne sait pas encore (la question est posée à la base au
   * chargement). Tant qu'on ne sait pas, on n'affiche rien : proposer puis
   * retirer le bouton ferait clignoter la page.
   */
  const [state, setState] = useState<SchemaState | null>(null);

  /**
   * QUAND PROPOSE-T-ON L'AMORÇAGE ?
   *
   * Dès qu'on n'a pas la preuve qu'un administrateur existe — donc aussi quand
   * l'interrogation a échoué. C'est la BASE qui tranche : `bootstrap_admin()`
   * refuse un second amorçage et le dit. Faire dépendre le bouton d'un
   * aller-retour réussi, c'était offrir une page muette au premier hoquet de
   * réseau, sans rien pour comprendre.
   *
   * `null` = on interroge encore. La page l'affiche, plutôt que de laisser un
   * blanc que personne ne sait interpréter.
   */
  const needsAdmin = state === "no-admin" || state === "unreachable";
  const [creating, setCreating] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirm, setAdminConfirm] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminError, setAdminError] = useState("");
  const [created, setCreated] = useState(false);

  /**
   * La question est posée à CHAQUE chargement de la page : le compte a pu être
   * créé entre-temps, depuis un autre poste. Le garde d'annulation évite de
   * répondre à une page déjà quittée.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Quoi qu'il arrive, la page doit sortir de l'attente : une exception ici
      // laisserait `state` à `null` pour toujours, et l'écran sans explication.
      let found: SchemaState = "unreachable";
      try {
        found = await schemaState();
      } catch (err) {
        console.error("[supabase] état du schéma", err);
      }
      if (!cancelled) setState(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAdmin = useCallback(async () => {
    setState(await schemaState());
  }, []);

  const enter = async (login: string, secret: string) => {
    setError("");
    setBusy(true);
    try {
      const user = await signIn(login, secret);
      router.replace(roleHome(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.invalidCredentials"));
      setBusy(false);
    }
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    void enter(email, password);
  };

  /**
   * Crée le compte, puis RETIRE le formulaire et le bouton : la base refuse de
   * toute façon un second amorçage, mais l'écran ne doit pas continuer à
   * proposer quelque chose qui n'a plus lieu d'être.
   *
   * L'email et le mot de passe qui viennent d'être choisis sont recopiés dans
   * le formulaire de connexion — c'est la seule chose qu'on ait envie de faire
   * ensuite.
   */
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");

    if (!adminEmail.trim()) {
      setAdminError("L'email est obligatoire.");
      return;
    }
    if (adminPassword.length < 6) {
      setAdminError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (adminPassword !== adminConfirm) {
      setAdminError("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setBusy(true);
    try {
      await bootstrapAdmin(adminEmail, adminPassword, adminName);
      setEmail(adminEmail.trim().toLowerCase());
      setPassword(adminPassword);
      setState("ready");
      setCreating(false);
      setCreated(true);
      setAdminPassword("");
      setAdminConfirm("");
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "La création du compte a échoué.");
      // La base a peut-être été amorcée entre-temps par quelqu'un d'autre.
      void refreshAdmin();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas p-4">
      {/* Decorative gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-primary blur-3xl opacity-30" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gradient-danger blur-3xl opacity-30" />
      </div>

      {/* Top controls */}
      <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-0 my-8 w-full max-w-md rounded-3xl border border-line bg-surface p-8 card-shadow-lg"
      >
        {/* Logo + school name */}
        <div className="flex flex-col items-center text-center">
          <div className="login-logo-frame card-shadow">
            <div className="h-20 w-20 rounded-[1.25rem] bg-surface flex items-center justify-center overflow-hidden">
              {school.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.logo}
                  alt={school.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/10 to-accent/25">
                  {/* Le blason à l'épée — le même dessin que l'icône d'onglet
                      et que l'écusson de la barre latérale. */}
                  <svg viewBox="0 0 24 24" className="h-10 w-10 text-accent-ink" aria-hidden="true">
                    <path
                      d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
                      fill="currentColor"
                      opacity="0.18"
                    />
                    <path
                      d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 6.4v10.2M9.4 10.4h5.2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
          <h1 className="font-display login-name-gradient mt-4 text-2xl font-extrabold">{school.name}</h1>
          <p className="mt-1 text-sm text-muted">{t("auth.signInSubtitle")}</p>
        </div>

        {/* Sign in */}
        <form onSubmit={handleSignIn} className="mt-7 space-y-3">
          <Input
            type="text"
            autoComplete="username"
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        {/*
          LE COMPTE D'ADMINISTRATION — proposé UNIQUEMENT tant qu'il n'en existe
          aucun. Dès qu'il est créé, ce bloc disparaît définitivement : la
          question est reposée à la base à chaque chargement de la page, et la
          base elle-même refuse un second amorçage.
        */}
        {state === null && (
          <p className="mt-6 text-center text-xs text-muted">Vérification du club…</p>
        )}

        {needsAdmin && (
          <div className="mt-6 border-t border-line pt-6">
            {!creating ? (
              <>
                <p className="text-center text-xs leading-relaxed text-muted">
                  {state === "unreachable" ? (
                    <>
                      Impossible de vérifier si ce club a déjà un compte
                      d&apos;administration ({lastSchemaError()}). Vous pouvez essayer de le
                      créer&nbsp;: s&apos;il en existe déjà un, la base le dira.
                    </>
                  ) : (
                    <>
                      Ce club n&apos;a encore aucun compte. Créez celui de
                      l&apos;administration pour commencer — il n&apos;est proposé qu&apos;une
                      fois.
                    </>
                  )}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={() => setCreating(true)}
                >
                  <ShieldPlus className="h-4 w-4" />
                  Créer le compte administrateur
                </Button>
              </>
            ) : (
              <form onSubmit={handleCreateAdmin} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-body">
                  <ShieldPlus className="h-4 w-4 text-primary" />
                  Compte administrateur
                </div>
                <Input
                  type="text"
                  placeholder="Nom affiché (Direction)"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="Email de connexion"
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    setAdminError("");
                  }}
                />
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mot de passe (6 caractères minimum)"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminError("");
                  }}
                />
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirmer le mot de passe"
                  value={adminConfirm}
                  onChange={(e) => {
                    setAdminConfirm(e.target.value);
                    setAdminError("");
                  }}
                />
                {adminError && <p className="text-sm font-medium text-danger">{adminError}</p>}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => {
                      setCreating(false);
                      setAdminError("");
                    }}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" className="flex-1" disabled={busy}>
                    {busy ? "Création…" : "Créer le compte"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/*
          LE PROJET RÉPOND, MAIS LA BASE EST VIDE DE TOUT SCHÉMA. Personne ne
          peut ni se connecter ni créer quoi que ce soit tant que
          `supabase/schema.sql` n'a pas été exécuté : le dire est la seule chose
          utile à afficher.
        */}
        {state === "not-installed" && (
          <p className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-center text-xs font-medium leading-relaxed text-warning">
            La base de ce club n&apos;est pas encore installée. Exécutez{" "}
            <code className="font-bold">supabase/schema.sql</code> dans le SQL Editor de votre
            projet Supabase, puis rechargez cette page.
          </p>
        )}

        {created && (
          <p className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-3 text-center text-xs font-medium leading-relaxed text-success">
            Le compte administrateur est créé. Ses identifiants sont déjà
            saisis&nbsp;: connectez-vous pour ouvrir le club.
          </p>
        )}
      </motion.div>
    </div>
  );
}
