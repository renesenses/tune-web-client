/**
 * #2853 — les emojis de la messagerie Tune Circle, sans dépendance.
 *
 * Une liste Unicode intégrée, courte et choisie (pas les 3 600 emojis du
 * standard : un sélecteur léger, pas un catalogue), rangée par catégories.
 * Chaque emoji porte ses mots anglais et français pour la recherche ; le nom
 * lu à voix haute (aria-label) est la liste de mots de la langue de
 * l'interface en français, l'anglais pour les autres langues.
 *
 * Format compact d'une entrée : `emoji|mots anglais|mots français`.
 */

export type Emoji = { e: string; en: string[]; fr: string[] };
export type IdCategorie = 'smileys' | 'gestures' | 'hearts' | 'music' | 'objects';
export type Categorie = { id: IdCategorie; icone: string; emojis: Emoji[] };

const SMILEYS = [
  '😀|grinning smile happy|sourire content heureux', '😃|smiley happy joy|sourire joie', '😄|smile laugh|rire sourire',
  '😁|grin beaming|sourire radieux', '😆|laughing|rire', '😅|sweat smile relief|soulagement sueur', '🤣|rofl rolling laughing|mort de rire',
  '😂|joy tears laughing|larmes de joie rire', '🙂|slight smile|léger sourire', '🙃|upside down|à l’envers', '😉|wink|clin d’œil',
  '😊|blush happy|rougir content', '😇|innocent angel halo|ange innocent', '🥰|smiling hearts love|amoureux cœurs', '😍|heart eyes love|yeux cœurs amour',
  '🤩|star struck wow|étoiles émerveillé', '😘|kiss blow|bisou baiser', '😋|yum tasty|miam délicieux', '😛|tongue|langue', '😜|wink tongue crazy|langue clin d’œil',
  '🤪|zany crazy|fou loufoque', '🤗|hug hugging|câlin', '🤭|oops hand over mouth|oups', '🤫|shush quiet|chut silence', '🤔|thinking hmm|réfléchir',
  '🤐|zipper mouth secret|bouche cousue secret', '😐|neutral|neutre', '😑|expressionless|sans expression', '😶|no mouth speechless|sans voix', '😏|smirk|narquois',
  '😒|unamused|blasé', '🙄|eye roll|lever les yeux', '😬|grimace awkward|grimace gêne', '😌|relieved calm|soulagé serein', '😔|pensive sad|pensif triste',
  '😪|sleepy|somnolent', '😴|sleeping zzz|dormir sommeil', '😷|mask sick|masque malade', '🤒|fever sick|fièvre malade', '🤧|sneeze|éternuer',
  '🥵|hot heat|chaud chaleur', '🥶|cold freezing|froid gelé', '🥴|woozy dizzy|étourdi', '😵|dizzy|sonné', '🤯|mind blown exploding|époustouflé tête qui explose',
  '🥳|party celebrate|fête célébrer', '😎|cool sunglasses|cool lunettes de soleil', '🤓|nerd geek|intello geek', '🧐|monocle curious|curieux monocle', '😕|confused|confus perplexe',
  '😟|worried|inquiet', '🙁|frown sad|triste', '😮|open mouth surprised|surpris bouche ouverte', '😯|hushed|stupéfait', '😲|astonished|étonné',
  '😳|flushed embarrassed|gêné rougissant', '🥺|pleading puppy eyes|suppliant', '😢|cry tear|pleurer larme', '😭|sob crying|sanglot pleurs', '😱|scream fear|cri peur',
  '😖|confounded|déconfit', '😣|persevere|persévérer', '😞|disappointed|déçu', '😩|weary tired|las fatigué', '😫|tired exhausted|épuisé',
  '🥱|yawn bored|bâiller ennui', '😤|triumph huff|triomphe souffle', '😡|angry rage|colère rage', '😠|angry mad|fâché', '🤬|swearing cursing|jurons insultes',
  '😈|devil smiling|diablotin', '💀|skull dead|crâne mort', '💩|poo poop|caca', '🤡|clown|clown', '👻|ghost|fantôme', '👽|alien|extraterrestre', '🤖|robot|robot',
  '😺|cat smile|chat sourire', '😻|cat heart eyes|chat amoureux', '🙈|see no evil monkey|singe ne rien voir', '🙉|hear no evil monkey|singe ne rien entendre', '🙊|speak no evil monkey|singe ne rien dire',
];
const GESTES = [
  '👍|thumbs up like yes ok|pouce levé j’aime oui', '👎|thumbs down dislike no|pouce baissé non', '👌|ok hand perfect|ok parfait', '🤌|pinched fingers|doigts pincés', '✌️|victory peace|victoire paix',
  '🤞|crossed fingers luck|doigts croisés chance', '🤟|love you gesture|je t’aime geste', '🤘|rock horns metal|cornes rock metal', '🤙|call me shaka|appelle-moi', '👈|point left|gauche montrer',
  '👉|point right|droite montrer', '👆|point up|haut montrer', '👇|point down|bas montrer', '☝️|index up|index levé', '👋|wave hello bye|salut coucou au revoir',
  '🤚|raised back hand|main levée', '✋|raised hand stop|main levée stop', '🖐️|hand fingers splayed|main ouverte', '🖖|vulcan salute|salut vulcain', '👏|clap applause bravo|applaudir bravo',
  '🙌|raising hands hooray|mains levées hourra', '👐|open hands|mains ouvertes', '🤲|palms up|paumes vers le haut', '🤝|handshake deal|poignée de main accord', '🙏|pray please thanks|prier merci s’il te plaît',
  '✊|raised fist|poing levé', '👊|fist bump punch|check poing', '💪|muscle strong flex|muscle fort', '✍️|writing|écrire', '🫶|heart hands|mains cœur',
  '🤷|shrug|haussement d’épaules', '🤷‍♀️|woman shrugging|femme haussement d’épaules', '🤷‍♂️|man shrugging|homme haussement d’épaules', '🤦|facepalm|main sur le visage', '🙋|raising hand|lever la main',
  '🙆|ok gesture|geste ok', '🙅|no gesture|geste non', '💃|dancing woman dance|danseuse danser', '🕺|dancing man dance|danseur danser', '👯|people dancing party|danseurs fête',
  '👀|eyes look|yeux regarder', '👂|ear listen|oreille écouter', '👍🏽|thumbs up medium skin|pouce levé peau mate', '👋🏽|wave medium skin|salut peau mate', '👨‍👩‍👧|family|famille',
];
const COEURS = [
  '❤️|red heart love|cœur rouge amour', '🧡|orange heart|cœur orange', '💛|yellow heart|cœur jaune', '💚|green heart|cœur vert', '💙|blue heart|cœur bleu',
  '💜|purple heart|cœur violet', '🖤|black heart|cœur noir', '🤍|white heart|cœur blanc', '🤎|brown heart|cœur marron', '💔|broken heart|cœur brisé',
  '❤️‍🔥|heart on fire|cœur en feu', '❣️|heart exclamation|cœur exclamation', '💕|two hearts|deux cœurs', '💞|revolving hearts|cœurs tournants', '💓|beating heart|cœur battant',
  '💗|growing heart|cœur grandissant', '💖|sparkling heart|cœur scintillant', '💘|heart arrow cupid|cœur flèche cupidon', '💝|heart ribbon gift|cœur ruban cadeau', '💟|heart decoration|décoration cœur',
  '💋|kiss mark lips|bisou lèvres', '💌|love letter|lettre d’amour', '🌹|rose flower|rose fleur', '💐|bouquet flowers|bouquet fleurs',
];
const MUSIQUE = [
  '🎵|musical note music|note de musique', '🎶|musical notes music|notes de musique', '🎧|headphones headphone listen|casque écouter', '🎸|guitar rock|guitare rock', '🎹|piano keyboard|piano clavier',
  '🥁|drum drums|batterie tambour', '🎻|violin|violon', '🎷|saxophone sax jazz|saxophone jazz', '🎤|microphone mic sing|micro chanter', '🎺|trumpet|trompette',
  '🪕|banjo|banjo', '🪗|accordion|accordéon', '🪘|long drum|tambour long', '🎙️|studio microphone podcast|micro studio podcast', '🎚️|level slider fader|curseur niveau',
  '🎛️|control knobs mixer|boutons table de mixage', '📻|radio|radio', '💿|cd optical disc album|cd disque album', '📀|dvd disc|dvd disque', '💽|minidisc|minidisque',
  '📼|cassette tape vhs|cassette', '🔊|loud speaker volume|haut-parleur fort volume', '🔉|speaker medium volume|haut-parleur moyen', '🔈|speaker low volume|haut-parleur faible', '🔇|mute muted|muet silence',
  '🎼|score sheet music|partition', '🎟️|ticket concert|billet concert', '🎫|ticket|ticket', '🪩|mirror ball disco|boule à facettes disco',
  '🎉|party popper celebrate|cotillons fête', '🎊|confetti|confettis', '🔥|fire hot lit|feu chaud', '✨|sparkles magic|étincelles magie', '⭐|star|étoile',
  '🌟|glowing star|étoile brillante', '💯|hundred perfect|cent parfait', '🎬|clapper film|clap cinéma', '📺|tv television|télé télévision', '🎮|video game|jeu vidéo',
];
const OBJETS = [
  '☕|coffee hot drink|café boisson chaude', '🍷|wine glass|vin verre', '🍺|beer|bière', '🥂|cheers toast champagne|santé trinquer champagne', '🍕|pizza|pizza',
  '🍰|cake|gâteau', '🎂|birthday cake|gâteau d’anniversaire', '🎁|gift present|cadeau', '🎈|balloon|ballon', '📱|phone mobile|téléphone portable',
  '💻|laptop computer|ordinateur portable', '🖥️|desktop computer|ordinateur', '⌚|watch|montre', '📷|camera photo|appareil photo', '💡|idea light bulb|idée ampoule',
  '📚|books|livres', '✏️|pencil|crayon', '📌|pin|punaise épingle', '📎|paperclip|trombone', '🔑|key|clé',
  '🏠|home house|maison', '🚗|car|voiture', '✈️|plane travel|avion voyage', '🚀|rocket launch|fusée lancement', '⏰|alarm clock|réveil',
  '📅|calendar date|calendrier date', '☀️|sun sunny|soleil', '🌙|moon night|lune nuit', '🌈|rainbow|arc-en-ciel', '☔|rain umbrella|pluie parapluie',
  '❄️|snow snowflake|neige flocon', '🌍|earth world|terre monde', '🐶|dog|chien', '🐱|cat|chat', '🌻|sunflower|tournesol',
  '✅|check done yes|validé fait oui', '❌|cross no|croix non', '❓|question|question', '❗|exclamation|exclamation', '⚠️|warning|attention',
  '🔗|link|lien', '🏆|trophy win|trophée victoire', '🥇|gold medal first|médaille d’or premier', '🇫🇷|france flag|drapeau france',
];

