"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { ThemeToggle } from "@/components/controls/ThemeToggle";
import { LanguageSwitcher } from "@/components/controls/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useData } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";
import { roleHome } from "@/lib/nav";
import { FAMILY_ACCOUNTS, QUICK_ACCOUNTS, type QuickAccount } from "@/lib/demo/accounts";

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
  /** Le bouton d'accès rapide en cours — pour n'occuper que celui-là. */
  const [pendingRole, setPendingRole] = useState<string>("");

  const enter = async (login: string, secret: string, role = "") => {
    setError("");
    setBusy(true);
    setPendingRole(role);
    try {
      const user = await signIn(login, secret);
      router.replace(roleHome(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.invalidCredentials"));
      setBusy(false);
      setPendingRole("");
    }
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    void enter(email, password);
  };

  /** Un accès rapide : le compte est connu, il n'y a rien à taper. */
  const QuickButton = ({ account, compact }: { account: QuickAccount; compact?: boolean }) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => void enter(account.email, account.password, account.role)}
      className={
        compact
          ? "flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-body disabled:opacity-50"
          : "group flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas p-3 text-start transition hover:border-primary/50 hover:bg-surface disabled:opacity-50"
      }
    >
      <span aria-hidden className={compact ? "text-base" : "text-2xl"}>
        {account.emoji}
      </span>
      {compact ? (
        <span>{t(account.labelKey)}</span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-body">{t(account.labelKey)}</span>
          <span className="block truncate text-xs text-muted">{t(account.hintKey)}</span>
        </span>
      )}
      {!compact && (
        <span
          aria-hidden
          className="text-lg text-muted transition group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-180"
        >
          {pendingRole === account.role ? "…" : "→"}
        </span>
      )}
    </button>
  );

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
                <div className="flex h-full w-full items-center justify-center text-4xl bg-gradient-to-br from-red-500/10 to-red-500/20">
                  🏫
                </div>
              )}
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold login-name-gradient">{school.name}</h1>
          <p className="mt-1 text-sm text-muted">{t("auth.signInSubtitle")}</p>
        </div>

        {/* Sign in */}
        <form onSubmit={handleSignIn} className="mt-7 space-y-3">
          <Input
            type="email"
            autoComplete="email"
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
            {busy && !pendingRole ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        {/*
          L'ACCÈS RAPIDE DE LA DÉMONSTRATION.

          Cette version ne se connecte à aucune base : ses comptes sont connus
          d'avance. Plutôt que de faire recopier une adresse et un mot de passe
          à un visiteur qui découvre l'application, chaque rôle a son bouton —
          un clic, et on est à l'intérieur, avec les droits qui vont avec.
        */}
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("auth.quick.title")}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="space-y-2">
          {QUICK_ACCOUNTS.map((account) => (
            <QuickButton key={account.role} account={account} />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {FAMILY_ACCOUNTS.map((account) => (
            <QuickButton key={account.role} account={account} compact />
          ))}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          {t("auth.quick.note")}
        </p>
      </motion.div>
    </div>
  );
}
