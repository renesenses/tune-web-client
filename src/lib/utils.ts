/** Format milliseconds as m:ss */
export function formatTime(ms: number | undefined | null): string {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format milliseconds as total duration string (e.g., "1h 23min") */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/** Format audio badge (e.g. "FLAC / 96 kHz / 24-bit") */
export function formatAudioBadge(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const parts: string[] = [];
  if (track.format) parts.push(String(track.format).toUpperCase());
  if (track.sample_rate) parts.push(`${(track.sample_rate / 1000).toFixed(track.sample_rate % 1000 === 0 ? 0 : 1)} kHz`);
  if (track.bit_depth) parts.push(`${track.bit_depth}-bit`);
  return parts.join(' / ');
}

// --- Streaming quality tier helpers ---

export type QualityTier = 'mqa' | 'hires_max' | 'hires' | 'cd' | 'lossy' | 'dsd';

/**
 * Les formats DSD, par leur nom de FICHIER.
 *
 * 🔴 « dsd » n'est presque jamais ce que le scanner écrit. Les fichiers DSD
 * s'appellent `.dsf` (Sony) ou `.dff` (Philips DSDIFF) ; « dsd » est le cas
 * rare. `types.ts` les déclare d'ailleurs tous les trois depuis toujours —
 * `'dsd' | 'dsf' | 'dff'` — mais la règle de qualité ne testait que le premier.
 *
 * MESURÉ sur la bibliothèque de Bertrand le 09/09/2026 (4 255 albums) :
 *
 *     dsf   47 albums        ← ignorés par l'ancienne règle
 *     dsd    2 albums        ← les seuls reconnus
 *
 * Soit 47 sur 49, 96 %, classés ailleurs. Et pas n'importe où : un DSF porte
 * `bit_depth: 1` et `sample_rate: 2 822 400`. La fréquence le faisait passer
 * pour sans perte, la profondeur de 1 bit échouait à `bd > 16`, et il retombait
 * sur… **CD**. « le filtre DSD oublie cet album » (Bertrand, avec la copie
 * d'écran d'un album marqué « CD DSF 5644.8/1 »).
 */
const DSD_FORMATS = new Set(['dsd', 'dsf', 'dff', 'dst']);

/**
 * Les formats SANS PERTE — la liste du serveur, recopiée sans la raccourcir.
 *
 * 🔴 Elle était plus courte que celle du serveur, et l'écran mentait (#3848).
 * `AudioFormat::is_lossless()` (`tune-core/src/audio/formats.rs`) dit sans
 * perte pour Flac, Wav, Dsd, Alac, Aiff, **WavPack** et **APE** ; le client
 * n'en connaissait que cinq. Un APE 44,1/16 ne satisfaisait alors AUCUNE des
 * quatre conditions de `getQualityTier` — ni la liste, ni `bd >= 24`, ni
 * `sr > 48000`, ni Qobuz — et retombait sur `'lossy'`, affiché en ROUGE.
 *
 * « Le format APE est sans perte. Pourquoi l'identifier 'LOSSY' ? » — Marco
 * Polo, fil 1754, capture de neuf badges `LOSSY APE 44.1/16` d'affilée. Le
 * serveur, lui, renvoyait déjà `quality: "cd"` pour ces mêmes albums
 * (`Album::quality()` ne dit « lossy » que pour mp3|ogg|opus|wma|aac) : les
 * deux moitiés du produit se contredisaient sur la même piste.
 *
 * ⚠️ Le défaut ne touchait QUE les rips CD. Le même APE en 24 bits ou au-delà
 * de 48 kHz passait par les garde-fous de spécifications et s'affichait
 * hi-res — ce qui rendait l'incohérence d'autant plus difficile à voir.
 *
 * Les valeurs sont celles que le serveur STOCKE, c'est-à-dire les extensions
 * qu'il reconnaît (`AudioFormat::from_extension`) : `aif` à côté d'`aiff`,
 * `dst` à côté de `dsf`/`dff`, `wv` pour WavPack. Ajouter un format ici sans
 * l'ajouter là-bas recréerait l'écart qu'on referme.
 */
const LOSSLESS_FORMATS = new Set([
  'flac', 'wav', 'alac', 'aiff', 'aif',
  'dsd', 'dsf', 'dff', 'dst',
  'wv', 'ape',
]);

/**
 * Les formats AVEC perte — l'exact complément de ce que le serveur compresse.
 *
 * Exporté parce que trois écrans portaient chacun leur propre liste, toutes
 * différentes : la bibliothèque comptait cinq codecs, la recherche trois
 * (`opus` et `wma` y étaient donc rangés en « CD »), et la barre de lecture
 * décidait par une liste de quatre formats sans perte écrite à la main. Une
 * seule liste, sinon la prochaine correction n'en répare qu'un tiers.
 *
 * Miroir de `Album::quality()` côté serveur — `mp3|ogg|opus|wma|aac`. `m4a`
 * n'y est PAS : le serveur le résout en `alac` ou `aac` selon la présence
 * d'une profondeur de bits, et c'est cette valeur résolue qui est stockée.
 */
export const LOSSY_FORMATS = new Set(['mp3', 'aac', 'ogg', 'opus', 'wma']);

/** Le format déclaré est-il un codec avec perte ? Casse et vide tolérés. */
export function estAvecPerte(format: string | null | undefined): boolean {
  return LOSSY_FORMATS.has((format ?? '').toLowerCase());
}

/** Le format déclaré est-il sans perte, au sens du serveur ? */
export function estSansPerte(format: string | null | undefined): boolean {
  return LOSSLESS_FORMATS.has((format ?? '').toLowerCase());
}

/**
 * Le MULTIPLE DSD, à partir de la fréquence.
 *
 * 🔴 Le libellé valait `sample_rate >= 5000000 ? 'DSD128' : 'DSD64'` : deux
 * cases pour une famille qui en compte cinq. MESURÉ sur la bibliothèque de
 * Bertrand le 09/09/2026, sur ses 49 albums DSD :
 *
 *     2 822 400  ×39   DSD64
 *     5 644 800  ×2    DSD128
 *    11 289 600  ×6    DSD256   ← annoncés « DSD128 »
 *    22 579 200  ×1    DSD512   ← annoncé « DSD128 »
 *
 * Sept albums sur quarante-neuf portaient donc un multiple faux, et toujours
 * PAR DÉFAUT — un DSD512 annoncé en DSD128 fait croire à quatre fois moins.
 *
 * Le multiple est un rapport à la fréquence CD, pas un seuil : DSD64 vaut
 * 44 100 × 64. On le calcule, et on ne le nomme que s'il tombe sur une
 * puissance de deux connue — une fréquence inattendue rend `null` plutôt qu'un
 * nom inventé.
 */
const DSD_BASE = 44100;
export function multipleDSD(sampleRate: number | null | undefined): string | null {
  const sr = sampleRate ?? 0;
  if (sr <= 0) return null;
  const n = Math.round(sr / DSD_BASE);
  return [64, 128, 256, 512, 1024].includes(n) ? `DSD${n}` : null;
}

/**
 * Ce fichier est-il du DSD ?
 *
 * Exportée pour que le test l'APPELLE, et pour que tout écran qui a besoin de
 * la question la pose au même endroit. Accepte aussi les types MIME
 * (`audio/x-dsf`), déjà normalisés par l'appelant.
 */
export function estDuDSD(format: string | null | undefined): boolean {
  const raw = (format ?? '').toLowerCase().trim();
  const fmt = raw.startsWith('audio/') ? raw.slice(6).replace('x-', '') : raw;
  return DSD_FORMATS.has(fmt) || fmt.startsWith('dsd');
}

/** Determine the quality tier for a track */
export function getQualityTier(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): QualityTier {
  if (!track) return 'lossy';
  const raw = (track.format ?? '').toLowerCase();
  const fmt = raw.startsWith('audio/') ? raw.slice(6).replace('x-', '') : raw;
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;
  const source = (track.source ?? '').toLowerCase();

  // MQA is identifiable by format string
  if (fmt === 'mqa' || fmt.includes('mqa')) return 'mqa';

  // DSD — format natif 1 bit, toujours son propre palier. La règle vit dans
  // `estDuDSD` : elle ne testait que « dsd » et laissait passer 47 albums `dsf`
  // sur les 49 de la bibliothèque de Bertrand, classés « CD » faute de mieux.
  if (estDuDSD(fmt)) return 'dsd';

  // A track is lossless when its declared format says so, OR when its specs /
  // source make it unambiguous: no lossy codec (MP3/AAC/OGG/Opus/WMA) can exceed
  // 48 kHz or carry a bit depth, and Qobuz only ever streams FLAC. Without this,
  // streaming tracks whose `format` string is missing were mislabelled "Lossy"
  // despite 24-bit / hi-res specs (Progman: Qobuz shown as "compressé").
  const lossless =
    LOSSLESS_FORMATS.has(fmt) || bd >= 24 || sr > 48000 || source === 'qobuz';

  if (lossless) {
    // Hi-Res Max: 24-bit at 176.4 kHz or above (176400, 192000, 352800, 384000 …)
    if (bd >= 24 && sr >= 176400) return 'hires_max';
    // Hi-Res: 24-bit at 88.2–96 kHz
    if (bd >= 24 && sr >= 88200) return 'hires';
    // 24-bit (or higher) at 44.1/48 kHz is still Hi-Res (e.g. Qobuz 24/44.1)
    if (bd > 16) return 'hires';
    // Otherwise CD quality: lossless 16-bit at ≤ 48 kHz
    return 'cd';
  }

  // Everything else (MP3, AAC, OGG, Opus, WMA, unknown) is lossy
  return 'lossy';
}

/** Get tier display label */
export function getQualityTierLabel(tier: QualityTier): string {
  switch (tier) {
    case 'mqa': return 'MQA';
    case 'hires_max': return 'Hi-Res Max';
    case 'hires': return 'Hi-Res';
    case 'dsd': return 'DSD';
    case 'cd': return 'CD';
    case 'lossy': return 'Lossy';
  }
}

/** CSS color class suffix for quality tier */
export function getQualityTierColor(tier: QualityTier): string {
  switch (tier) {
    case 'mqa':
    case 'hires_max': return 'gold-max';
    case 'hires': return 'gold';
    case 'dsd': return 'green';
    case 'cd': return 'blue';
    case 'lossy': return 'gray';
  }
}

const SOURCE_LABELS: Record<string, string> = {
  tidal: 'Tidal',
  qobuz: 'Qobuz',
  spotify: 'Spotify',
  deezer: 'Deezer',
  amazon: 'Amazon',
  youtube: 'YouTube',
  local: 'Local',
  radio: 'Radio',
  bandcamp: 'Bandcamp',
};

/** Le débit annoncé pour une source qui n'en sert qu'un seul, ou `null`.
 *
 *  `NowPlaying` ne porte pas de champ « débit » : le chemin du signal se
 *  décrit en format / fréquence / profondeur. Pour Bandcamp c'est insuffisant
 *  — « MP3 44,1 kHz » ne dit pas 128 kbit/s, et un auditeur pourrait juger un
 *  disque sur un débit qu'on ne lui a pas montré. Bandcamp ne diffuse QUE du
 *  mp3-128 sans achat (le plugin le grave dans chaque réponse,
 *  `BC_STREAM_QUALITY`), donc la valeur se déduit de la source sans rien
 *  inventer. Toute autre source rend `null` : on n'affiche pas un débit
 *  qu'on ne connaît pas. */
export function fixedBitrateLabel(source: string | null | undefined): string | null {
  return (source ?? '').toLowerCase() === 'bandcamp' ? '128 kbit/s' : null;
}

/** Build the source + quality label, e.g. "Tidal Hi-Res", "Qobuz 24/96", "Local FLAC" */
export function formatQualitySource(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const tier = getQualityTier(track);
  const source = SOURCE_LABELS[(track.source ?? '').toLowerCase()] ?? '';
  const fmt = (track.format ?? '').toUpperCase();
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  // Build detail portion
  let detail = '';
  if (tier === 'mqa') {
    detail = 'MQA';
  } else if ((tier === 'hires' || tier === 'hires_max') && sr > 0 && bd > 0) {
    detail = `${bd}/${sr >= 1000 ? (sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1) : sr}`;
  } else if (tier === 'dsd') {
    detail = fmt.toUpperCase() || 'DSD';
  } else if (tier === 'cd') {
    detail = fmt || 'CD';
  } else {
    detail = fmt || 'Lossy';
  }

  // Le débit, quand la source n'en sert qu'un seul (Bandcamp : 128 kbit/s).
  // Sans lui, la puce affichait « Bandcamp MP3 » — vrai, mais muet sur ce qui
  // compte ici. La décision d'ouvrir Bandcamp à la lecture vers une zone a
  // pour contrepartie que le débit soit LU, pas seulement lisible ailleurs.
  const debit = fixedBitrateLabel(track.source);
  if (debit) detail = `${detail} ${debit}`;

  return source ? `${source} ${detail}` : detail;
}

/** Compact badge for mini player: "FLAC 96/24", "MP3 128 kbit/s" */
export function formatCompactQuality(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const fmt = (track.format ?? '').toUpperCase();
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  // Pour une source à débit unique, le débit DIT plus que « 44,1/16 » — qui
  // décrirait ici le PCM après décodage, pas ce que Bandcamp a envoyé. On le
  // montre à sa place, jamais en plus : deux chiffres pour la même chose se
  // contrediraient à l'œil.
  const debit = fixedBitrateLabel(track.source);
  if (debit) return fmt ? `${fmt} ${debit}` : debit;

  if (!fmt && !sr && !bd) return '';

  if (sr > 0 && bd > 0) {
    const srK = sr >= 1000 ? (sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1) : String(sr);
    return `${fmt} ${srK}/${bd}`;
  }
  return fmt;
}

/** Full tooltip text for signal path detail */
export function formatQualityTooltip(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const tier = getQualityTier(track);
  const tierLabel = getQualityTierLabel(tier);
  const source = SOURCE_LABELS[(track.source ?? '').toLowerCase()] ?? 'Unknown';
  const fmt = (track.format ?? '').toUpperCase() || '?';
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  const lines: string[] = [];
  lines.push(`Quality: ${tierLabel}`);
  lines.push(`Source: ${source}`);
  lines.push(`Format: ${fmt}`);
  const debit = fixedBitrateLabel(track.source);
  if (debit) lines.push(`Bitrate: ${debit}`);
  if (sr > 0) lines.push(`Sample rate: ${(sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1)} kHz`);
  if (bd > 0) lines.push(`Bit depth: ${bd}-bit`);
  return lines.join('\n');
}

/** Lowercase and strip diacritics, for accent-insensitive substring matching
 * (e.g. searching "carlao" should match "Carlão"). */
export function fold(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Copy text to the clipboard, returning whether it actually succeeded.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * Tune's LAN access URLs are served over plain HTTP on an IP, exactly where
 * the async Clipboard API is undefined — so the copy buttons in Settings need
 * the legacy `execCommand('copy')` fallback via an off-screen textarea, and
 * callers must show "Copied" only when this resolves true (Bertrand: the
 * button faked success while leaving the clipboard empty). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Message d'erreur montrable, ou `null` si c'est l'erreur réseau générique du
 *  navigateur — « Failed to fetch » (Chrome), « Load failed » (Safari),
 *  « NetworkError… » (Firefox). Le texte brut n'explique rien à l'utilisateur
 *  (capture Stéphane Villerio, 12/08/2026 : boîte « localhost:8888 indique
 *  Erreur : Failed to fetch ») ; l'appelant affiche alors sa phrase claire —
 *  ou traite la coupure comme un événement attendu, cas du redémarrage. */
export function errText(e: unknown): string | null {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/^(Failed to fetch|Load failed|NetworkError)/i.test(m)) return null;
  return m || null;
}

/** Libellés portés par les puces de QUALITÉ, en majuscules. */
export const LIBELLES_QUALITE = ['DSD', 'HI-RES', 'CD', 'LOSSY'];

/**
 * Écarter des puces de FORMAT tout libellé déjà porté par une puce de qualité.
 *
 * Dans l'onglet Albums, les deux rangées vivent dans le même bloc, séparées
 * d'une simple barre et sans intitulé. « DSD » est le seul terme qui soit à la
 * fois un palier de qualité et un format de fichier : une bibliothèque
 * contenant du DSD affichait donc
 *
 *     CD | Lossy | DSD | Hi-Res | FLAC | MP3 | DSD | ALAC | AAC | WAV
 *                  ↑                          ↑
 *
 * deux puces identiques au même endroit (Cyrille Moutia, #1612).
 *
 * Reproduit sur une bibliothèque réelle de 2222 albums : une SEULE valeur
 * `dsd` en base, aucun doublon de donnée. Ce n'était donc ni deux extensions
 * (.dsf/.dff) ni deux casses, comme on l'avait d'abord supposé — mais la
 * collision d'affichage entre deux facettes légitimes.
 *
 * Règle générale plutôt que le cas « dsd » : si un format entre un jour en
 * collision avec un palier, elle tiendra sans qu'on y revienne. C'est le
 * palier qu'on garde, car il filtre plus large — il retient aussi les `.dsf`
 * et `.dff` dont le `format` diffère.
 *
 * L'onglet Pistes n'est pas concerné : sa rangée de formats porte un intitulé
 * « Format », qui lève l'ambiguïté.
 */
export function formatsSansCollision(formats: (string | null | undefined)[]): string[] {
  return [...new Set(formats.filter(Boolean) as string[])]
    .filter((fmt) => !LIBELLES_QUALITE.includes(fmt.toUpperCase()))
    .sort();
}

/**
 * Décode les entités XML restées dans un texte venu d'un serveur UPnP.
 *
 * Le DIDL-Lite d'une réponse `Browse` est du XML ÉCHAPPÉ à l'intérieur d'une
 * enveloppe SOAP : un titre contenant `&` y voyage en `&amp;amp;`. Le serveur
 * défait la première couche, la seconde arrive telle quelle jusqu'ici — d'où
 * « King Gizzard &amp; The Lizard Wizard » affiché mot pour mot dans la grille
 * (constaté sur un serveur Tune distant, 28/08).
 *
 * On décode les cinq entités du XML et les formes numériques, rien d'autre :
 * pas de `innerHTML`, pas d'élément DOM jetable par titre — cette fonction est
 * appelée des milliers de fois sur un rayon d'albums.
 */
const ENTITES_XML: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};
export function decoderEntitesXml(v: string | null | undefined): string {
  if (!v) return v ?? '';
  if (!v.includes('&')) return v;
  return v.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (tout, corps: string) => {
    if (corps[0] === '#') {
      const n = corps[1] === 'x' || corps[1] === 'X'
        ? parseInt(corps.slice(2), 16)
        : parseInt(corps.slice(1), 10);
      // Un point de code hors plage rendrait `�` : on préfère laisser le
      // texte d'origine, lisible, plutôt qu'un losange noir.
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : tout;
    }
    return ENTITES_XML[corps.toLowerCase()] ?? tout;
  });
}
