/**
 * « Sortie AES67 » — lecture de l'état exposé par le greffon natif `aes67`
 * (tune-server-rust#7336, étape E3) : `GET /api/v1/ext/aes67`.
 *
 * Le contrat grossit d'étape en étape (E2 n'avait ni `sorties` ni la plupart
 * des champs `ptp`) : `normaliserSortieAes67` ne suppose RIEN et rend toujours
 * la même forme, avec des `null` là où le serveur n'a rien dit. L'écran n'a
 * ainsi aucun `?.` à semer, et un champ ajouté plus tard ne le casse pas.
 *
 * Lecture seule : aucune écriture dans cette PR.
 */

export const ETATS_PORT_PTP = [
  'ecoute', 'esclave', 'passif', 'maitre', 'defaillant', 'arrete', 'indisponible', 'desactive',
] as const;
export type EtatPortPtp = (typeof ETATS_PORT_PTP)[number];

export const TRANSPORTS_AES67 = ['lecture', 'pause', 'arret'] as const;
export type TransportAes67 = (typeof TRANSPORTS_AES67)[number];

/** Rythme de relecture quand l'écran est visible (ms). */
export const PERIODE_RAFRAICHISSEMENT_MS = 2000;

export interface PtpAes67 {
  actif: boolean;
  etatPort: string | null;
  calee: boolean;
  repliHorlogeLocale: boolean;
  raisonDuRepli: string | null;
  maitre: string | null;
  domaine: number | null;
  decalageNs: number | null;
  delaiMoyenNs: number | null;
  frequencePpm: number | null;
  sauts: number | null;
  derniereSyncIlYaMs: number | null;
  horodatage: string | null;
  erreur: string | null;
}

export interface FluxAes67 {
  id: string;
  nom: string;
  adresse: string | null;
  port: number | null;
  canaux: number | null;
  cadence: number | null;
  ttl: number | null;
  dscp: number | null;
}

export interface EmissionAes67 {
  paquets: number | null;
  trames: number | null;
  retardMaxUs: number | null;
  sousAlimentations: number | null;
  resynchronisations: number | null;
  erreursDEnvoi: number | null;
}

export interface SortieAes67 {
  id: string;
  annoncee: boolean;
  transport: string | null;
  sdp: string | null;
  versionSdp: number | null;
  emission: EmissionAes67 | null;
}

export interface EtatAes67 {
  premium: boolean;
  etape: string | null;
  referenceHorloge: string | null;
  horlogeCalee: boolean | null;
  /** `null` : le serveur n'a pas (encore) de section `ptp`. */
  ptp: PtpAes67 | null;
  flux: FluxAes67[];
  sorties: SortieAes67[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function normaliserSortieAes67(brut: unknown): EtatAes67 {
  const r = obj(brut) ?? {};
  const p = obj(r.ptp);
  const ptp: PtpAes67 | null = p
    ? {
        actif: p.actif === true,
        etatPort: txt(p.etat_port),
        calee: p.calee === true,
        repliHorlogeLocale: p.repli_horloge_locale === true,
        raisonDuRepli: txt(p.raison_du_repli),
        maitre: txt(p.maitre),
        domaine: num(p.domaine),
        decalageNs: num(p.decalage_ns),
        delaiMoyenNs: num(p.delai_moyen_ns),
        frequencePpm: num(p.frequence_ppm),
        sauts: num(p.sauts),
        derniereSyncIlYaMs: num(p.derniere_sync_il_y_a_ms),
        horodatage: txt(p.horodatage),
        erreur: txt(p.erreur),
      }
    : null;
  const flux = (Array.isArray(r.flux) ? r.flux : []).flatMap((x): FluxAes67[] => {
    const f = obj(x);
    if (!f) return [];
    const id = txt(f.id) ?? txt(f.nom) ?? '';
    return [{
      id, nom: txt(f.nom) ?? id,
      adresse: txt(f.adresse), port: num(f.port), canaux: num(f.canaux), cadence: num(f.cadence),
      ttl: num(f.ttl), dscp: num(f.dscp),
    }];
  });
  const sorties = (Array.isArray(r.sorties) ? r.sorties : []).flatMap((x): SortieAes67[] => {
    const s = obj(x);
    if (!s) return [];
    const e = obj(s.emission);
    return [{
      id: txt(s.id) ?? '',
      annoncee: s.annoncee === true,
      transport: txt(s.transport),
      sdp: txt(s.sdp),
      versionSdp: num(s.version_sdp),
      emission: e
        ? {
            paquets: num(e.paquets), trames: num(e.trames), retardMaxUs: num(e.retard_max_us),
            sousAlimentations: num(e.sous_alimentations), resynchronisations: num(e.resynchronisations),
            erreursDEnvoi: num(e.erreurs_d_envoi),
          }
        : null,
    }];
  });
  return {
    premium: r.premium !== false,
    etape: txt(r.etape),
    referenceHorloge: txt(r.reference_horloge),
    horlogeCalee: typeof r.horloge_calee === 'boolean' ? r.horloge_calee : null,
    ptp, flux, sorties,
  };
}

/** Nanosecondes → « 35,0 µs » (une décimale, séparateur de la langue). */
export function microsecondesDe(ns: number | null | undefined, langue?: string): string | null {
  if (ns === null || ns === undefined) return null;
  return `${(ns / 1000).toLocaleString(langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} µs`;
}

/** Le PTP ne tient PAS l'horloge : repli annoncé par le serveur, ou référence « local ». */
export function repliSurHorlogeLocale(e: EtatAes67): boolean {
  if (e.ptp?.repliHorlogeLocale) return true;
  return e.referenceHorloge === 'local' && e.ptp !== null && e.ptp.actif;
}

/** Clé i18n de l'état du port PTP ; inconnu → `aes67.port.autre`. */
export function cleEtatPort(etat: string | null): string {
  return (ETATS_PORT_PTP as readonly string[]).includes(etat ?? '') ? `aes67.port.${etat}` : 'aes67.port.autre';
}

export function cleTransport(tr: string | null): string {
  return (TRANSPORTS_AES67 as readonly string[]).includes(tr ?? '') ? `aes67.transport.${tr}` : 'aes67.transport.autre';
}

/** « L24 · 48 kHz · 2 canaux » est composé par l'écran (traduction du mot canaux) ; ici la cadence. */
export function cadenceKhz(cadence: number | null, langue?: string): string | null {
  if (cadence === null) return null;
  return `${(cadence / 1000).toLocaleString(langue, { maximumFractionDigits: 1 })} kHz`;
}

/** La case « Expérimental › Sortie AES67 » (rc10, désactivée par défaut). */
export interface CaseAes67 {
  /** Le réglage est coché : le greffon est installé et non désactivé. */
  cochee: boolean;
  /** Ce serveur porte le greffon (Linux) : sinon la case est grisée. */
  disponible: boolean;
}

/**
 * Lit la fiche `GET /plugins/aes67` du serveur. Elle répond
 * `status: "not_installed"` (réglage décoché, cas par défaut),
 * `"installed"` (coché, en attente de redémarrage) ou `"loaded"` (coché et
 * chargé) ; `compatible: false` quand le greffon n'est pas compilé ici.
 */
export function lireCaseAes67(fiche: unknown): CaseAes67 {
  const f = (fiche && typeof fiche === 'object' ? fiche : {}) as Record<string, unknown>;
  const disponible = f.compatible !== false && f.status !== 'unavailable';
  const cochee = disponible && f.installed === true && f.enabled !== false;
  return { cochee, disponible };
}
