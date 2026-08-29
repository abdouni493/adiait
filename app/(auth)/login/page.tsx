"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, ShieldPlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { ThemeToggle } from "@/components/controls/ThemeToggle";
import { LanguageSwitcher } from "@/components/controls/LanguageSwitcher";
import { HeraldicBackdrop } from "@/components/auth/HeraldicBackdrop";
import { SignupFlow } from "@/components/auth/SignupFlow";
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
   * DEUX PORTES, UNE SEULE CARTE.
   *
   *  `signin` — la porte de tous les jours : on entre.
   *  `signup` — celle que les FAMILLES poussent elles-mêmes, pour se créer un
   *             compte sans passer par le comptoir.
   *
   * Elles partagent la même carte plutôt que deux pages : on bascule de l'une
   * à l'autre sans jamais perdre le blason ni le nom du club de vue.
   */
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  /**
   * LE PREMIER ADMINISTRATEUR.
   *
   * Un club qui vient d'être installé n'a AUCUN compte : personne ne peut se
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
   */
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");

    if (!adminEmail.trim()) {
      setAdminError(t("auth.emailRequired"));
      return;
    }
    if (adminPassword.length < 6) {
      setAdminError(t("auth.passwordTooShort"));
      return;
    }
    if (adminPassword !== adminConfirm) {
      setAdminError(t("auth.passwordsDiffer"));
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
      setAdminError(err instanceof Error ? err.message : t("auth.createFailed"));
      // La base a peut-être été amorcée entre-temps par quelqu'un d'autre.
      void refreshAdmin();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas p-4">
      {/* La photographie du club, et les voiles qui la rendent lisible. */}
      <HeraldicBackdrop />

      {/* Top controls */}
      <div className="absolute end-4 top-4 z-20 flex items-center gap-2">
        {/*
          LA PORTE DU DEHORS.

          Quelqu'un qui arrive sur la connexion n'est pas toujours un membre :
          c'est parfois un parent qui cherche les formations du club et qui est
          tombé là. Le site s'ouvre donc d'ici — dans un AUTRE ONGLET, pour que
          celui qui allait vraiment se connecter retrouve son formulaire intact.
        */}
        <a
          href="/site"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-accent/35 bg-surface/85 px-3 py-2 text-sm font-semibold text-ink backdrop-blur transition-colors hover:border-accent/60 hover:bg-surface"
        >
          <Globe className="h-4 w-4 text-accent-ink" />
          <span className="hidden sm:inline">{t("auth.visitWebsite")}</span>
        </a>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      {/*
        LA CARTE SE POSE À DROITE — et elle y reste, quelle que soit la langue.

        Ce n'est pas un goût : la photographie a été composée ainsi. Le cheval
        et le blason tiennent la MOITIÉ GAUCHE, et le photographe a laissé à
        droite une plage vide, à hauteur des yeux, dont le cadre attend un
        formulaire. La carte s'y pose donc, et l'image redevient ce qu'elle
        était : une seule composition, et non un panneau collé sur un sujet.

        Les marges logiques (`ms`/`me`) s'inversent en arabe : la carte aurait
        traversé l'écran le jour où l'on est passé au RTL. Elle est donc calée
        avec des marges PHYSIQUES (`ml-auto`), qui ne dépendent d'aucune
        direction d'écriture — le formulaire de connexion se trouve toujours au
        même endroit, pour tout le monde.

        AUCUN LOGO ICI SUR GRAND ÉCRAN. Le blason et le nom du club sont peints
        dans la photographie : les réafficher par-dessus donnerait deux fois la
        même chose, l'une sur l'autre. Ils reparaissent DANS la carte sur les
        petits écrans, où le cadrage de l'image les laisse hors champ.
      */}
      <div className="relative z-10 my-8 flex w-full justify-center lg:block">
        {/* ---- La carte : connexion, création de compte, amorçage ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          /* La carte occupe le quart DROIT de l'image — la plage que la
             photographie laisse libre. `ml-auto` et `mr-[5%]` sont des marges
             physiques : elles ne s'inversent pas en arabe, donc la carte ne
             traverse pas l'écran quand la page passe en RTL. */
          className="w-full max-w-[400px] rounded-3xl border border-accent/25 bg-surface/95 p-7 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.75)] backdrop-blur-md lg:ml-auto lg:mr-[5%]"
        >
          {/* Le blason et le nom, repris ICI sur les petits écrans où la
              colonne de gauche n'a pas la place d'exister. */}
          <div className="mb-2 flex flex-col items-center text-center lg:hidden">
            <div className="login-logo-frame card-shadow">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.25rem] bg-surface">
                {school.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={school.logo} alt={school.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/10 to-accent/25">
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
            <h1 className="font-display login-name-gradient mt-4 text-2xl font-extrabold">
              {school.name}
            </h1>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {mode === "signup" ? (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.16 } }}
                className="mt-6 lg:mt-0"
              >
                <SignupFlow onCancel={() => setMode("signin")} />
              </motion.div>
            ) : (
              <motion.div
                key="signin"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
              >
                <p className="mt-6 text-center text-sm text-muted lg:mt-0">
                  {t("auth.signInSubtitle")}
                </p>

                {/* Sign in */}
                <form onSubmit={handleSignIn} className="mt-6 space-y-3">
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
                  LA PORTE DES FAMILLES.

                  Un chevalier ou un parent n'a plus à se déplacer pour obtenir un
                  accès : il crée son compte ici, et l'intendance n'a plus qu'à le
                  rattacher à sa fiche.
                */}
                <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-wash/50 p-4 text-center">
                  <p className="text-xs font-semibold text-ink">{t("auth.noAccountYet")}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    <strong className="text-ink">{t("auth.parentLabel")}&nbsp;:</strong>{" "}
                    {t("auth.parentPitch")}
                    <br />
                    <strong className="text-ink">{t("auth.studentLabel")}&nbsp;:</strong>{" "}
                    {t("auth.studentPitch")}
                  </p>
                  <Button
                    type="button"
                    variant="accent"
                    size="lg"
                    className="mt-3 w-full gap-2"
                    onClick={() => setMode("signup")}
                  >
                    <UserPlus className="h-4 w-4" /> {t("auth.createMyAccount")}
                  </Button>
                </div>

                {/*
                  LE COMPTE D'ADMINISTRATION — proposé UNIQUEMENT tant qu'il n'en
                  existe aucun. Dès qu'il est créé, ce bloc disparaît définitivement.
                */}
                {state === null && (
                  <p className="mt-6 text-center text-xs text-muted">{t("auth.checkingClub")}</p>
                )}

                {needsAdmin && (
                  <div className="mt-6 border-t border-line pt-6">
                    {!creating ? (
                      <>
                        <p className="text-center text-xs leading-relaxed text-muted">
                          {state === "unreachable"
                            ? t("auth.cannotVerify", { error: lastSchemaError() })
                            : t("auth.noAdminYet")}
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
                          {t("auth.createAdmin")}
                        </Button>
                      </>
                    ) : (
                      <form onSubmit={handleCreateAdmin} className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-body">
                          <ShieldPlus className="h-4 w-4 text-primary" />
                          {t("auth.adminAccount")}
                        </div>
                        <Input
                          type="text"
                          placeholder={t("auth.adminDisplayName")}
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                        />
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder={t("auth.adminLoginEmail")}
                          value={adminEmail}
                          onChange={(e) => {
                            setAdminEmail(e.target.value);
                            setAdminError("");
                          }}
                        />
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={t("auth.adminPasswordMin")}
                          value={adminPassword}
                          onChange={(e) => {
                            setAdminPassword(e.target.value);
                            setAdminError("");
                          }}
                        />
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={t("auth.adminConfirmPassword")}
                          value={adminConfirm}
                          onChange={(e) => {
                            setAdminConfirm(e.target.value);
                            setAdminError("");
                          }}
                        />
                        {adminError && (
                          <p className="text-sm font-medium text-danger">{adminError}</p>
                        )}
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
                            {t("common.cancel")}
                          </Button>
                          <Button type="submit" className="flex-1" disabled={busy}>
                            {busy ? t("auth.creating") : t("auth.createTheAccount")}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/*
                  LE PROJET RÉPOND, MAIS LA BASE EST VIDE DE TOUT SCHÉMA.
                */}
                {state === "not-installed" && (
                  <p className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-center text-xs font-medium leading-relaxed text-warning">
                    {t("auth.schemaMissing")}
                  </p>
                )}

                {created && (
                  <p className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-3 text-center text-xs font-medium leading-relaxed text-success">
                    {t("auth.adminReady")}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
