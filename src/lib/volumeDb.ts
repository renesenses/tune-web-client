/**
 * Le volume en décibels, côté client — miroir exact de `volume_scale` du
 * serveur (tune-server-rust, `tune-core/src/audio/volume_scale.rs`, #1274).
 *
 * # Pourquoi ce module existe
 *
 * Le serveur sait lire ET écrire le volume en dB depuis la v0.9.127 :
 * `PUT /zones/{id}/volume` accepte `volume_db`, et toutes les charges utiles
 * de zone portent le champ `volume_db` à côté de `volume`. Le client, lui,
 * n'avait qu'un affichage : `VolumeControl` recalculait `20·log10(v)` pour
 * l'écrire à l'écran, et n'envoyait jamais que du linéaire. Un curseur
 * `step="0.01"` ne permet pas de POSER −20,0 dB : entre 10 % et 11 % il n'y a
 * rien, et 10 % vaut −20,0 dB quand 11 % vaut −19,2 dB. L'audiophile qui
 * demande « le dB près » veut une valeur EXACTE et reproductible, donc une
 * saisie, pas une graduation plus fine.
 *
 * # Les trois règles reprises du serveur, telles quelles
 *
 * 1. **Le zéro est le silence, pas un plancher.** [`dbDepuisLineaire`] rend
 *    `null` pour 0 (et pour tout ce qui n'est pas un volume audible), comme
 *    `linear_to_db` rend `None` / `null`. Afficher « −60 dB » pour un silence
 *    inventerait une atténuation finie.
 * 2. **La conversion est exacte.** Aucun arrondi ici ; l'arrondi appartient au
 *    FORMATAGE ([`formaterDb`]), jamais à la valeur envoyée.
 * 3. **Le plafond est l'unité.** Un dB strictement positif est REFUSÉ, pas
 *    ramené à 0 : c'est ce que fait `demande_lineaire`, qui répond 400
 *    « volume_db doit être négatif ou nul (0 dB = 100 %) ». Ramener
 *    silencieusement ferait croire à l'utilisateur qu'il a obtenu son +3 dB.
 *
 * # Limite connue et MESURÉE du serveur (à ne pas maquiller ici)
 *
 * `zones.volume` est une colonne entière 0..100. Le contrat serveur
 * (`tune-server/tests/volume_db_contrat.rs`) le cloue : la réponse à
 * l'écriture, `GET /zones` et `GET /zones/{id}/status` rendent la valeur
 * exacte, mais `GET /zones/{id}` relit la colonne arrondie au pour-cent —
 * jusqu'à ~3 dB d'écart en bas d'échelle, et sous ≈ −46 dB l'arrondi tombe à
 * zéro, donc à un silence. Ce module ne borne PAS l'entrée pour le cacher :
 * inventer un plancher client masquerait un défaut serveur documenté au lieu
 * de le laisser voir. Voir le rapport de la PR.
 */

/** Plafond de l'échelle : 0 dB, l'unité. Au-delà il n'y a pas de volume en
 *  plus, seulement de l'écrêtage — d'où un REFUS et non un écrêtage muet. */
export const MAX_DB = 0;

/**
 * Atténuation en dB d'un facteur de volume linéaire (0..1).
 *
 * `null` signifie **silence** (−∞ dB) : c'est le cas de 0, et aussi celui
 * d'une valeur négative ou `NaN`, qui ne peut pas être un volume audible.
 * L'entrée est bornée à 1 avant le logarithme, comme côté serveur.
 */
export function dbDepuisLineaire(lineaire: number): number | null {
  if (!(lineaire > 0)) return null; // couvre 0, les négatifs et NaN
  return 20 * Math.log10(Math.min(lineaire, 1));
}

/**
 * Facteur de volume linéaire pour une atténuation en dB.
 *
 * `null` pour un `NaN` : c'est un refus, pas un silence — l'appelant ne doit
 * pas couper le son sur une saisie illisible. `-Infinity` vaut exactement 0,
 * le silence. Une valeur au-dessus de [`MAX_DB`] est ramenée à l'unité ici,
 * mais [`analyserDb`] la refuse AVANT d'arriver jusque-là : cette borne n'est
 * qu'un filet, la règle est le refus.
 */
export function lineaireDepuisDb(db: number): number | null {
  if (Number.isNaN(db)) return null;
  if (db === Number.NEGATIVE_INFINITY) return 0;
  return Math.pow(10, Math.min(db, MAX_DB) / 20);
}

/** Le motif d'un refus de saisie — traduit par l'appelant, jamais ici. */
export type RefusDb = 'vide' | 'illisible' | 'positif';

export type SaisieDb = { db: number } | { refus: RefusDb };

/**
 * Lit une atténuation en dB tapée à la main.
 *
 * Ce qui est accepté, parce que c'est ce qu'un utilisateur tape vraiment :
 * l'unité en suffixe (`-20 dB`, `-20dB`), la virgule décimale française
 * (`-20,5`), les espaces (y compris l'insécable des claviers français), le
 * signe moins typographique `−` (U+2212) que produisent certains systèmes, et
 * la valeur nue `-20`.
 *
 * Ce qui est refusé : le vide, ce qui n'est pas un nombre, et tout dB
 * strictement positif — la règle du serveur, rendue ici pour que le refus soit
 * IMMÉDIAT et explicable plutôt qu'un 400 sans mot.
 */
export function analyserDb(texte: string): SaisieDb {
  const nettoye = texte
    .replace(/−/g, '-') // signe moins typographique
    .replace(/\s/g, '') // \s couvre l'espace insecable
    .replace(/dB$/i, '')
    .replace(',', '.')
    .trim();
  if (nettoye === '') return { refus: 'vide' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(nettoye)) return { refus: 'illisible' };
  const db = Number(nettoye);
  if (!Number.isFinite(db)) return { refus: 'illisible' };
  if (db > MAX_DB) return { refus: 'positif' };
  return { db };
}

/** Nombre de décimales affichées. Le dixième de dB est la résolution que
 *  l'oreille et les notices d'amplis emploient ; en garder plus donnerait une
 *  fausse impression de précision sur une valeur qui vient d'un curseur. */
export const DECIMALES_DB = 1;

/**
 * Le texte d'un volume linéaire en dB, unité comprise : `-20.0 dB`, ou
 * `-∞ dB` pour le silence.
 *
 * Le résultat est relisible par [`analyserDb`] — c'est ce qui permet à un
 * champ de saisie d'afficher sa propre valeur sans se piéger au premier
 * aller-retour.
 */
export function formaterDb(lineaire: number): string {
  const db = dbDepuisLineaire(lineaire);
  if (db === null) return '-∞ dB';
  // `-0.0` : le signe négatif d'une valeur qui s'arrondit à zéro ferait lire
  // une atténuation là où l'affichage n'en montre plus. On le normalise.
  const arrondi = Number(db.toFixed(DECIMALES_DB));
  return `${(arrondi === 0 ? 0 : arrondi).toFixed(DECIMALES_DB)} dB`;
}
