/**
 * tune-server-rust#8866 — Réglages › Général : les entrées de menu portées
 * par un greffon disent quand ce greffon n'est pas là.
 *
 * Constat (testeur Premium, Docker QNAP, rc12, 16/11/2026) : « Tune Circle »
 * et « Ma collection physique » sont cochées dans la liste des entrées de la
 * barre latérale, interrupteur vert, et n'apparaissent pas dans la barre. Leur
 * greffon n'est pas installé : la barre ne montre une entrée de greffon que
 * quand il tourne (`circleCharge`, `collectionPhysiqueChargee`,
 * `entreesStudioVisibles`, Crossfeed Pro et Crosstalk sondés à part).
 * L'interrupteur, lui, ne regardait que la préférence : il laissait croire à
 * une fonction disponible.
 *
 * Ce module dit, pour chaque entrée, quel greffon la porte et dans quel état
 * il est, à partir des MÊMES lectures que la barre (`GET /plugins`, publié
 * dans `etatGreffons`, et les sondes des greffons natifs tiers). La ligne du
 * réglage le dit (« Greffon non installé ») et propose d'aller à la fiche du
 * greffon dans Réglages › Extensions, au lieu d'un interrupteur sans effet.
 *
 * Rien n'est supposé : tant que l'état n'est pas lu (`inconnu`), la ligne
 * reste telle qu'avant. Un serveur d'avant la v0.9.156 (sans `installed`)
 * n'a pas d'avis non plus : la barre montre alors les outils Studio, la ligne
 * aussi.
 */
import { writable } from 'svelte/store';
import type { MergedPlugin } from './api';
import type { PresenceCrossfeedPro } from './crossfeedPro';
import { CROSSFEED_PRO_ID } from './crossfeedPro';
import { CROSSTALK_ID } from './crosstalk';
import { VUES_GREFFONS } from './stores/greffonsStudio';
import { v2SettingsTarget } from './stores/v2SettingsNav';

/** Le greffon qui porte une entrée : un greffon de `GET /plugins` (`sdk`) ou
 *  un greffon audio natif tiers (`natif`, absent de cette liste). */
export interface GreffonDeLEntree {
  nature: 'sdk' | 'natif';
  nom: string;
}

/**
 * Les entrées de la barre portées par un greffon. Le nom est celui du greffon
 * côté serveur (`p.name` de `GET /plugins`, ou l'identifiant natif).
 */
export const GREFFONS_DES_ENTREES: Record<string, GreffonDeLEntree> = {
  concerts: { nature: 'sdk', nom: 'concerts' },
  circle: { nature: 'sdk', nom: 'circle' },
  collectionphysique: { nature: 'sdk', nom: 'collection-physique' },
  ...Object.fromEntries(
    Object.entries(VUES_GREFFONS).map(([vue, nom]) => [vue, { nature: 'sdk', nom } as GreffonDeLEntree]),
  ),
  crossfeedpro: { nature: 'natif', nom: CROSSFEED_PRO_ID },
  crosstalk: { nature: 'natif', nom: CROSSTALK_ID },
};

/**
 * - `sans`         : l'entrée ne dépend d'aucun greffon ;
 * - `inconnu`      : pas encore lu, ou serveur sans avis : rien ne change ;
 * - `actif`        : le greffon tourne ;
 * - `non_installe` : présent dans ce serveur, pas installé ;
 * - `inactif`      : installé, désactivé ;
 * - `a_redemarrer` : installé et voulu actif, monté au prochain démarrage ;
 * - `indisponible` : ce serveur ne connaît pas ce greffon (rien à installer).
 */
export type EtatGreffonEntree =
  | 'sans' | 'inconnu' | 'actif' | 'non_installe' | 'inactif' | 'a_redemarrer' | 'indisponible';

/** Les vues dont la barre garde l'entrée quand le greffon est ABSENT de la liste
 *  (serveur d'avant les greffons audio : `entreeStudioVisible(undefined)`). */
const VUES_STUDIO = new Set(Object.keys(VUES_GREFFONS));

