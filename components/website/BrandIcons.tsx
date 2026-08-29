/**
 * LES MARQUES DES RÉSEAUX SOCIAUX, DESSINÉES ICI.
 *
 * `lucide-react` ne porte plus les logos de marque depuis sa version 1 : ni
 * Facebook, ni Instagram, ni TikTok, ni Snapchat. Les remplacer par des icônes
 * génériques — un appareil photo pour Instagram, une note de musique pour TikTok
 * — obligerait le visiteur à LIRE l'étiquette pour savoir où il clique, alors
 * qu'un logo se reconnaît sans un mot. Sur une page d'accueil, cela compte.
 *
 * Ce sont donc six tracés, écrits à la main, qui suivent la couleur du texte
 * (`currentColor`) et la taille qu'on leur donne — exactement comme les icônes
 * de la bibliothèque, pour qu'ils se mélangent aux autres sans se voir.
 */

type IconProps = { className?: string };

export function FacebookMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

export function InstagramMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5.25"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.35" cy="6.65" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function TiktokMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 2h-2.9v13.4a2.6 2.6 0 1 1-2.14-2.56v-2.95a5.5 5.5 0 1 0 5.04 5.48V8.9a6.6 6.6 0 0 0 3.9 1.27V7.22A3.83 3.83 0 0 1 16.6 3.5V2Z" />
    </svg>
  );
}

export function SnapchatMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.2c2.7 0 4.5 2 4.6 4.6 0 .7-.05 1.4-.1 2 .3.15.65.1 1-.05.55-.25 1.2.05 1.3.6.1.5-.3.85-.85 1.1-.5.25-1.2.45-1.3.8-.1.35.35 1 .9 1.7.7.9 1.65 1.8 2.75 2.15.4.15.5.5.35.8-.3.6-1.45.95-2.5 1.1-.35.05-.45.2-.5.55-.05.3-.1.65-.2.95-.1.3-.3.4-.65.35-.5-.1-1.05-.2-1.7-.2-.4 0-.8.05-1.15.2-.75.3-1.35 1.1-2.6 1.1s-1.85-.8-2.6-1.1c-.35-.15-.75-.2-1.15-.2-.65 0-1.2.1-1.7.2-.35.05-.55-.05-.65-.35-.1-.3-.15-.65-.2-.95-.05-.35-.15-.5-.5-.55-1.05-.15-2.2-.5-2.5-1.1-.15-.3-.05-.65.35-.8 1.1-.35 2.05-1.25 2.75-2.15.55-.7 1-1.35.9-1.7-.1-.35-.8-.55-1.3-.8-.55-.25-.95-.6-.85-1.1.1-.55.75-.85 1.3-.6.35.15.7.2 1 .05-.05-.6-.1-1.3-.1-2C7.5 4.2 9.3 2.2 12 2.2Z" />
    </svg>
  );
}

export function WhatsappMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.18-1.36a9.93 9.93 0 0 0 4.86 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.9 9.9 0 0 0 12.04 2Zm0 1.8c2.18 0 4.23.85 5.77 2.4a8.1 8.1 0 0 1 2.39 5.76c0 4.5-3.66 8.16-8.17 8.16a8.15 8.15 0 0 1-4.15-1.14l-.3-.18-3.07.8.82-3-.2-.31a8.1 8.1 0 0 1-1.25-4.33c0-4.5 3.66-8.16 8.16-8.16Zm-3.1 4.13c-.15 0-.4.06-.6.29-.21.23-.8.78-.8 1.9 0 1.13.82 2.21.93 2.36.11.15 1.6 2.45 3.89 3.43.54.24.97.38 1.3.48.55.17 1.05.15 1.44.09.44-.07 1.35-.55 1.55-1.09.19-.53.19-.99.13-1.08-.05-.1-.2-.15-.43-.27-.23-.11-1.35-.66-1.55-.74-.21-.08-.36-.11-.51.12-.15.22-.58.73-.71.88-.13.15-.26.17-.49.06-.23-.12-.97-.36-1.85-1.14-.68-.61-1.14-1.36-1.28-1.59-.13-.23-.01-.35.1-.47.1-.1.23-.26.34-.4.11-.13.15-.22.23-.37.07-.15.03-.28-.02-.4-.06-.11-.51-1.24-.7-1.7-.19-.44-.38-.38-.51-.39h-.46Z" />
    </svg>
  );
}

/** Le rendu générique — le site s'en sert pour boucler sur ses réseaux. */
export const BRAND_MARKS = {
  facebook: FacebookMark,
  instagram: InstagramMark,
  tiktok: TiktokMark,
  snapchat: SnapchatMark,
  whatsapp: WhatsappMark,
} as const;
