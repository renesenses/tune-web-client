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
 * « Créer une zone sur cet ordinateur »), dans son `localStorage` — propre à
 * l'origine, donc au serveur.
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

const CLE = 'tune.zonesNavigateurDeCetAppareil';

/** Le nom que le web donne à sa zone (`settings.thisComputer`, 11 langues). */
const NOMS_DU_WEB = [
  'This computer', 'Cet ordinateur', 'Dieser Computer', 'Questo computer',
  'Este ordenador', 'Acest computer', 'Den här datorn', 'Ez a számítógép',
  '本机', '이 컴퓨터', 'このコンピューター',
].map((n) => n.toLocaleLowerCase());

interface ZoneLue {
  id?: number | null;
  name?: string | null;
  output_type?: string | null;
}

/** Les zones retenues — `null` : ce navigateur n'a encore rien retenu. */
export function zonesRetenues(): number[] | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut == null) return null;
    const v = JSON.parse(brut);
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return null;
  }
}

/** Retient `id` comme zone de cet appareil (création, revendication). */
export function retenirZoneDeCetAppareil(id: number): void {
  if (!Number.isInteger(id)) return;
  const deja = zonesRetenues() ?? [];
  if (deja.includes(id)) return;
  try {
    localStorage.setItem(CLE, JSON.stringify([...deja, id]));
  } catch {
    /* stockage indisponible : la zone reste jouable par le repli du nom */
  }
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
