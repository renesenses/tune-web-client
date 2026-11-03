/**
 * Jetons de couleur du client web — la liste de référence (#2520).
 *
 * Tous les thèmes (`V2_THEMES`, `styles/tune-v2.css`) passent par ces jetons
 * `--v2-*` : aucun composant ne code une couleur en dur. Un thème qui en
 * oublie un laisse l'élément sans couleur, sans erreur. La garde
 * `themeMozaiklabsLogo2520.test.ts` vérifie que CHAQUE thème les définit tous,
 * et que la lisibilité (WCAG AA) tient pour ceux qui portent du texte.
 *
 * Cette liste est la base que le futur greffon « Mon thème » (#2527) réutilise :
 * il n'a qu'à produire une valeur pour chacun, ou en dériver la plupart d'un
 * petit nombre de couleurs choisies (fond, texte, accent).
 */
export const V2_JETONS = {
  /** Plans : fond, fond 2, surface flottante, surface de choix, survol. */
  fonds: ['--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2', '--v2-hover'],
  /** Texte : principal, secondaire, atténué (tous trois ≥ 4,5:1 sur les fonds). */
  textes: ['--v2-txt', '--v2-txt2', '--v2-txt3'],
  /** Accent (texte et icône ≥ 4,5:1), fin du dégradé (remplissage, ≥ 3:1),
   *  teinte lisible sur fond teinté, et texte posé SUR l'accent. */
  accent: ['--v2-acc1', '--v2-acc2', '--v2-acc-tint', '--v2-on-acc'],
  /** Filets. */
  bordures: ['--v2-line', '--v2-line2'],
  /** États : sélection, lecteur, erreur. */
  etats: [
    '--v2-active1', '--v2-active2', '--v2-player1', '--v2-player2',
    '--v2-danger', '--v2-danger-soft', '--v2-danger-bd',
  ],
} as const;

/** Les couleurs du logo Mozaiklabs, mesurées sur `logo_centered_hd.png`. */
export const MOZAIKLABS_PALETTE = {
  jaune: '#FFEB27',
  vertClair: '#83DC57',
  vert: '#2A9F5B',
  turquoise: '#28BA9B',
  cyan: '#27C7E4',
  bleu: '#387CBF',
  noir: '#000000',
  blanc: '#FFFFFF',
} as const;
