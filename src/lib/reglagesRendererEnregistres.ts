/**
 * La configuration du renderer, ENREGISTRÉE à la main et rattachée à l'appareil.
 *
 * Bertrand, deux fois : le 08/09/2026 « je veux un bouton sur l'UI de Tune
 * sauvegarder mes réglages en local ! », puis le 09/09 en nommant l'écran —
 * « Et un bouton "sauvegarder mes réglages" dans configuration du renderer ?? ».
 *
 * ## 🔴 La raison d'origine a été corrigée AILLEURS — lire ceci avant d'argumenter
 *
 * Ce module est né d'une perte mesurée : le 11/09/2026, sur un serveur 0.9.145,
 * une zone renommée dont l'appareil change d'adresse se voyait offrir une zone
 * NEUVE, ses réglages restant sur une ligne orpheline. Deux lignes pour un seul
 * Mac, reproduit de bout en bout (#3919).
 *
 * **Ce défaut est réglé, côté serveur, et ce module n'y est pour rien.** La PR
 * #3928 ajoute un quatrième filet de ré-ancrage — par la MAC que la ligne de
 * zone porte déjà dans `zones.mac` — placé après les trois filets par nom et
 * avant la création automatique. Mesuré sur l'installation d'essai : **10 zones
 * sur 11 portent une MAC**, donc le chemin principal est couvert.
 *
 * Toute justification de ce fichier qui repose sur « la ligne de zone n'est pas
 * stable » est donc PÉRIMÉE. Elle l'a été, elle ne l'est plus, et la première
 * version de cet en-tête l'affirmait encore.
 *
 * ## Ce qui justifie ce module aujourd'hui
 *
 * 1. **La demande, qui ne dépendait pas du défaut.** « Sauvegarder mes réglages »
 *    est une fonction, pas un contournement. Elle a été réclamée deux fois, dont
 *    une en désignant cet écran précis.
 *
 * 2. **Les cas où le filet de #3928 refuse d'agir**, par ses quatre refus
 *    nommés : deux zones du même type sur une seule MAC ; la même MAC vue sur
 *    deux protocoles (un Eversolo DMP-A8 est DLNA *et* AirPlay, #3747) ; un
 *    `output_type` absent ; et le nouvel identifiant déjà pris.
 *
 * 3. **Un appareil sans MAC ET sans identifiant annoncé** — aucun sur
 *    l'installation d'essai, mais la table ARP ne franchit pas un routeur.
 *
 * 4. **Tout ce qui n'est pas un changement d'adresse** : une zone supprimée par
 *    erreur, une base réinitialisée ou restaurée, un changement de machine, un
 *    appareil remis à zéro d'usine (UUID *et* MAC neufs).
 *
 * ## Ce qui existe déjà, et pourquoi ceci n'en est pas un doublon
 *
 * `components/v2/SauvegardeReglagesV2.svelte` couvre déjà les **quatorze**
 * réglages d'appareil de **toutes** les zones, par fichier et presse-papiers,
 * avec aperçu avant écriture. Elle est plus complète, et elle reste la bonne
 * porte pour transporter une configuration d'une installation à une autre.
 *
 * Ce module est l'autre moitié du besoin : **par appareil, sur place, sans
 * fichier à gérer**, dans le bloc où le réglage se fait — et c'est là que
 * Bertrand a demandé le bouton. Les deux peuvent coexister ; si l'un doit
 * disparaître, c'est un arbitrage, pas une évidence.
 *
 * ## Et le bouton ne doit jamais laisser croire que rien n'est appliqué
 *
 * Les sept réglages partent en `PATCH /zones/{id}` dès le clic, et le témoin
 * « Enregistré » le prouve depuis le 09/09. Le bouton ajoute une copie, il ne
 * conditionne rien : un écran qui suggérerait l'inverse serait un mensonge, et
 * le reste de ce bloc dépend de cette vérité. C'est ce que garde
 * `rendererPreuveDeSauvegarde.test.ts`.
 *
 * ## Trois décisions, et leur raison
 *
 * 1. **La clé est l'APPAREIL, jamais l'identifiant de zone.** `output_device_id`
 *    (`uuid:RINCON_…`, `airplay-…`, `local:…`) désigne le matériel ; `zones.id`
 *    est précisément ce qui change quand une zone est recréée. Ranger
 *    l'instantané sous l'id le perdrait exactement dans le cas qu'on veut
 *    couvrir. Le nom ne sert que de repli, comme dans
 *    `reglagesAppareilLocal.apparier` — et un repli par le nom est signalé,
 *    jamais muet.
 *
 * 2. **On n'enregistre que les clés que le serveur PUBLIE.** Une clé absente de
 *    la fiche de zone (serveur plus ancien, colonne pas encore migrée) reste
 *    absente de l'instantané, au lieu d'y entrer à sa valeur neutre. À la
 *    remise en place, absent veut dire « ne touche pas », pas « remets à
 *    zéro ». Même règle que `reglagesAppareilLocal.reglagesDeZone`, pour la
 *    même raison.
 *
 * 3. **Sept réglages, et rien d'autre.** La liste est CLOSE : c'est celle de
 *    l'écran `RendererConfig`. `fixed_volume` n'y est pas — l'armer envoie
 *    l'appareil à 100 % et l'y épingle (#2395), ce qu'aucune remise en place
 *    automatique ne peut décider à la place de quelqu'un. `max_sample_rate`,
 *    `gain_trim_db` et `dsd_mode` n'y sont pas non plus : ils vivent dans
 *    d'autres blocs de l'écran Appareils, et la sauvegarde de fichier
 *    (`reglagesAppareilLocal`) les couvre déjà.
 */
