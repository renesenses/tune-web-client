/**
 * #4805 lot 1 — enrichissement d'un album, d'après MetaRust, de Xavier Joly
 * (code offert à Tune le 05/10/2026) : complétude par rapport à l'édition
 * MusicBrainz, propositions Discogs, BPM, clés d'API personnelles.
 *
 * Les formes des réponses du serveur (`tune-server-rust`,
 * `routes/library/enrichissement_metarust.rs`, `routes/system/cles_api.rs`),
 * et les fonctions pures qui en tirent du texte. Rien ici n'appelle le réseau.
 */

/** Une piste de l'édition MusicBrainz qu'aucun fichier ne porte. */
export interface PisteManquante {
  disque: number;
  position: number;
  numero?: string | null;
  titre: string;
}

export interface Completude {
  status: 'not_identified' | 'release_not_cached' | 'incomplete' | 'duplicates' | 'complete';
  release_mbid?: string;
  expected?: number;
  present?: number;
  missing?: PisteManquante[];
  duplicates?: { disque: number; position: number; fichiers: number }[];
  outside_release?: number;
}

export interface CreditDiscogs {
  nom: string;
  role: string;
  instrument?: string | null;
}

export interface PropositionDiscogs {
  discogs_id: number;
  methode: 'barcode' | 'catno' | string;
  code: string;
  titre: string | null;
  annee: number | null;
  date: string | null;
  label: string | null;
  catalog_number: string | null;
  credits_album: CreditDiscogs[];
  pistes: { disque: number; numero: number; position: string; titre: string; credits?: CreditDiscogs[] }[];
  /** La fiche Discogs : l'attribution que leurs conditions demandent. */
  url: string;
}

export interface PropositionGardee {
  statut: 'proposee' | 'acceptee' | 'rejetee' | string;
  cree_le: string;
  decide_le: string | null;
  /**
   * En attente et lue il y a plus de six heures (conditions de l'API
   * Discogs, tune-server-rust#4805 lot 2) : son contenu ne s'affiche plus et
   * elle ne s'accepte plus ; une nouvelle recherche la rafraîchit. Absent
   * d'un serveur antérieur : traité comme `false`.
   */
  perimee?: boolean;
  proposition: PropositionDiscogs;
}

export interface BpmPiste {
  track_id: number;
  bpm: number | null;
  source: 'balise' | 'wikidata' | 'signal' | null;
}

/** L'état d'une clé d'API : jamais sa valeur, au plus ses 4 derniers caractères. */
export interface EtatCleApi {
  service: 'acoustid' | 'discogs';
  personnelle: boolean;
  fin: string | null;
  illisible: boolean;
  integree: boolean;
  utilisee: 'personnelle' | 'integree' | null;
}

type Traduire = (cle: string) => string;

/** Les pistes manquantes, groupées par disque, dans l'ordre. */
export function manquantesParDisque(missing: PisteManquante[]): { disque: number; pistes: PisteManquante[] }[] {
  const groupes = new Map<number, PisteManquante[]>();
  for (const m of [...missing].sort((a, b) => a.disque - b.disque || a.position - b.position)) {
    const d = Math.max(1, m.disque || 1);
    groupes.set(d, [...(groupes.get(d) ?? []), m]);
  }
  return [...groupes.entries()].map(([disque, pistes]) => ({ disque, pistes }));
}

function enListe(elements: string[], langue: string): string {
  try {
    return new Intl.ListFormat(langue, { style: 'long', type: 'conjunction' }).format(elements);
  } catch {
    return elements.join(', ');
  }
}

/**
 * « Il manque les pistes 7 et 8 (disque 2) ». Le disque n'est nommé que sur
 * un album de plusieurs disques ; le numéro imprimé (`B3`) remplace la
 * position quand il diffère.
 */
export function phraseDesManquantes(missing: PisteManquante[], plusieursDisques: boolean, t: Traduire, langue: string): string {
  if (!missing.length) return '';
  const groupes = manquantesParDisque(missing);
  const morceaux = groupes.map(({ disque, pistes }) => {
    const numeros = enListe(pistes.map((p) => p.numero?.trim() || String(p.position)), langue);
    return plusieursDisques || disque > 1
      ? `${numeros} ${t('v2.completeness.disc').replace('{n}', String(disque))}`
      : numeros;
  });
  const cle = missing.length === 1 ? 'v2.completeness.missingOne' : 'v2.completeness.missingMany';
  return t(cle).replace('{list}', morceaux.join(' ; '));
}

/** Le BPM tel qu'on l'affiche : un entier, ou rien. */
export function bpmAffiche(b: BpmPiste | undefined): string {
  if (!b || b.bpm == null || !Number.isFinite(b.bpm) || b.bpm <= 0) return '';
  return String(Math.round(b.bpm));
}

/** La clé masquée : « •••• 1a2b », ou « •••• » si elle est trop courte. */
export function cleMasquee(e: EtatCleApi): string {
  return e.fin ? `•••• ${e.fin}` : '••••';
}

/**
 * tune-server-rust#4805 lot 2 — la réponse de « Chercher une pochette plus
 * nette » (`POST /library/albums/{id}/artwork/enrich`, règle de l'empreinte
 * visuelle de #6252), traduite en une phrase.
 */
export interface ReponsePochettePlusNette {
  enriched?: boolean;
  hash?: string;
  decision?: 'plus_nette' | 'poser' | 'meme_visuel' | 'visuel_different' | string;
  reason?: string;
}

export function phrasePochettePlusNette(r: ReponsePochettePlusNette, tr: (k: string) => string): string {
  if (r.enriched) return tr(r.decision === 'plus_nette' ? 'v2.cover.replaced' : 'v2.cover.added');
  switch (r.decision) {
    case 'meme_visuel': return tr('v2.cover.alreadyBest');
    case 'visuel_different': return tr('v2.cover.different');
  }
  if (r.reason === 'no cover art found on Cover Art Archive') return tr('v2.cover.noneOnCaa');
  if (r.reason === 'album already has cover art') return tr('v2.cover.notReplaceable');
  return tr('v2.cover.failed');
}

/** Les propositions en attente, fraîches d'abord séparées des périmées. */
export function propositionsEnAttente(liste: PropositionGardee[]): { fraiches: PropositionGardee[]; perimees: PropositionGardee[] } {
  const enAttente = liste.filter((p) => p.statut === 'proposee');
  return {
    fraiches: enAttente.filter((p) => !p.perimee),
    perimees: enAttente.filter((p) => p.perimee === true),
  };
}
