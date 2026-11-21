/**
 * « Ce téléphone » — la zone navigateur de CET appareil, en un appui.
 *
 * Essai en 5G du 09/10/2026, Bertrand : « Il me faut sur l'iPhone une sortie
 * sur cet iPhone !! », puis « Je ne vois pas de zone téléphone ! ». Les zones
 * navigateur existaient (« Cet ordinateur », « aPhone »), mais rien ne disait
 * laquelle était CE téléphone, et la création d'une zone vivait dans l'écran
 * Zones, loin de la barre de lecture.
 *
 * Une zone navigateur n'appartient à aucune machine côté serveur
 * (`output_device_id: null`, voir `zoneNavigateur.ts`) : c'est donc CET
 * appareil qui retient la sienne.
 * Deux appareils sur la même zone navigateur se voleraient le flux (session
 * à consommateur unique) : chaque appareil a la sienne.
 *
 * 🔴 web#3180 — la retenue passe par `retenirZoneDeCetAppareil`, la clé de
 * `zoneNavigateurProprietaire.ts` (pour l'onglet). Avant, « Ce téléphone »
 * rangeait la sienne sous une autre clé : la zone qu'il créait ou retrouvait
 * n'était pas jouable ici dès que ce navigateur en avait retenu une autre.
 *
 * 🔴 web#3314 — LE NOM NE DÉSIGNE PAS L'APPAREIL. Depuis #3180, la prise ne
 * vaut que pour l'onglet : à chaque onglet neuf, « Ce téléphone » repassait par
 * la recherche d'un HOMONYME (« Ce téléphone » ou « Ce téléphone (…) »).
 * Dans un foyer à deux téléphones, le B retenait la zone du A et lui prenait
 * le flux (session à consommateur unique).
 *
 * Le serveur n'offre aucun champ où marquer le propriétaire d'une zone
 * navigateur : `output_device_id` doit rester nul (l'orchestrateur ne la
 * reconnaît comme navigateur qu'à cette condition, `resolve_direct.rs`), et
 * aucune métadonnée libre n'existe. La marque vit donc ICI : un identifiant
 * d'appareil tiré une fois et, avec lui, la liste des zones que « Ce
 * téléphone » a créées sur cet appareil — dans `localStorage`, durable. Ce
 * registre ne rend AUCUNE zone jouable : il dit seulement laquelle reprendre
 * au prochain appui. La prise, elle, reste à l'onglet (`sessionStorage`,
 * décision de #3180).
 *
 * Ordre de résolution :
 *   1. la dernière zone retenue par cet onglet qui est encore une zone
 *      navigateur ;
 *   2. la dernière zone navigateur née sur CET appareil (registre) ;
 *   3. sinon on en crée une — « Ce téléphone », ou « Ce téléphone (2) » si un
 *      homonyme (celui d'un autre appareil) existe déjà —, on la retient et
 *      on la note au registre. Un homonyme n'est JAMAIS pris.
 */
import type { ZoneCandidate } from './zoneNavigateur';
import {
  derniereZoneRetenue,
  retenirZoneDeCetAppareil,
  zonesRetenues,
} from './zoneNavigateurProprietaire';
import { noterZoneNeeIci, zonesNeesIci } from './registreCetAppareil';

export { identifiantDeCetAppareil, zonesNeesIci } from './registreCetAppareil';

/**
 * Le nom d'une zone neuve : `base`, ou `base (2)`, `base (3)`… si une zone
 * le porte déjà (le serveur peut y accoler l'IP : « base (2) (192.168.1.20) »).
 */
export function nomLibre(zones: readonly ZoneCandidate[], base: string): string {
  const noms = zones.map((z) => (z?.name ?? '').trim());
  const pris = (nom: string) => noms.some((n) => n === nom || n.startsWith(`${nom} (`));
  // `base (…)` couvre aussi le suffixe d'IP du serveur : « Ce téléphone (10.0.0.4) ».
  if (!pris(base)) return base;
  for (let n = 2; ; n++) {
    const candidat = `${base} (${n})`;
    if (!pris(candidat)) return candidat;
  }
}

export function idRetenu(): number | null {
  return derniereZoneRetenue();
}

function retenir(id: number): void {
  retenirZoneDeCetAppareil(id);
}

export async function zoneDeCetAppareil(
  zones: readonly ZoneCandidate[],
  nom: string,
  creer: (nom: string) => Promise<{ id?: number | null } | null | undefined>,
): Promise<number> {
  const navigateurs = zones.filter((z) => z?.output_type === 'browser' && z.id != null);
  const retenues = zonesRetenues() ?? [];
  for (let i = retenues.length - 1; i >= 0; i--) {
    if (navigateurs.some((z) => z.id === retenues[i])) return retenues[i];
  }
  const neesIci = zonesNeesIci();
  for (let i = neesIci.length - 1; i >= 0; i--) {
    if (navigateurs.some((z) => z.id === neesIci[i])) {
      retenir(neesIci[i]);
      return neesIci[i];
    }
  }
  // web#3314 — un homonyme sans la marque de cet appareil est la zone d'un
  // autre : on ne la prend pas, on en crée une à soi sous un nom libre.
  const cree = await creer(nomLibre(zones, nom.trim()));
  if (cree?.id == null) throw new Error('zone navigateur non créée');
  noterZoneNeeIci(cree.id);
  retenir(cree.id);
  return cree.id;
}