import type { Zone } from './types';

/** Révision du format rangé dans les préférences. Un instantané écrit par une
 *  version ultérieure est IGNORÉ plutôt qu'à demi interprété. */
export const VERSION = 1;

/**
 * Les sept réglages de `RendererConfig`, et leur valeur neutre.
 *
 * Le défaut sert à lire une fiche de zone qui ne porte pas la colonne, et à
 * décider si un instantané dit quelque chose ou rien.
 */
export const CLES_RENDERER = [
  { cle: 'dlna_native_flac', defaut: false as unknown },
  { cle: 'alac_passthrough', defaut: false as unknown },
  { cle: 'aac_passthrough', defaut: false as unknown },
  { cle: 'dlna_lpcm', defaut: false as unknown },
  { cle: 'dlna_wav24', defaut: false as unknown },
  { cle: 'dlna_cap_16bit', defaut: false as unknown },
  { cle: 'dlna_play_delay_ms', defaut: 0 as unknown },
] as const;

export type CleRenderer = (typeof CLES_RENDERER)[number]['cle'];
export type ValeurRenderer = boolean | number;

/** Les valeurs telles que l'écran les porte — les sept, toujours. */
export type ValeursEcran = Record<CleRenderer, ValeurRenderer>;

export interface Instantane {
  version: number;
  /** ISO. Affiché tel quel n'est pas lisible : l'écran le passe à `dateSimple`. */
  enregistre_le: string;
  /** Le nom de la zone à l'enregistrement — libellé lisible, et repli de clé. */
  nom: string;
  reglages: Partial<Record<CleRenderer, ValeurRenderer>>;
}

/** L'instantané de chaque appareil, rangé par clé d'appareil. */
export type Instantanes = Record<string, Instantane>;

const plier = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

const defautDe = (cle: CleRenderer): ValeurRenderer =>
  CLES_RENDERER.find((c) => c.cle === cle)!.defaut as ValeurRenderer;

