/**
 * Une zone navigateur ne se joue que sur l'appareil qui l'a créée (rc4).
 *
 * 10/10/2026, .18 : l'app iOS Tune Remote crée sa zone « Ce téléphone »
 * (zone 25). C'est une zone `browser`, comme « Cet ordinateur ». Un Safari
 * ouvert sur le réseau local l'affichait et, comme le web jouait TOUTE zone
 * `browser` affichée, il l'a lue lui-même : le flux du serveur est à
 * consommateur unique, Safari l'a vidé en 337 ms, et l'iPhone, arrivé deux
 * secondes plus tard, n'a rien reçu.
 *
 * ## La règle
 *
 * Une zone navigateur qui appartient à un autre appareil (téléphone, autre
 * navigateur) s'affiche et se pilote, mais **ne se joue jamais ici**.
 *
 * ## Comment ce navigateur reconnaît la sienne
 *
 * Le serveur ne marque aucun propriétaire : une zone `browser` porte
 * `output_device_id: null`, et le seul indice qu'il pose est l'IP du client
 * accolée au nom à la création — qu'un renommage efface. C'est donc ce
 * navigateur qui retient les zones qu'il a créées ou revendiquées (bouton
 * « Créer une zone sur cet ordinateur »), dans son `sessionStorage` — propre à
 * l'origine, donc au serveur, et à l'onglet (web#3180, plus bas).
 *
 * ## Les zones d'avant cette règle
 *
 * Un navigateur qui n'a encore rien retenu (première visite après la mise à
 * jour) continue de jouer les zones qui portent le nom que le web leur donne,
 * « Cet ordinateur » dans l'une des 11 langues (suffixe d'IP du serveur
 * toléré). Sans cela, chaque « Cet ordinateur » existant deviendrait muet du
 * jour au lendemain. Dès que ce navigateur retient une zone, ce repli cesse.
 * La zone d'un téléphone ne porte jamais ce nom.
 */

import { writable } from 'svelte/store';
import {
  ANCIENNE_CLE_ZONE_DE_CET_APPAREIL,
  migrerAncienneZoneDeCetAppareil,
} from './registreCetAppareil';

const CLE = 'tune.zonesNavigateurDeCetAppareil';

/**
 * Le nom que le web donne à sa zone (`settings.thisComputer`, 11 langues), puis
 * ceux que le serveur lui donne depuis #3067 (tune-server-rust 5f2a821e9) :
 * une zone navigateur restée sur « Cet ordinateur » / « This computer » est
 * renommée « Ce navigateur » / « This browser » au démarrage. Le serveur n'a
 * pas d'autre nom (pas de clé i18n) ; on garde les anciens pour les serveurs
 * plus anciens.
 */
const NOMS_DU_WEB = [
  'Ce navigateur', 'This browser',
  'This computer', 'Cet ordinateur', 'Dieser Computer', 'Questo computer',
  'Este ordenador', 'Acest computer', 'Den här datorn', 'Ez a számítógép',
  '本机', '이 컴퓨터', 'このコンピューター',
].map((n) => n.toLocaleLowerCase());

interface ZoneLue {
  id?: number | null;
  name?: string | null;
  output_type?: string | null;
}

/**
 * 🔴 web#3180 — LA PRISE NE VAUT QUE POUR L'ONGLET.
 *
 * FabienM, fil 2864 (rc12, Firefox + app Remote Android) : le Firefox du PC
 * avait retenu, un jour, la zone « Z Fold8 de Fab » de son téléphone. Rangée
 * dans `localStorage`, la prise durait pour toujours, sans rien pour la
 * relâcher : chaque lecture de cette zone, d'où qu'elle vienne, était tirée
 * par le PC, et le téléphone restait muet (flux à consommateur unique).
 *
 * Décision de Bertrand (20/11) : la prise vit dans `sessionStorage` — elle
 * meurt avec l'onglet — et la carte de la zone offre « Ne plus jouer ici ».
 * L'ancienne valeur persistée est oubliée, comme celle de « Ce téléphone »
 * (`tune.zoneNavigateur.cetAppareil`), qui passe par la même clé — après
 * que sa zone est entrée au registre de cet appareil (web#3314).
 */
