import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";

/**
 * LE SITE PUBLIC DU CLUB.
 *
 * Il vit HORS du groupe `(app)` : `AppShell` renvoie à la connexion tout
 * visiteur sans session, ce qui est exactement ce qu'il ne faut pas faire d'une
 * vitrine. Seule la mise en page racine s'applique ici — les polices, le thème
 * et la direction d'écriture — puis la coquille du site.
 *
 * LE TITRE ET L'ICÔNE DE L'ONGLET sont POSÉS PAR `SiteShell` une fois la fiche
 * du club lue : ils appartiennent au club, pas au code. Ceux déclarés ici ne
 * servent qu'au premier rendu, avant que quoi que ce soit soit lu — et à ce que
 * voit un robot d'indexation.
 */
export const metadata: Metadata = {
  title: "Le club",
  description:
    "Les formations, les évènements et les coordonnées du club — inscrivez-vous en ligne.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
