/**
 * LES APPAREILS PROPOSÉS À LA CRÉATION D'UNE ZONE — nouveau client.
 *
 * Bug du .18, 17/09/2026 : « impossible de créer une nouvelle zone ! Comment
 * sélectionner un appareil ?? » — bandeau « zone_sans_appareil : La zone
 * « Test » n'aurait aucune sortie : choisissez un appareil découvert avant de
 * la créer ».
 *
 * Depuis tune-server-rust #3835 / #3838, `POST /zones` refuse un corps qui
 * annonce une sortie sans la nommer. Or `ZonesV2` ne demandait qu'un NOM et
 * appelait `createZone(name)` — soit `output_type: 'local'` sans appareil :
 * toute création était refusée, et l'écran n'offrait aucun moyen d'en choisir
 * un. L'ancienne interface (`ZoneManagerView`) propose ce choix depuis
 * longtemps ; on reprend ses trois sources, sans sa « sortie par défaut » que
 * le serveur refuse désormais elle aussi.
 */
import type { DiscoveredDevice, LocalAudioDevice, OutputType, Zone } from './types';
import { zoneTypeLabel } from './zoneIdentity';
import { deviceHasBoundZone, deviceZoneTargetId } from './hiddenZoneRecovery';

export type GroupeAppareil = 'navigateur' | 'local' | 'reseau';

export interface CandidatZone {
  /** Clé stable pour le sélecteur. */
  cle: string;
  groupe: GroupeAppareil;
  nom: string;
  outputType: OutputType;
  /** `undefined` pour le navigateur, dont la sortie est l'onglet. */
  deviceId?: string;
}

/**
 * Tout ce qu'on peut choisir : ce navigateur, les cartes son du serveur, puis
 * les appareils du réseau DISPONIBLES et pas déjà tenus par une zone.
 */
export function candidatsNouvelleZone(
  locaux: readonly LocalAudioDevice[] | null | undefined,
  decouverts: readonly DiscoveredDevice[] | null | undefined,
  zones: readonly Zone[] | null | undefined,
  nomNavigateur: string,
): CandidatZone[] {
  const liees = new Set(
    (zones ?? []).map((z) => z.output_device_id).filter((x): x is string => !!x),
  );
  const out: CandidatZone[] = [
    { cle: 'browser', groupe: 'navigateur', nom: nomNavigateur, outputType: 'browser' },
  ];
  for (const d of locaux ?? []) {
    if (!d?.id) continue;
    out.push({ cle: `local|${d.id}`, groupe: 'local', nom: d.name, outputType: 'local', deviceId: d.id });
  }
  for (const d of decouverts ?? []) {
    if (!d?.id || d.available === false || d.type === 'local' || d.type === 'browser') continue;
    if (!deviceHasBoundZone(d, liees)) {
      const id = deviceZoneTargetId(d);
      out.push({ cle: `${d.type}|${id}`, groupe: 'reseau', nom: d.name, outputType: d.type, deviceId: id });
    }
    out.push(...autresProtocolesLibres(d, liees));
  }
  return out;
}

/**
 * Les AUTRES protocoles d'un même appareil, chacun proposable pour sa zone —
 * fil 1927 (FabienM, 0.9.164).
 *
 * Le serveur replie les annonces d'un même appareil (même hôte, même nom) en
 * une seule ligne de `GET /devices` : le protocole prioritaire en tête, les
 * autres dans `capabilities.alternatives` (`dedup_devices`, tune-server-rust).
 * Une Beosound Stage parle DLNA ET Cast : sa ligne est « dlna », le Cast est
 * une alternative.
 *
 * Or dès qu'une zone tenait l'identité DLNA, `deviceHasBoundZone` écartait la
 * ligne ENTIÈRE, Cast compris : « impossible de tester ma zone dans un autre
 * protocole que DLNA ». Le serveur, lui, accepte une zone Cast sur le même
 * appareil (`POST /zones` ne dédoublonne par hôte que le DLNA/OpenHome).
 *
 * Règle : une alternative d'un protocole que NI la tête NI aucune identité
 * déjà tenue par une zone ne parle est proposée pour elle-même, une par
 * protocole. Les doublons d'un même protocole (deux UUID SSDP, deux annonces
 * RAOP) restent repliés, et une identité déjà tenue n'est jamais reproposée.
 * La restauration d'une zone masquée garde son seul chemin, la tête.
 */
function autresProtocolesLibres(d: DiscoveredDevice, liees: ReadonlySet<string>): CandidatZone[] {
  if (d.zone_hidden) return [];
  const alternatives: unknown[] = Array.isArray(d.capabilities?.alternatives)
    ? d.capabilities!.alternatives
    : [];
  const membres: Array<{ id: string; nom: string; type: OutputType }> = [];
  for (const a of alternatives) {
    if (!a || typeof a !== 'object') continue;
    const { id, name, device_type } = a as { id?: unknown; name?: unknown; device_type?: unknown };
    if (typeof id !== 'string' || !id || typeof device_type !== 'string') continue;
    membres.push({ id, nom: typeof name === 'string' && name.trim() ? name : d.name, type: device_type as OutputType });
  }
  const tenus = new Set<string>();
  if (liees.has(d.id)) tenus.add(d.type);
  for (const m of membres) if (liees.has(m.id)) tenus.add(m.type);
  const vus = new Set<string>([d.type, ...tenus]);
  const out: CandidatZone[] = [];
  for (const m of membres) {
    if (vus.has(m.type) || m.type === 'local' || m.type === 'browser') continue;
    vus.add(m.type);
    out.push({ cle: `${m.type}|${m.id}`, groupe: 'reseau', nom: m.nom, outputType: m.type, deviceId: m.id });
  }
  return out;
}

/**
 * Le libellé d'un appareil proposé — SON NOM, ET SON PROTOCOLE — #1234.
 *
 * Bertrand, présentation du 18/09/2026 : « Créer zone — manque le protocole ».
 * Un même appareil s'annonce souvent plusieurs fois, une par protocole qu'il
 * parle, et la liste montrait alors deux entrées qu'aucun signe ne
 * distinguait. On en prend une au hasard, et on découvre la différence à
 * l'usage : qualité, gestion du volume et reprise après coupure ne se valent
 * pas d'un protocole à l'autre.
 *
 * Mesuré sur le .18 le 19/09/2026, `GET /devices` — dix appareils, dont :
 *
 *     dlna      DMP-A8
 *     dlna      DMP-A8 (Tune)
 *     airplay   eversolo,1
 *     airplay   Chambre
 *     oaat      Tune Endpoint
 *
 * 🔴 `zoneTypeLabel` est RÉUTILISÉ, pas réécrit. Il vit dans `zoneIdentity` et
 * sert déjà les cartes de zone des Réglages (#1065) ; une seconde table de
 * protocoles divergerait au premier ajout, et l'écran de création nommerait
 * un protocole autrement que l'écran des zones.
 *
 * ⚠️ Il rend la CHAÎNE VIDE pour `local` — délibérément : « Local répète le
 * nom ». Le groupe « Sorties du serveur » le dit déjà dans son en-tête, on
 * n'ajoute donc rien. Idem pour le navigateur.
 */
export function libelleCandidat(c: CandidatZone | null | undefined): string {
  const nom = (c?.nom ?? '').trim();
  const proto = zoneTypeLabel(c?.outputType).trim();
  if (!proto) return nom;
  return nom ? `${nom} · ${proto}` : proto;
}