const ANCIENNES_CLES_PERSISTEES = [CLE, ANCIENNE_CLE_ZONE_DE_CET_APPAREIL];
let ancienneRetentionOubliee = false;

function oublierAncienneRetention(): void {
  if (ancienneRetentionOubliee) return;
  ancienneRetentionOubliee = true;
  // web#3314 — la zone de « Ce téléphone » passe au registre AVANT l'effacement.
  migrerAncienneZoneDeCetAppareil();
  try {
    for (const cle of ANCIENNES_CLES_PERSISTEES) localStorage.removeItem(cle);
  } catch {
    /* stockage indisponible : rien à oublier */
  }
}

/**
 * Change à chaque prise ou relâchement : l'écran des zones s'y abonne pour
 * montrer ou retirer « Ne plus jouer ici » sans attendre un autre rendu.
 */
export const versionZonesRetenues = writable(0);

/** Les zones retenues — `null` : ce navigateur n'a encore rien retenu. */
export function zonesRetenues(): number[] | null {
  oublierAncienneRetention();
  try {
    const brut = sessionStorage.getItem(CLE);
    if (brut == null) return null;
    const v = JSON.parse(brut);
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return null;
  }
}

function ecrire(ids: number[]): void {
  try {
    sessionStorage.setItem(CLE, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : la zone reste jouable par le repli du nom */
  }
  versionZonesRetenues.update((n) => n + 1);
}

/** Retient `id` comme zone de cet appareil (création, revendication), pour cet onglet. */
export function retenirZoneDeCetAppareil(id: number): void {
  if (!Number.isInteger(id)) return;
  const deja = zonesRetenues() ?? [];
  if (deja.includes(id)) return;
  ecrire([...deja, id]);
}

/**
 * web#3180 — « Ne plus jouer ici » : cet onglet relâche la zone `id`.
 *
 * Quand plus rien n'est retenu, on rend la main au repli par le nom (les
 * « Ce navigateur » de cet onglet redeviennent jouables), sauf si la zone
 * relâchée porte elle-même ce nom : le repli la reprendrait aussitôt, on
 * garde donc une liste vide.
 */
export function relacherZoneDeCetAppareil(id: number, nom?: string | null): void {
  if (!Number.isInteger(id)) return;
  const reste = (zonesRetenues() ?? []).filter((x) => x !== id);
  if (reste.length === 0 && !porteLeNomDuWeb(nom)) {
    try {
      sessionStorage.removeItem(CLE);
    } catch {
      /* stockage indisponible */
    }
    versionZonesRetenues.update((n) => n + 1);
    return;
  }
  ecrire(reste);
}

/** La dernière zone retenue par cet onglet — celle de « Ce téléphone ». */
export function derniereZoneRetenue(): number | null {
  const ids = zonesRetenues();
  return ids && ids.length ? ids[ids.length - 1] : null;
}

function porteLeNomDuWeb(nom: string | null | undefined): boolean {
  if (!nom) return false;
  // Le serveur accole l'IP du client : « Cet ordinateur (192.168.1.20) ».
  const nu = nom.replace(/\s*\([^)]*\)\s*$/, '').trim().toLocaleLowerCase();
  return NOMS_DU_WEB.includes(nu);
}

/** La zone est-elle une zone navigateur de CET appareil ? */
export function estZoneDeCetAppareil(zone: ZoneLue | null | undefined): boolean {
  if (zone?.output_type !== 'browser' || typeof zone.id !== 'number') return false;
  const retenues = zonesRetenues();
  if (retenues) return retenues.includes(zone.id);
  return porteLeNomDuWeb(zone.name);
}

/**
 * Le lecteur local doit-il jouer cette zone ? Seulement une zone navigateur de
 * cet appareil. Celle d'un autre appareil se pilote sans être lue ici.
 */
export function estZoneJouableIci(zone: unknown): boolean {
  return estZoneDeCetAppareil(zone as ZoneLue | null | undefined);
}