/**
 * 🔴 Tout `output_device_id` n'est PAS une identité — mesuré, pas supposé.
 *
 * Le serveur en produit deux formes (`tune-core/src/discovery/mdns.rs:787`) :
 *
 * - `device_id_for()` — ce que l'appareil ANNONCE lui-même : `uuid:RINCON_…`
 *   pour un Sonos, `airplay-80:0A:80:5D:4D:EE` (son adresse MAC) pour un
 *   AirPlay bavard, `oaat:…`, `local:…`. Stable.
 * - `legacy_device_id()` — `{output_type}-{host}-{port}`, dérivé de l'ADRESSE,
 *   produit pour tout appareil qui n'annonce rien : `airplay-192.168.1.24-7000`.
 *   **Change avec le bail DHCP.**
 *
 * Le serveur documente lui-même ce que ça coûte, en tête de `device_id_for` :
 * « un bail DHCP renouvelé changeait l'identité de l'appareil, donc dédoublait
 * sa zone et faisait revenir les zones supprimées, puisque tout le cycle de vie
 * d'une zone repose sur cette chaîne » (#1528).
 *
 * Mesuré sur une installation réelle le 11/09/2026, entre deux relevés de
 * `GET /zones` séparés de quelques minutes : la zone `Mac13,1` est passée de
 * `airplay-192.168.1.41-7000` à `airplay-192.168.1.24-7000`, **à `id`
 * constant**. Ranger un instantané sous cette chaîne le rendrait orphelin au
 * premier renouvellement de bail — c'est-à-dire exactement entre deux sessions,
 * le cas que ce fichier existe pour couvrir.
 *
 * Le discriminant est sans ambiguïté : la forme d'adresse se termine toujours
 * par `-<port>`, la forme annoncée jamais (une MAC sépare par `:`, un `uuid:`
 * et un `oaat:` par `:`).
 */
const FIN_PORT = /-\d{1,5}$/;

export function identiteStable(zone: Zone): boolean {
  const sortie = (zone.output_device_id ?? '').trim();
  if (!sortie) return false;
  const type = (zone.output_type ?? '').trim();
  return !(type && sortie.startsWith(`${type}-`) && FIN_PORT.test(sortie));
}

/**
 * La clé de rangement : la SORTIE quand elle est une identité, le nom sinon.
 *
 * Les deux formes sont préfixées, sans quoi une zone nommée `uuid:x` pourrait
 * heurter l'appareil `uuid:x`. Rend `null` quand la zone n'a ni identité ni
 * nom : il n'y a alors rien à quoi rattacher un instantané, et l'écran désarme
 * son bouton plutôt que d'en écrire un sous une clé vide.
 */
export function cleAppareil(zone: Zone): string | null {
  if (identiteStable(zone)) return `sortie:${plier(zone.output_device_id)}`;
  const nom = plier(zone.name);
  return nom ? `nom:${nom}` : null;
}

/** Vrai quand la clé ne tient que par le nom — appariement faible, à dire. */
export function parLeNom(cle: string): boolean {
  return cle.startsWith('nom:');
}

/**
 * Les valeurs de l'écran, restreintes à ce que le serveur publie sur cette zone.
 *
 * On teste la PRÉSENCE de la clé dans la fiche, pas sa valeur : la présence ne
 * dépend pas du dernier `PATCH`, donc un instantané pris juste après un clic ne
 * risque pas de perdre le réglage qui vient d'être posé.
 */
export function reglagesAEnregistrer(
  zone: Zone,
  ecran: ValeursEcran,
): Partial<Record<CleRenderer, ValeurRenderer>> {
  const out: Partial<Record<CleRenderer, ValeurRenderer>> = {};
  const fiche = zone as unknown as Record<string, unknown>;
  for (const { cle } of CLES_RENDERER) {
    if (fiche[cle] === undefined) continue;
    out[cle] = ecran[cle];
  }
  return out;
}

export function construireInstantane(
  zone: Zone,
  ecran: ValeursEcran,
  maintenant = new Date(),
): Instantane {
  return {
    version: VERSION,
    enregistre_le: maintenant.toISOString(),
    nom: zone.name ?? '',
    reglages: reglagesAEnregistrer(zone, ecran),
  };
}

