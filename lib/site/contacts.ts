"use client";

/**
 * LES LIENS DE CONTACT DU CLUB, PRÊTS À ÊTRE CLIQUÉS.
 *
 * Ce que l'intendance saisit dans « Site web › Coordonnées » n'est pas toujours
 * une adresse complète : on tape « @ordre_des_chevaliers » pour Instagram, un
 * numéro pour WhatsApp, parfois l'adresse entière. Ce fichier est le seul
 * endroit qui transforme CE QU'ON A TAPÉ en CE QU'ON PEUT CLIQUER — sans quoi
 * chaque bouton du site devrait deviner à sa façon, et l'un d'eux finirait par
 * se tromper.
 *
 * UN CHAMP VIDE NE PRODUIT PAS DE LIEN. C'est ce qui fait qu'un club sans
 * TikTok n'a pas de bouton TikTok mort dans son pied de page.
 */

import { BRAND_MARKS } from "@/components/website/BrandIcons";
import type { School } from "@/lib/types";

export type SocialKey = keyof typeof BRAND_MARKS;

export interface SocialLink {
  key: SocialKey;
  href: string;
  label: string;
  Mark: (typeof BRAND_MARKS)[SocialKey];
}

/** Une adresse déjà complète est laissée telle quelle ; le reste est préfixé. */
function urlFor(key: SocialKey, raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  // WhatsApp est le seul à ne pas attendre un nom mais un NUMÉRO : on ne garde
  // que les chiffres, le « + » compris dans l'indicatif international.
  if (key === "whatsapp") {
    const digits = value.replace(/[^\d]/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  }

  const handle = value.replace(/^@/, "");
  const base: Record<Exclude<SocialKey, "whatsapp">, string> = {
    facebook: "https://facebook.com/",
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/@",
    snapchat: "https://snapchat.com/add/",
  };
  return `${base[key as Exclude<SocialKey, "whatsapp">]}${handle}`;
}

const LABELS: Record<SocialKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
};

/** Les réseaux que le club a effectivement renseignés, dans l'ordre du site. */
export function socialLinksOf(school: School): SocialLink[] {
  const raw: Record<SocialKey, string | undefined> = {
    facebook: school.siteFacebook,
    instagram: school.siteInstagram,
    tiktok: school.siteTiktok,
    snapchat: school.siteSnapchat,
    whatsapp: school.siteWhatsapp,
  };

  return (Object.keys(raw) as SocialKey[])
    .map((key) => ({
      key,
      href: urlFor(key, raw[key] ?? ""),
      label: LABELS[key],
      Mark: BRAND_MARKS[key],
    }))
    .filter((link) => link.href.length > 0);
}

/**
 * L'ADRESSE D'UNE VIDÉO, RAMENÉE À CE QU'UN CADRE SAIT JOUER.
 *
 * On colle l'adresse d'une vidéo comme on la voit dans la barre du navigateur —
 * `youtube.com/watch?v=…`, `youtu.be/…` — et cette adresse-là ne s'affiche PAS
 * dans un `<iframe>` : YouTube la refuse. C'est ici qu'elle devient une adresse
 * d'intégration.
 *
 * Un fichier ordinaire (`.mp4`, `.webm`) n'a lui besoin d'aucun cadre : il est
 * rendu tel quel, et le site le joue dans une balise `<video>`.
 */
export type SiteVideo =
  | { kind: "embed"; src: string }
  | { kind: "file"; src: string }
  | null;

export function siteVideoOf(url?: string): SiteVideo {
  const value = (url ?? "").trim();
  if (!value) return null;

  const youtube =
    value.match(/[?&]v=([\w-]{6,})/) ??
    value.match(/youtu\.be\/([\w-]{6,})/) ??
    value.match(/youtube\.com\/embed\/([\w-]{6,})/) ??
    value.match(/youtube\.com\/shorts\/([\w-]{6,})/);
  if (youtube) return { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${youtube[1]}` };

  const vimeo = value.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { kind: "embed", src: `https://player.vimeo.com/video/${vimeo[1]}` };

  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value)) return { kind: "file", src: value };

  // Une adresse qu'on ne reconnaît pas est tentée dans un cadre : c'est ce qui
  // marche pour la plupart des hébergeurs, et cela vaut mieux que de ne rien
  // afficher du tout.
  return { kind: "embed", src: value };
}