function lire(lignes: string[]): Emoji[] {
  const vus = new Set<string>();
  const out: Emoji[] = [];
  for (const l of lignes) {
    const [e, en, fr] = l.split('|');
    if (vus.has(e)) continue;
    vus.add(e);
    out.push({ e, en: en.split(' '), fr: fr.split(' ') });
  }
  return out;
}

export const CATEGORIES: Categorie[] = [
  { id: 'smileys', icone: '🙂', emojis: lire(SMILEYS) },
  { id: 'gestures', icone: '👍', emojis: lire(GESTES) },
  { id: 'hearts', icone: '❤️', emojis: lire(COEURS) },
  { id: 'music', icone: '🎵', emojis: lire(MUSIQUE) },
  { id: 'objects', icone: '💡', emojis: lire(OBJETS) },
];

const TOUS: Emoji[] = (() => {
  const vus = new Map<string, Emoji>();
  for (const c of CATEGORIES) for (const e of c.emojis) if (!vus.has(e.e)) vus.set(e.e, e);
  return [...vus.values()];
})();

/** Minuscules sans accents ni apostrophes typographiques : « cœur » ≈ « coeur », « Œil » ≈ « oeil ». */
export function normaliser(v: string): string {
  return v.toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ').trim();
}

/** Nom lisible d'un emoji dans la langue de l'interface (français ou, à défaut, anglais). */
export function nomEmoji(e: Emoji, langue: string): string {
  const mots = langue.startsWith('fr') ? e.fr : e.en;
  return mots.join(' ');
}

