import { writable, derived, get } from 'svelte/store';
import { CHARGEURS, type Locale, type Dictionnaire } from './locales';
export type { Locale, Dictionnaire } from './locales';
export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ro: 'Română',
  sv: 'Svenska',
  hu: 'Magyar',
};
/**
 * 🔴 LES DICTIONNAIRES ARRIVENT À LA DEMANDE (tune-server-rust#4800, cause 4).
 *
 * `messages` importait les onze langues en statique : 2,5 Mo de source dans
 * le bundle principal, pour une seule langue lue. Chaque entrée démarre
 * VIDE et se remplit quand son chunk est arrivé — `chargerLocale(l)` — ou
 * quand un banc l'enregistre lui-même, en statique et à la collecte
 * (`enregistrerDictionnaire`, voir `__tests__/setupLocales.ts`).
 *
 * `revision` est le déclencheur : `t` en dérive, et chaque dictionnaire
 * posé la fait avancer, pour que les écrans déjà montés se retraduisent.
 */
const messages: Record<Locale, Dictionnaire> = {
  fr: {}, en: {}, de: {}, es: {}, it: {}, zh: {}, ja: {}, ko: {}, ro: {}, sv: {}, hu: {},
};
const chargees = new Set<Locale>();
const enCours = new Map<Locale, Promise<void>>();
const revision = writable(0);

/** Vrai quand le dictionnaire de `l` est en mémoire (chunk arrivé ou banc). */
export function dictionnaireCharge(l: Locale): boolean {
  return chargees.has(l);
}

/** Poser un dictionnaire sans passer par le réseau — les bancs, ou un préchargement. */
export function enregistrerDictionnaire(l: Locale, dict: Dictionnaire): void {
  messages[l] = dict;
  chargees.add(l);
  enCours.delete(l);
  revision.update((n) => n + 1);
}

/**
 * Charger le chunk d'une langue, une seule fois. Un échec réseau ne bloque
 * rien : la promesse se résout quand même, et `t` rend l'anglais si on l'a,
 * la clé nue sinon — un écran sans traduction vaut mieux qu'aucun écran.
 */
export function chargerLocale(l: Locale): Promise<void> {
  if (chargees.has(l)) return Promise.resolve();
  const deja = enCours.get(l);
  if (deja) return deja;
  const chargeur = CHARGEURS[l];
  if (!chargeur) return Promise.resolve();
  const p = chargeur()
    .then((m) => { enregistrerDictionnaire(l, m.default); })
    .catch((e) => { enCours.delete(l); console.warn(`[i18n] dictionnaire ${l} non chargé`, e); });
  enCours.set(l, p);
  return p;
}

/**
 * La langue demandée ET l'anglais, langue de repli — les deux avant le
 * premier rendu, pour qu'aucune clé nue ne s'affiche (`main.ts` l'attend
 * avant de monter la coquille).
 */
export function preparerLocale(l: Locale): Promise<void> {
  return Promise.all([chargerLocale(l), chargerLocale('en')]).then(() => undefined);
}

const langue = writable<Locale>('fr');
let derniereDemande = 0;
/**
 * Le magasin de la langue active. `set(l)` bascule TOUT DE SUITE si le
 * dictionnaire est en mémoire ; sinon il charge le chunk, PUIS bascule —
 * jamais l'inverse, sinon l'écran montrerait l'anglais (ou les clés) le
 * temps du transfert. Deux demandes qui se croisent : seule la dernière
 * s'applique.
 */
export const locale = {
  subscribe: langue.subscribe,
  set(l: Locale): void {
    const n = ++derniereDemande;
    if (chargees.has(l) && chargees.has('en')) { langue.set(l); return; }
    void preparerLocale(l).then(() => { if (n === derniereDemande) langue.set(l); });
  },
  update(fn: (l: Locale) => Locale): void {
    locale.set(fn(get(langue)));
  },
};
/**
 * 🔴 LE REPLI SE FAIT EN ANGLAIS, PAS EN FRANÇAIS.
 *
 * Silviu, testeur roumain, v0.9.161 : des mots FRANÇAIS au milieu d'une
 * interface roumaine. `fr.ts` est la SOURCE du catalogue — c'est elle que
 * `scripts/check-i18n.mjs` compare aux dix autres — mais être la source ne
 * fait pas d'elle la langue de secours. Une clé absente d'un dictionnaire
 * rendait du français à un lecteur qui n'en lit pas un mot, alors que
 * l'anglais est ce que tout le monde peut au moins déchiffrer.
 *
 * La parité est tenue à 100 % par `check-i18n` : ce repli ne devrait jamais
 * servir. Il sert quand même — le temps d'une branche où une clé vient d'être
 * ajoutée à `fr.ts` seul, ou pour une clé construite à l'exécution (les
 * libellés de sections Qobuz passent par `$t` alors qu'ils n'en sont pas).
 * C'est précisément dans ces trous que le français fuyait.
 *
 * `en` reste dernier avant la clé nue : si elle manque là aussi, rendre la
 * clé est plus honnête que rendre une autre langue.
 */
export const t = derived([langue, revision], ([$l]) => {
  const dict = chargees.has($l) ? messages[$l] : messages.en;
  return (key: string) => dict[key] ?? messages.en[key] ?? key;
});
