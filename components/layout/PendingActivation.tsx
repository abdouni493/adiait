"use client";

/**
 * L'ÉCRAN D'UN COMPTE QUI ATTEND SON ACTIVATION.
 *
 * Une famille a créé son compte depuis la page de connexion. Le compte existe
 * vraiment — il se connecte, son mot de passe fonctionne — mais il ne pilote
 * encore AUCUNE fiche : ni chevalier, ni parent. Lui ouvrir l'application
 * reviendrait à lui montrer des écrans vides dont il ne comprendrait rien.
 *
 * Il ne voit donc que TROIS choses : le blason du club, son nom, et la phrase
 * qui dit ce qu'il attend. Aucune barre latérale, aucun bouton d'écran — parce
 * qu'aucun écran n'aurait quoi que ce soit à lui montrer.
 *
 * La déconnexion, elle, reste là : c'est la seule action qui ait un sens ici.
 */

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Hourglass, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/controls/ThemeToggle";
import { useData } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";

export function PendingActivation() {
  const router = useRouter();
  const school = useData((s) => s.school);
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const initSession = useSession((s) => s.initSession);

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas p-4">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-primary opacity-25 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gradient-accent opacity-20 blur-3xl" />
      </div>

      <div className="absolute end-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center card-shadow-lg"
      >
        {/* Le blason et le nom du club — tout ce qu'un compte non activé voit */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.25rem] border border-line bg-canvas">
          {school.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logo} alt={school.name} className="h-full w-full object-cover" />
          ) : (
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
              <path d="M12 6.4v10.2M9.4 10.4h5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <h1 className="font-display mt-4 text-2xl font-extrabold text-ink">{school.name}</h1>

        <motion.div
          animate={{ rotate: [0, 180, 360] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning"
        >
          <Hourglass className="h-6 w-6" />
        </motion.div>

        <h2 className="mt-4 text-base font-bold text-ink">
          Votre compte attend son activation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Votre demande a bien été transmise à l&apos;intendance du club. Dès qu&apos;elle
          aura rattaché votre compte à votre fiche, vous verrez ici vos séances, vos
          présences, vos paiements et les annonces.
        </p>

        {user && (
          <p className="mt-4 rounded-2xl border border-line bg-canvas/60 p-3 text-xs text-muted">
            Compte&nbsp;: <strong className="text-ink">{user.email}</strong>
            <br />
            Rôle demandé&nbsp;:{" "}
            <strong className="text-ink">
              {user.role === "parent" ? "Parent" : "Chevalier"}
            </strong>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1 gap-2" onClick={() => void initSession()}>
            <RefreshCw className="h-4 w-4" /> Vérifier maintenant
          </Button>
          <Button variant="ghost" className="flex-1 gap-2 text-danger" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" /> Se déconnecter
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