/** Recherche par nom, en français ET en anglais, quelle que soit la langue de l'interface. */
export function chercherEmojis(requete: string): Emoji[] {
  const q = normaliser(requete);
  if (!q) return [];
  const termes = q.split(/\s+/);
  return TOUS.filter((e) => {
    const mots = [...e.en, ...e.fr].map(normaliser).join(' ').split(/\s+/);
    return termes.every((t) => mots.some((m) => m.startsWith(t)));
  });
}

/** Retrouver l'entrée d'un emoji (pour les récents). */
export const emojiConnu = (e: string): Emoji | undefined => TOUS.find((x) => x.e === e);

// --- Récents, mémorisés dans ce navigateur seulement -------------------------

const CLE_RECENTS = 'tune.circle.emojis.recents';
export const RECENTS_MAX = 24;

export function lireRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_RECENTS) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!emojiConnu(x)).slice(0, RECENTS_MAX) : [];
  } catch { return []; }
}

export function noterRecent(e: string): string[] {
  const liste = [e, ...lireRecents().filter((x) => x !== e)].slice(0, RECENTS_MAX);
  try { localStorage.setItem(CLE_RECENTS, JSON.stringify(liste)); } catch { /* stockage refusé : les récents restent en mémoire */ }
  return liste;
}

// --- Raccourcis texte -------------------------------------------------------

