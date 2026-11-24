/**
 * Les grilles de l'égaliseur GRAPHIQUE, partagées par l'écran Égaliseur et
 * le panneau TESS (lot W2) : une seule définition, sinon les deux écrans
 * finiraient par écrire des courbes que l'autre ne reconnaît plus comme
 * graphiques (`estCourbeGraphique`, et `est_courbe_graphique` côté serveur,
 * `tune-core/src/tess/migration.rs`).
 *
 * Grilles ISO : octave (10), 2/3 d'octave (15), 1/3 d'octave (31) — les
 * repères de REW. Q adapté à la largeur de bande ; 10 bandes garde le 1.0
 * historique pour ne pas changer le rendu des réglages existants.
 */
export const GRILLES_EQ: Record<number, number[]> = {
  10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
  31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
       1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
};
export const Q_GRILLE_EQ: Record<number, number> = { 10: 1.0, 15: 2.15, 31: 4.32 };

/** Rééchantillonne une courbe d'une grille vers une autre, par plus proche
 *  voisin en fréquence : changer de résolution ne doit jamais remettre la
 *  courbe à plat. */
export function reechantillonnerCourbe(src: number[], from: number[], to: number[]): number[] {
  return to.map((f) => {
    let best = 0, d = Infinity;
    from.forEach((g, i) => { const dd = Math.abs(Math.log2(f / g)); if (dd < d) { d = dd; best = i; } });
    return src[best] ?? 0;
  });
}
