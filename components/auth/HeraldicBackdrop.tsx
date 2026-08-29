"use client";

/**
 * LE FOND DE LA PORTE D'ENTRÉE — la photographie du club.
 *
 * La page de connexion est la première chose qu'on voit de l'Ordre, et c'était
 * jusqu'ici deux taches floues sur un fond gris. Elle porte maintenant l'image
 * du club elle-même : l'allée au coucher du soleil, le cheval au portail, et le
 * blason.
 *
 * TROIS COUCHES, ET RIEN DE PLUS :
 *
 *   1. LA PHOTOGRAPHIE, qui respire — un très lent mouvement d'appareil
 *      (zoom et translation) sur vingt-huit secondes. Assez ample pour que
 *      l'image soit vivante, assez lent pour qu'on ne le remarque jamais
 *      pendant qu'on tape son mot de passe.
 *   2. LE VOILE, qui assombrit le côté où se pose le formulaire. C'est lui qui
 *      rend le texte lisible sur une photographie qu'on ne contrôle pas, et il
 *      travaille à toutes les tailles d'écran plutôt qu'à une seule.
 *   3. LA POUSSIÈRE D'OR, quelques grains qui montent lentement — le seul
 *      mouvement qu'on voie vraiment, et il est discret.
 *
 * LE MOUVEMENT EST DÉCORATIF, DONC IL SE TAIT QUAND ON LE LUI DEMANDE :
 * `prefers-reduced-motion` fige tout (règle globale de `globals.css`), et la
 * page reste exactement aussi lisible.
 */

export function HeraldicBackdrop() {
  return (
    <div className="heraldic-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* 1. La photographie, qui respire lentement. */}
      <div className="heraldic-photo" />

      {/* 2. Le voile : sombre là où le formulaire se pose, transparent sur le
             cheval et le blason. Deux dégradés — l'un horizontal pour les
             grands écrans, l'autre vertical pour les téléphones, où la carte
             occupe le bas plutôt que la droite. */}
      <div className="heraldic-scrim" />
      <div className="heraldic-vignette" />

      {/* 3. La poussière soulevée par les sabots. */}
      <div className="heraldic-dust">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`heraldic-mote heraldic-mote-${i % 7}`} />
        ))}
      </div>
    </div>
  );
}