const CLE_RACCOURCIS = 'tune.circle.emojis.raccourcis';

/** `:)` et compagnie. Ordre : les plus longs d'abord (`:-)` avant `:)`). */
export const RACCOURCIS: ReadonlyArray<readonly [string, string]> = [
  [":'(", '😢'], ['</3', '💔'], [':-)', '🙂'], [':-D', '😀'], [';-)', '😉'], [':-(', '🙁'], [':-P', '😛'], [':-p', '😛'],
  [':)', '🙂'], [':D', '😀'], [';)', '😉'], [':(', '🙁'], [':P', '😛'], [':p', '😛'], [':o', '😮'], [':O', '😮'], [':*', '😘'], ['<3', '❤️'],
];
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Un raccourci n'est converti que SEUL : précédé d'un début ou d'un blanc, suivi
// d'une fin, d'un blanc ou d'une ponctuation. « http://x », « 10:30 », « a<30 »,
// « f(:) » restent tels quels.
const MOTIF_RACCOURCIS = new RegExp(`(^|\\s)(${RACCOURCIS.map(([r]) => echapper(r)).join('|')})(?=$|\\s|[.,!?…])`, 'gu');
const TABLE = new Map(RACCOURCIS);

export function convertirRaccourcis(texte: string): string {
  return texte.replace(MOTIF_RACCOURCIS, (_tout, avant: string, r: string) => avant + (TABLE.get(r) ?? r));
}

export function raccourcisActifs(): boolean {
  try { return localStorage.getItem(CLE_RACCOURCIS) !== 'non'; } catch { return true; }
}
export function reglerRaccourcis(actifs: boolean): void {
  try { localStorage.setItem(CLE_RACCOURCIS, actifs ? 'oui' : 'non'); } catch { /* réglage de session seulement */ }
}

// --- Insertion et affichage -------------------------------------------------

/** Insère `e` à la place de la sélection [debut, fin) ; rend le texte et la position du curseur après l'emoji. */
export function insererEmoji(texte: string, debut: number | null | undefined, fin: number | null | undefined, e: string): { texte: string; curseur: number } {
  const d = Math.max(0, Math.min(debut ?? texte.length, texte.length));
  const f = Math.max(d, Math.min(fin ?? d, texte.length));
  return { texte: texte.slice(0, d) + e + texte.slice(f), curseur: d + e.length };
}

const GRAPHEME_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u;
const PRESENTATION = /\p{Emoji_Presentation}|️|⃣|\p{Regional_Indicator}/u;
const segmenteur = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * Nombre d'emojis d'un message composé UNIQUEMENT d'emojis (blancs tolérés),
 * 0 sinon. Sert à afficher « 🎸🔥 » en grand. Une séquence ZWJ (👨‍👩‍👧), un
 * drapeau (🇫🇷), une couleur de peau (👍🏽) comptent pour un. Les chiffres et
 * `#`, qui sont des « Emoji_Component », ne comptent pas seuls.
 */
export function emojisSeuls(texte: string | null | undefined): number {
  const t = (texte ?? '').trim();
  if (!t || !segmenteur || t.length > 64) return 0;
  let n = 0;
  for (const { segment } of segmenteur.segment(t)) {
    if (/^\s+$/u.test(segment)) continue;
    if (!GRAPHEME_EMOJI.test(segment) || !PRESENTATION.test(segment)) return 0;
    n++;
  }
  return n;
}

/** Vrai pour 1 à 3 emojis seuls : le message s'affiche en grand. */
export const grandsEmojis = (texte: string | null | undefined) => { const n = emojisSeuls(texte); return n >= 1 && n <= 3; };