/** Range l'instantané sans muter la table reçue — le store en fait un nouvel objet. */
export function ranger(table: Instantanes, cle: string, instantane: Instantane): Instantanes {
  return { ...table, [cle]: instantane };
}

export function oublier(table: Instantanes, cle: string): Instantanes {
  const out = { ...table };
  delete out[cle];
  return out;
}

/**
 * Relit un instantané rangé.
 *
 * Sévère, parce que ce qui en sort sert à ÉCRIRE sur un appareil : une entrée
 * corrompue, d'une version ultérieure, ou sans aucun réglage connu, est traitée
 * comme absente. Rien ne s'affiche alors, et rien ne s'écrase.
 */
export function lireInstantane(table: Instantanes | undefined, cle: string | null): Instantane | null {
  if (!table || !cle) return null;
  const brut = table[cle] as Partial<Instantane> | undefined;
  if (!brut || typeof brut !== 'object') return null;
  if (Number(brut.version) > VERSION) return null;
  const reglages = filtrer(brut.reglages);
  if (!Object.keys(reglages).length) return null;
  return {
    version: Number(brut.version) || VERSION,
    enregistre_le: typeof brut.enregistre_le === 'string' ? brut.enregistre_le : '',
    nom: typeof brut.nom === 'string' ? brut.nom : '',
    reglages,
  };
}

/** Ne retient que les sept clés connues, et seulement aux types attendus. */
function filtrer(r: unknown): Partial<Record<CleRenderer, ValeurRenderer>> {
  const out: Partial<Record<CleRenderer, ValeurRenderer>> = {};
  if (!r || typeof r !== 'object') return out;
  const src = r as Record<string, unknown>;
  for (const { cle, defaut } of CLES_RENDERER) {
    const v = src[cle];
    if (typeof v !== typeof defaut) continue;
    out[cle] = v as ValeurRenderer;
  }
  return out;
}

export interface Ecart {
  cle: CleRenderer;
  /** Ce que l'écran porte aujourd'hui — donc ce que le serveur a répondu. */
  courant: ValeurRenderer;
  /** Ce que l'instantané garde. */
  enregistre: ValeurRenderer;
}

/**
 * Ce que la remise en place changerait.
 *
 * Comparé aux valeurs de l'ÉCRAN, pas à la fiche de zone : l'écran est déjà le
 * reflet du serveur (il en est initialisé, et chaque clic y est écrit), et il
 * se met à jour tout seul après une remise en place. L'écart disparaît donc de
 * lui-même — c'est la contre-épreuve, à l'écran, comme pour l'aperçu de la
 * sauvegarde de fichier.
 */
export function ecarts(instantane: Instantane, ecran: ValeursEcran): Ecart[] {
  const out: Ecart[] = [];
  for (const { cle } of CLES_RENDERER) {
    const enregistre = instantane.reglages[cle];
    if (enregistre === undefined) continue;
    const courant = ecran[cle] ?? defautDe(cle);
    if (courant === enregistre) continue;
    out.push({ cle, courant, enregistre });
  }
  return out;
}

/**
 * Le corps du PATCH de remise en place — l'instantané entier, pas les écarts.
 *
 * 🔴 Les écarts NE suffisent pas pour `dlna_lpcm` / `dlna_wav24` : ils sont
 * exclusifs l'un de l'autre côté serveur, et n'envoyer que celui qui diffère
 * laisse la zone porter la paire contradictoire (« forcer le 16 bits » ET
 * « forcer le 24 bits »). Même raison qu'`api.updateZoneWavMode`, qui patche
 * toujours les deux. On renvoie donc tout ce que l'instantané connaît, en une
 * seule requête.
 */
export function corpsPatch(instantane: Instantane): Record<string, ValeurRenderer> {
  const corps: Record<string, ValeurRenderer> = {};
  for (const { cle } of CLES_RENDERER) {
    const v = instantane.reglages[cle];
    if (v !== undefined) corps[cle] = v;
  }
  return corps;
}
