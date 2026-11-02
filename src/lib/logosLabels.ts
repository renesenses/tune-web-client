/**
 * web#2297 — la vue GRILLE de l'onglet Labels : un logo, le nom, le nombre
 * d'albums.
 *
 * Le logo vient du serveur (`GET /library/labels`, tune-server-rust#6736) :
 * l'image du label chez Qobuz, mise en cache comme une pochette. Le serveur la
 * cherche en arrière-plan et sans rafale ; un label dont le logo n'est pas
 * (encore) connu montre un MONOGRAMME — jamais une image cassée.
 *
 * Les albums et leur compte restent ceux de l'onglet (le regroupement de
 * `LibraryV2`) : seul le logo est demandé au serveur. Un serveur qui ne
 * connaît pas la route rend une carte vide, et la grille tient en monogrammes.
 */
import type { LabelImageCredit, LibraryLabel } from './api';

/** La clé d'un nom de label : espaces resserrés, minuscules. LA MÊME que
 *  celle du serveur (`cle_de_label`, tune-core/src/library/logos_labels.rs) :
 *  deux graphies qui ne diffèrent que par la casse partagent leur logo. */
export function cleDeLabel(nom: string): string {
  return nom.trim().split(/\s+/).join(' ').toLowerCase();
}

/** `clé → adresse du logo`, pour les seuls labels qui en ont un. */
export function carteDesLogos(labels: readonly LibraryLabel[] | null | undefined): Map<string, string> {
  const carte = new Map<string, string>();
  for (const l of labels ?? []) {
    if (l && typeof l.name === 'string' && typeof l.image_url === 'string' && l.image_url) {
      carte.set(cleDeLabel(l.name), l.image_url);
    }
  }
  return carte;
}

/** L'adresse du logo de ce label, ou `null` : alors, le monogramme. */
export function logoDuLabel(carte: ReadonlyMap<string, string>, nom: string): string | null {
  return carte.get(cleDeLabel(nom)) ?? null;
}

const STATUTS = new Set(['free', 'non_free_identification', 'unknown']);

/** tune-server-rust#7089 — `clé → attribution`, pour les labels qui ont un
 *  logo : sa source et ce qu'on sait de sa licence. Une attribution
 *  incomplète (sans fournisseur ni statut, ou « libre » sans licence) est
 *  ignorée : on n'affiche jamais un crédit à moitié. */
export function carteDesCredits(
  labels: readonly LibraryLabel[] | null | undefined,
): Map<string, LabelImageCredit> {
  const carte = new Map<string, LabelImageCredit>();
  for (const l of labels ?? []) {
    const c = l?.image_credit;
    if (l && typeof l.name === 'string' && typeof l.image_url === 'string' && l.image_url
      && c && typeof c.provider === 'string' && c.provider
      && STATUTS.has(c.license_status)
      && (c.license_status !== 'free' || (typeof c.license === 'string' && c.license))) {
      carte.set(cleDeLabel(l.name), c);
    }
  }
  return carte;
}

/** L'attribution du logo de ce label, ou `null`. */
export function creditDuLabel(
  carte: ReadonlyMap<string, LabelImageCredit>,
  nom: string,
): LabelImageCredit | null {
  return carte.get(cleDeLabel(nom)) ?? null;
}

/** Le texte de l'attribution, au survol du logo, selon ce qu'on sait de la
 *  licence : libre (auteur, licence, source), non libre en usage
 *  d'identification, ou inconnue — et « licence à vérifier » pour un logo
 *  douteux. `tr` est la traduction. */
export function texteDuCredit(credit: LabelImageCredit, tr: (cle: string) => string): string {
  const source = credit.provider;
  const auteur = (credit.author ?? '').trim();
  let base: string;
  if (credit.license_status === 'free') {
    base = (auteur ? tr('v2.labels.logoCredit') : tr('v2.labels.logoCreditSansAuteur'))
      .replace('{auteur}', auteur)
      .replace('{licence}', credit.license ?? '')
      .replace('{source}', source);
  } else if (credit.license_status === 'non_free_identification') {
    base = tr('v2.labels.logoNonLibre').replace('{source}', source);
  } else {
    base = tr('v2.labels.logoLicenceInconnue').replace('{source}', source);
  }
  return credit.doubtful ? `${base} · ${tr('v2.labels.logoLicenceDouteuse')}` : base;
}

/**
 * Le monogramme d'un label sans logo : les initiales de ses deux premiers
 * mots (« Deutsche Grammophon » → « DG »), la première lettre d'un nom d'un
 * seul mot (« Verve » → « V »). Seuls lettres et chiffres comptent ; un nom
 * qui n'en a aucun rend « ? ».
 */
export function monogramme(nom: string): string {
  const mots = nom
    .split(/[\s\-_/&+.,·]+/)
    .map((m) => m.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((m) => m.length > 0);
  if (!mots.length) return '?';
  const lettres = mots.slice(0, 2).map((m) => Array.from(m)[0]);
  return lettres.join('').toLocaleUpperCase();
}

/** Les deux vues de la liste des labels, dans l'ordre de rotation. */
export const VUES_LABELS = ['list', 'grid'] as const;
export type VueLabels = (typeof VUES_LABELS)[number];
/** La clé de `lib/preferencesEcran` sous laquelle le choix est retenu. */
export const CLE_VUE_LABELS = 'lib.labelsVue';
