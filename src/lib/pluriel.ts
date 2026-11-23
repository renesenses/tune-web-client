/**
 * Pluriels CLDR dans les traductions — tune-server-rust discussion #8301,
 * issue d'origine web#2412.
 *
 * `$t` ne fait que rendre une chaîne ; c'était le CODE qui choisissait le
 * pluriel (`n > 1 ? '…Many' : '…One'`). Assez pour l'anglais et le français,
 * pas pour le polonais (1 / 2-4 / 5+) ni le roumain (1 / 2-19 / 20+ « de »),
 * et faux même en anglais pour zéro (« 0 track ») ou en français quand le
 * code testait `n === 1` (« 0 titres »).
 *
 * Une clé plurielle porte désormais toutes ses formes dans SA langue, au
 * format ICU, sous-ensemble `plural` :
 *
 *     "{n, plural, one {# utwór} few {# utwory} many {# utworów} other {# utworu}}"
 *
 * La catégorie est celle que rend `Intl.PluralRules(langue).select(n)` ; `#`
 * devient le nombre formaté dans la langue ; `=0 { … }` est accepté pour un
 * cas exact. Une catégorie absente retombe sur `other`. Le texte hors
 * accolades ICU est rendu tel quel, `{n}` / `{count}` compris.
 */

export type CategoriePluriel = Intl.LDMLPluralRule;

const CATEGORIES: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

interface Bloc { debut: number; fin: number; variable: string; formes: Map<string, string> }

/** L'accolade fermante qui répond à celle de `depuis`, ou -1. */
function fermante(s: string, depuis: number): number {
  let prof = 0;
  for (let i = depuis; i < s.length; i++) {
    if (s[i] === '{') prof++;
    else if (s[i] === '}') { prof--; if (prof === 0) return i; }
  }
  return -1;
}

/**
 * Les blocs `{var, plural, …}` du message. Lève sur un bloc mal formé :
 * `check-i18n` s'en sert pour refuser une traduction cassée avant qu'elle
 * ne s'affiche en clair.
 */
export function blocsPluriels(message: string): Bloc[] {
  const blocs: Bloc[] = [];
  const entete = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = entete.exec(message))) {
    const debut = m.index;
    const fin = fermante(message, debut);
    if (fin < 0) throw new Error(`bloc pluriel non fermé : ${message}`);
    const corps = message.slice(debut + m[0].length, fin);
    const formes = new Map<string, string>();
    let i = 0;
    while (i < corps.length) {
      const sel = /^\s*(=\d+|[a-z]+)\s*\{/.exec(corps.slice(i));
      if (!sel) {
        if (corps.slice(i).trim() === '') break;
        throw new Error(`forme plurielle illisible : ${message}`);
      }
      const ouvre = i + sel[0].length - 1;
      const ferme = fermante(corps, ouvre);
      if (ferme < 0) throw new Error(`forme plurielle non fermée : ${message}`);
      const cle = sel[1];
      if (!cle.startsWith('=') && !CATEGORIES.includes(cle)) throw new Error(`catégorie inconnue « ${cle} » : ${message}`);
      formes.set(cle, corps.slice(ouvre + 1, ferme));
      i = ferme + 1;
    }
    if (!formes.has('other')) throw new Error(`forme « other » manquante : ${message}`);
    blocs.push({ debut, fin, variable: m[1], formes });
    entete.lastIndex = fin + 1;
  }
  return blocs;
}

// Les dictionnaires sont stables ; une grille peut rendre le même compteur
// des milliers de fois. Le nombre courant n'appartient jamais à ces caches.
const formatsParLangue = new Map<string, { regles: Intl.PluralRules; nombre: Intl.NumberFormat }>();
const messagesAnalyses = new Map<string, Bloc[] | null>();

function formats(langue: string) {
  let format = formatsParLangue.get(langue);
  if (!format) {
    format = { regles: new Intl.PluralRules(langue), nombre: new Intl.NumberFormat(langue) };
    formatsParLangue.set(langue, format);
  }
  return format;
}

/** Rend `message` pour le nombre `n` dans `langue`. Sans bloc ICU, le message revient tel quel. */
export function formaterPluriel(message: string, n: number, langue: string): string {
  if (!messagesAnalyses.has(message)) {
    try { messagesAnalyses.set(message, blocsPluriels(message)); }
    catch { messagesAnalyses.set(message, null); }
  }
  const blocs = messagesAnalyses.get(message);
  if (!blocs?.length) return message;
  const format = formats(langue);
  const regles = format.regles;
  const nombre = format.nombre.format(n);
  let sortie = '';
  let curseur = 0;
  for (const b of blocs) {
    const forme = b.formes.get(`=${n}`) ?? b.formes.get(regles.select(n)) ?? b.formes.get('other')!;
    sortie += message.slice(curseur, b.debut) + forme.replace(/#/g, nombre);
    curseur = b.fin + 1;
  }
  return sortie + message.slice(curseur);
}

/**
 * Les catégories qu'une langue atteint pour un nombre ENTIER d'usage courant
 * (0 à 1000), plus `other`, toujours exigée par ICU. Le `many` du français
 * (un million pile) n'en fait pas partie : il retombe sur `other`.
 */
export function categoriesExigees(langue: string): CategoriePluriel[] {
  const regles = formats(langue).regles;
  const vues = new Set<CategoriePluriel>(['other']);
  for (let n = 0; n <= 1000; n++) vues.add(regles.select(n));
  return CATEGORIES.filter((c) => vues.has(c as CategoriePluriel)) as CategoriePluriel[];
}
