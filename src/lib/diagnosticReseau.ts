/**
 * Santé › Diagnostic réseau — lecture de `GET /system/diagnostics/network`
 * (renesenses/tune-web-client#1867).
 *
 * L'écran lisait `multicast_ssdp`, `port_8888`, `internet`, `dns_resolution`
 * et `renderers`, cinq champs que le serveur Rust n'a JAMAIS rendus : trois
 * croix rouges sur toute installation, saine ou cassée. Ce que le serveur
 * rend vraiment (`tune-server/src/routes/system/diagnostics.rs`,
 * `diagnostics_network`) :
 *
 * - `ssdp`          : `EtatEcouteSsdp | null` (`port`, `ecoute`, `message`,
 *                     `erreur_systeme`, `echecs`, `reponses_msearch`) ;
 * - `slimproto`     : `EtatEcouteSlimProto | null` (`port`, `ecoute`, `cause`,
 *                     `message`, `erreur_systeme`) ;
 * - `slimproto_udp`, `lms_cli` : `EtatEcoute | null` (même forme + `protocole`) ;
 * - `discovered_devices`, `discovered_media_servers`, `registered_outputs` :
 *   des nombres ;
 * - `devices` : `[{ id, name, host, type }]`.
 *
 * 🔴 Règle : un champ ABSENT ou `null` (écoute jamais tentée, serveur plus
 * ancien) se lit « inconnu », JAMAIS « en échec ». Seul `ecoute: false`
 * explicite est un échec.
 */

export type VerdictReseau = 'ok' | 'echec' | 'inconnu';

export interface EcouteReseau {
  cle: 'ssdp' | 'slimproto' | 'slimproto_udp' | 'lms_cli';
  verdict: VerdictReseau;
  port: number | null;
  /** Phrase du serveur quand l'écoute est en échec (ou erreur système). */
  message: string | null;
  /** SSDP seulement : réponses M-SEARCH émises depuis le démarrage. */
  reponsesMsearch: number | null;
}

export interface AppareilReseau {
  nom: string;
  hote: string;
  type: string;
}

export interface DiagnosticReseau {
  ecoutes: EcouteReseau[];
  appareilsDecouverts: number | null;
  serveursDecouverts: number | null;
  sortiesEnregistrees: number | null;
  appareils: AppareilReseau[];
}

const ECOUTES: EcouteReseau['cle'][] = ['ssdp', 'slimproto', 'slimproto_udp', 'lms_cli'];

function nombre(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function lireEcoute(cle: EcouteReseau['cle'], brut: unknown): EcouteReseau {
  const e = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : null;
  const verdict: VerdictReseau = e?.ecoute === true ? 'ok' : e?.ecoute === false ? 'echec' : 'inconnu';
  return {
    cle,
    verdict,
    port: nombre(e?.port),
    message: verdict === 'echec' ? (texte(e?.message) ?? texte(e?.erreur_systeme)) : null,
    reponsesMsearch: cle === 'ssdp' ? nombre(e?.reponses_msearch) : null,
  };
}

export function lireDiagnosticReseau(reponse: unknown): DiagnosticReseau {
  const r = reponse && typeof reponse === 'object' ? (reponse as Record<string, unknown>) : {};
  const appareils = Array.isArray(r.devices)
    ? r.devices
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({ nom: texte(d.name) ?? '?', hote: texte(d.host) ?? '', type: texte(d.type) ?? '' }))
    : [];
  return {
    ecoutes: ECOUTES.map((cle) => lireEcoute(cle, r[cle])),
    appareilsDecouverts: nombre(r.discovered_devices),
    serveursDecouverts: nombre(r.discovered_media_servers),
    sortiesEnregistrees: nombre(r.registered_outputs),
    appareils,
  };
}

/** L'icône d'un verdict : jamais une croix pour ce qui n'a pas été mesuré. */
export function iconeVerdict(v: VerdictReseau): string {
  return v === 'ok' ? '✅' : v === 'echec' ? '❌' : '❔';
}
