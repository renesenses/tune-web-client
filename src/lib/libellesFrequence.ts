/**
 * Les paliers du filtre « Fréquence » de la Bibliothèque — #1074.
 *
 * Cyrille (fil 1792, 0.9.149) : les paliers DSD manquent. Et pour cause — la
 * liste était FIGÉE dans `LibraryV2` :
 *
 * ```ts
 * const RATES = [{ v: 44100, l: '44,1' }, … { v: 384000, l: '384' }];
 * ```
 *
 * Huit fréquences PCM, aucune DSD. Un album DSD64 (2 822 400 Hz) ne
 * correspondait donc à AUCUNE entrée : il ne se comptait nulle part et ne se
 * filtrait pas. Ce n'est pas un libellé manquant, c'est une ligne absente.
 *
 * Le serveur les nomme depuis tune-server-rust#4171 (livré en v0.9.155) :
 * `GET /library/albums/filters` rend `sample_rate_labels: [{value, label,
 * dsd}]` — `2822400` → `DSD64`, `5644800` → `DSD128`, la famille 48 k suffixée
 * `(48k)`, le PCM en `44.1 kHz`.
 *
 * 🔴 On NE recalcule pas ces noms ici. La règle « ≥ 5 MHz ⇒ DSD128 » a déjà
 * coûté sept albums mal étiquetés dans cette même vue (voir `multipleDSD`) ;
 * la refaire une troisième fois côté client garantirait une troisième
 * divergence. Le serveur nomme, le client affiche — et garde sa liste figée
 * en SECOURS, pour qu'un serveur antérieur à la .155 continue d'offrir le
 * filtre PCM qu'il offrait déjà.
 */

/** Ce que le serveur rend dans `sample_rate_labels`. */
export interface LibelleServi {
  value: number;
  label: string;
  dsd?: boolean;
}

/** Une entrée du menu Fréquence. `court` sert aux pastilles, où la place
 *  manque ; `l` est le libellé complet du menu. */
export interface PalierFrequence {
  v: number;
  l: string;
  court: string;
  dsd: boolean;
}

/** La liste figée d'avant #1074, conservée pour les serveurs qui ne nomment
 *  pas encore les paliers. Huit valeurs PCM, et c'est tout ce qu'elle a
 *  jamais couvert. */
export const PALIERS_DE_SECOURS: { v: number; l: string }[] = [
  { v: 44100, l: '44,1' }, { v: 48000, l: '48' }, { v: 88200, l: '88,2' },
  { v: 96000, l: '96' }, { v: 176400, l: '176,4' }, { v: 192000, l: '192' },
  { v: 352800, l: '352,8' }, { v: 384000, l: '384' },
];

/**
 * Le séparateur décimal, à la langue de l'écran.
 *
 * Le serveur envoie toujours le POINT (`44.1 kHz`) : c'est une donnée, pas une
 * phrase. Le français écrit `44,1`, et l'ancienne liste figée le faisait déjà
 * — ne pas le faire ici aurait été une régression visible pour la seule
 * langue dans laquelle le produit est écrit.
 */
export function localiserDecimale(label: string, langue: string | null | undefined): string {
  const l = (langue ?? '').slice(0, 2).toLowerCase();
  const virgule = ['fr', 'de', 'es', 'it', 'ro', 'sv', 'hu'].includes(l);
  if (!virgule) return label;
  // Uniquement entre deux chiffres : un point de fin de phrase ne bouge pas.
  return label.replace(/(\d)\.(\d)/g, '$1,$2');
}

/** Le libellé court : le menu dit « 44,1 kHz », la pastille dit « 44,1k ». */
function raccourcir(label: string, dsd: boolean): string {
  if (dsd) return label;
  const m = label.match(/^([\d.,]+)\s*kHz$/i);
  return m ? `${m[1]}k` : label;
}

/**
 * Les paliers à afficher : ceux du serveur s'il les nomme, la liste figée
 * sinon.
 *
 * L'ordre du serveur est conservé tel quel — il rend `sample_rate_labels` dans
 * le même ordre que `sample_rates`, et le réordonner ici ferait diverger le
 * menu du reste de la réponse.
 */
export function paliersDeFrequence(
  servis: LibelleServi[] | null | undefined,
  langue?: string | null,
): PalierFrequence[] {
  if (Array.isArray(servis) && servis.length) {
    const out: PalierFrequence[] = [];
    for (const s of servis) {
      const v = Number(s?.value);
      if (!Number.isFinite(v) || v <= 0) continue;
      const dsd = !!s?.dsd;
      const l = localiserDecimale(String(s?.label ?? v), langue);
      out.push({ v, l, court: raccourcir(l, dsd), dsd });
    }
    if (out.length) return out;
  }
  return PALIERS_DE_SECOURS.map((r) => ({
    v: r.v,
    l: `${r.l} kHz`,
    court: `${r.l}k`,
    dsd: false,
  }));
}

/**
 * Le nom d'UNE fréquence, à partir des paliers connus.
 *
 * Le repli reprend exactement la forme de l'ancienne interface
 * (`44.1kHz`, `48kHz`) : sans libellé servi, rien ne doit changer à l'écran.
 * Une bibliothèque DSD y affichait `2822.4kHz` — vrai, et illisible.
 */
export function nommerFrequence(v: number, paliers: PalierFrequence[]): string {
  const p = paliers.find((x) => x.v === v);
  if (p) return p.l;
  if (!Number.isFinite(v) || v < 1000) return `${v}Hz`;
  return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}kHz`;
}
