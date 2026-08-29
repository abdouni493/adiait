"use client";

/**
 * LE FOND DE LA PORTE D'ENTRÉE — une chevauchée.
 *
 * La page de connexion est la première chose qu'on voit du club, et c'était
 * jusqu'ici deux taches floues sur un fond gris. Elle porte maintenant ce que
 * l'Ordre a de plus reconnaissable : des CHEVAUX au galop, en silhouette, qui
 * traversent lentement l'écran sur trois plans de profondeur.
 *
 * TOUT EST DESSINÉ ICI, EN SVG. Aucune image n'est chargée : rien à héberger,
 * rien à attendre, et la silhouette prend la couleur du thème — encre d'acier
 * le jour, or pâle la nuit — au lieu d'un PNG qui jurerait dans l'un des deux.
 *
 * LE MOUVEMENT EST DÉCORATIF, DONC IL SE TAIT QUAND ON LE LUI DEMANDE :
 * `prefers-reduced-motion` fige la chevauchée (règle globale de `globals.css`),
 * et la page reste exactement aussi lisible.
 */

/** Le cheval, dessiné une fois puis réutilisé à trois échelles. */
function HorseSymbol() {
  return (
    <symbol id="heraldic-horse" viewBox="0 0 200 140">
      {/* Le corps, l'encolure et la tête — d'un seul tenant, du chanfrein
          jusqu'à la croupe. */}
      <path
        d="M188 46 C184 34 178 24 170 18 L166 5 L159 17 L154 15 L148 4 L146 19
           C134 22 120 28 110 36 C98 32 84 28 70 28 C58 28 50 31 44 35
           C42 30 41 25 40 21 C28 10 16 6 4 8 C16 17 26 27 34 37
           C36 46 38 54 40 60 C48 66 60 70 74 72 C88 74 100 74 110 70
           C114 64 114 58 116 53 C130 49 152 47 188 46 Z"
      />
      {/* La crinière, posée par-dessus l'encolure. */}
      <path d="M150 20 C138 24 126 30 116 38 C122 30 132 23 146 18 Z" opacity="0.75" />
      {/* La queue, qui file derrière. */}
      <path
        d="M42 30 C30 22 18 18 4 18 C16 26 26 34 34 42 C36 38 38 33 42 30 Z"
        opacity="0.85"
      />
      {/* Les quatre membres : deux qui poussent, deux qui étendent. */}
      <path d="M44 56 C50 54 55 58 55 64 L50 86 L58 108 L62 120 L50 122 L42 102 L36 82 C34 70 36 61 44 56 Z" />
      <path d="M58 62 C64 60 69 64 69 70 L66 90 L60 110 L58 122 L46 120 L52 100 L54 80 C54 70 54 65 58 62 Z" opacity="0.9" />
      <path d="M104 62 C110 60 116 64 118 70 L126 88 L140 104 L150 114 L140 122 L126 106 L112 88 C106 80 102 70 104 62 Z" />
      <path d="M92 64 C98 62 103 66 103 72 L98 92 L94 112 L94 124 L82 122 L86 102 L88 82 C88 72 88 67 92 64 Z" opacity="0.9" />
    </symbol>
  );
}

export function HeraldicBackdrop() {
  return (
    <div className="heraldic-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Le champ : deux nappes de couleur qui respirent lentement. */}
      <div className="heraldic-glow heraldic-glow-steel" />
      <div className="heraldic-glow heraldic-glow-gold" />

      {/* Les lices — des lignes d'or très pâles, comme un parchemin réglé. */}
      <div className="heraldic-lists" />

      {/* La chevauchée : trois plans, trois vitesses, trois opacités. */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice">
        <defs>
          <HorseSymbol />
        </defs>

        <g className="heraldic-charge heraldic-charge-far" fill="currentColor">
          <use href="#heraldic-horse" x="0" y="0" width="200" height="140" />
        </g>
        <g className="heraldic-charge heraldic-charge-mid" fill="currentColor">
          <use href="#heraldic-horse" x="0" y="0" width="300" height="210" />
        </g>
        <g className="heraldic-charge heraldic-charge-near" fill="currentColor">
          <use href="#heraldic-horse" x="0" y="0" width="440" height="308" />
        </g>
      </svg>

      {/* La poussière soulevée par les sabots. */}
      <div className="heraldic-dust">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`heraldic-mote heraldic-mote-${i % 7}`} />
        ))}
      </div>
    </div>
  );
}