export interface PresencesNatives {
  crossfeedpro: PresenceCrossfeedPro;
  crosstalk: PresenceCrossfeedPro;
}

export function etatGreffonDeLEntree(
  vue: string,
  greffons: Record<string, MergedPlugin> | null,
  natifs: PresencesNatives,
): EtatGreffonEntree {
  const g = GREFFONS_DES_ENTREES[vue];
  if (!g) return 'sans';
  if (g.nature === 'natif') {
    const p = vue === 'crosstalk' ? natifs.crosstalk : natifs.crossfeedpro;
    if (p === 'actif') return 'actif';
    if (p === 'absent') return 'non_installe';
    if (p === 'inactif') return 'inactif';
    return 'inconnu';
  }
  if (!greffons) return 'inconnu';
  const p = greffons[g.nom];
  if (!p) return VUES_STUDIO.has(vue) ? 'inconnu' : 'indisponible';
  if (typeof p.installed !== 'boolean') return 'inconnu';
  if (!p.installed) return 'non_installe';
  const actif = p.enabled ?? (p as { status?: string }).status === 'active';
  if (!actif) return 'inactif';
  const fiche = p as { loaded?: boolean; restart_required?: boolean };
  if (fiche.loaded === false && fiche.restart_required === true) return 'a_redemarrer';
  return 'actif';
}

/**
 * L'interrupteur de la ligne est-il SANS EFFET ? Oui quand la barre n'affiche
 * pas l'entrée dans cet état, quoi qu'on coche. Concerts fait exception : son
 * entrée reste visible tant que le serveur l'embarque, et son écran explique
 * l'installation (`concertsUtilisable`).
 */
export function interrupteurSansEffet(vue: string, etat: EtatGreffonEntree): boolean {
  if (etat === 'indisponible') return true;
  if (vue === 'concerts') return false;
  return etat === 'non_installe' || etat === 'inactif';
}

/** La mention de la ligne, ou `null` quand il n'y a rien à dire. */
export const MENTION_ETAT: Partial<Record<EtatGreffonEntree, string>> = {
  non_installe: 'settings.sidebarPluginNotInstalled',
  inactif: 'settings.sidebarPluginDisabled',
  a_redemarrer: 'settings.sidebarPluginRestart',
  indisponible: 'settings.sidebarPluginUnavailable',
};

/** Le geste proposé, ou `null` (greffon que ce serveur ne connaît pas). */
export const GESTE_ETAT: Partial<Record<EtatGreffonEntree, string>> = {
  non_installe: 'settings.sidebarPluginInstall',
  inactif: 'settings.sidebarPluginEnable',
  a_redemarrer: 'settings.sidebarPluginOpen',
};

/**
 * La fiche à amener à l'écran dans Réglages › Extensions : `sdk:<nom>`
 * (`[data-plugin]`) ou `natif:<id>` (`[data-natif]`, `[data-catalogue]`).
 * Consommée une fois par `PluginsV2`.
 */
export const ficheGreffonAOuvrir = writable<string | null>(null);

/** Ouvre Réglages › Extensions sur la fiche du greffon qui porte `vue`. */
export function ouvrirLaFicheDuGreffon(vue: string): void {
  const g = GREFFONS_DES_ENTREES[vue];
  if (!g) return;
  ficheGreffonAOuvrir.set(`${g.nature}:${g.nom}`);
  // `reglage` : l'onglet s'ouvre même sous le niveau Expert (section forcée).
  v2SettingsTarget.set({ tab: 'extensions', section: 'plugins', reglage: 'extensions' });
}

/** Le sélecteur de la fiche visée dans l'écran des Extensions. */
export function selecteurDeLaFiche(cible: string): string | null {
  const i = cible.indexOf(':');
  if (i < 0) return null;
  const nature = cible.slice(0, i);
  const nom = cible.slice(i + 1).replace(/["\\]/g, '');
  if (!nom) return null;
  if (nature === 'sdk') return `[data-plugin="${nom}"]`;
  if (nature === 'natif') return `[data-natif="${nom}"], [data-catalogue="${nom}"]`;
  return null;
}
