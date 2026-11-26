import { describe, expect, it } from 'vitest';
import {
  etatServeur, nomConvivial, nettoyerNom, iconeServeur, nomDeSource, nomPourAjout,
  vueSource, detailsSource, texteDiagnostic, presenceDe, estHorsReseau, texteBrut,
  CLE_ETAT_SOURCE, CLE_ETAT_SERVEUR, CLE_PLAFOND,
} from '../serveursMediaV2';
import { fr as frD, en as enD } from './onzeDictionnaires';
const fr = frD as Record<string, string>;
const en = enD as Record<string, string>;
import type { UpnpLibrarySource } from '../api';
import type { MediaServer } from '../types';

/**
 * Harmonisation UI (rc14) — écran Serveurs multimédia : l'état, l'action et le
 * message de chaque source sont construits CÔTÉ WEB, sans changer le contrat.
 */
const UDN = 'uuid:258FC2D5-E2C3-B734-0-123456789abc';

function source(extra: Partial<UpnpLibrarySource> = {}): UpnpLibrarySource {
  return {
    key: 'k', udn: UDN, container: '0', name: 'Asset UPnP: Mac-Studio-6', enabled: true,
    status: 'ready', last_attempt: 0, last_success: null, generation: 'g', pending_count: 0,
    report: {}, ...extra,
  };
}
function serveur(id: string, extra: Partial<MediaServer> = {}): MediaServer {
  return { id, name: id, host: '192.168.1.20', port: 1400, manufacturer: '', model: '', ...extra };
}

describe('serveurs : nom convivial, état, icône', () => {
  it('retire l’IP et l’identifiant RINCON du nom annoncé par un Sonos', () => {
    expect(nomConvivial({ name: '192.168.1.20 - Sonos Play:1 - RINCON_B8E937B44D0801400', host: '192.168.1.20' }))
      .toBe('Sonos Play:1');
  });
  it('garde un nom ordinaire, et retombe sur l’adresse si rien ne reste', () => {
    expect(nomConvivial({ name: 'MinimServer', host: '192.168.1.22' })).toBe('MinimServer');
    expect(nomConvivial({ name: '192.168.1.22', host: '192.168.1.22' })).toBe('192.168.1.22');
    expect(nettoyerNom('uuid:abcd - Salon')).toBe('Salon');
  });
  it('mappe la présence et `this_server` sur les trois états de carte', () => {
    expect(etatServeur(serveur('a'))).toBe('connected');
    expect(etatServeur(serveur('a', { presence: 'absent' }))).toBe('offline');
    expect(etatServeur(serveur('a', { reachable: false }))).toBe('offline');
    expect(etatServeur(serveur('a', { this_server: true }))).toBe('thisServer');
  });
  it('choisit l’icône : Tune, enceinte, serveur', () => {
    expect(iconeServeur(serveur('a'), true)).toBe('tune');
    expect(iconeServeur(serveur('a', { manufacturer: 'Sonos, Inc.' }), false)).toBe('speaker');
    expect(iconeServeur(serveur('a', { name: 'MinimServer' }), false)).toBe('server');
  });
});

describe('sources : le nom une seule fois', () => {
  it('« Asset UPnP: Mac-Studio-6 · Asset UPnP: Mac-Studio-6 » → Mac-Studio-6, produit Asset UPnP', () => {
    expect(nomDeSource('Asset UPnP: Mac-Studio-6 · Asset UPnP: Mac-Studio-6'))
      .toEqual({ nom: 'Mac-Studio-6', produit: 'Asset UPnP', chemin: null });
  });
  it('un chemin qui répète le nom du serveur en tête est raccourci', () => {
    expect(nomDeSource('MinimServer · MinimServer / Music / Jazz'))
      .toEqual({ nom: 'MinimServer', produit: null, chemin: 'Music / Jazz' });
  });
  it('à l’ajout, le nom du serveur n’est plus envoyé (le serveur le préfixe déjà)', () => {
    expect(nomPourAjout(['Asset UPnP: Mac-Studio-6'])).toBeUndefined();
    expect(nomPourAjout(['MinimServer', 'Music', 'Jazz'])).toBe('Music / Jazz');
  });
});

describe('sources : mappage des états', () => {
  const presents = presenceDe([serveur(UDN)]);
  const absent = presenceDe([serveur(UDN, { presence: 'absent' })]);

  it('unavailable + code unknown_server → Offline, message clair, « Try again »', () => {
    const v = vueSource(source({ status: 'unavailable', report: { code: 'unknown_server', indexe: false,
      detail: `No media server registered as "${UDN}" — the list lives in GET /api/v1/network/media-servers` } }), presents);
    expect(v.etat).toBe('offline');
    expect(v.message?.cle).toBe('v2.ms.offlineMsg');
    expect(v.action).toBe('retry');
    // Le texte brut (uuid, route) n'est que dans les détails.
    expect(v.brut.join(' ')).toContain('/api/v1/network/media-servers');
  });

  it('repli sans code : unavailable + udn absent de la découverte → Offline', () => {
    const s = source({ status: 'unavailable', report: { error: 'boom' } });
    expect(vueSource(s, absent).etat).toBe('offline');
    expect(vueSource(s, presenceDe([serveur('autre')])).etat, 'udn inconnu de la découverte').toBe('offline');
    expect(vueSource(s, presents).etat, 'serveur présent : échec, pas absence').toBe('failed');
    expect(vueSource(s, null).etat, 'découverte pas encore chargée : on ne conclut rien').toBe('failed');
    expect(estHorsReseau(s, null)).toBe(false);
  });

  it('partial + plafond de profondeur → Incomplete, « Increase depth » sur l’axe profondeur', () => {
    const v = vueSource(source({ status: 'partial', report: { indexe: true, parcours: { plafond: {
      nature: 'profondeur', valeur: 6, reglage: 'upnp_index_profondeur_max',
      message: "profondeur maximale atteinte (6) : relever le réglage « upnp_index_profondeur_max »" } } } }), presents);
    expect(v.etat).toBe('incomplete');
    expect(v.ton).toBe('warn');
    expect(v.message).toEqual({ cle: 'v2.ms.ceiling.depth', ton: 'warn', axe: 'profondeur', bouton: 'v2.ms.ceiling.raiseDepth' });
    expect(v.action).toBe('sync');
  });

  it('les trois natures de plafond ont chacune leur phrase et leur bouton', () => {
    for (const [nature, axe] of [['pistes', 'pistes'], ['conteneurs', 'conteneurs'], ['profondeur', 'profondeur']] as const) {
      const v = vueSource(source({ status: 'partial', report: { parcours: { plafond: { nature, message: 'x' } } } }), presents);
      expect(v.message?.axe).toBe(axe);
      expect(v.message?.cle).toBe(CLE_PLAFOND[axe].message);
    }
  });

  it('partial sans plafond nommé → phrase générique traduite, jamais le texte brut', () => {
    const v = vueSource(source({ status: 'partial', report: { reserves: ['Indexation ponctuelle : aucune piste supprimée'] } }), presents);
    expect(v.message?.cle).toBe('v2.ms.genericLimitation');
    expect(v.brut).toEqual(['Indexation ponctuelle : aucune piste supprimée']);
  });

  it('error → Failed + phrase générique ; ready → Up to date sans message', () => {
    expect(vueSource(source({ status: 'error', report: { error: 'Synchronisation interrompue' } }), presents))
      .toMatchObject({ etat: 'failed', action: 'retry', message: { cle: 'v2.ms.genericFailure' } });
    expect(vueSource(source(), presents)).toMatchObject({ etat: 'upToDate', ton: 'ok', message: null, action: 'sync' });
  });

  it('running, pending, confirmation, pause et ce serveur', () => {
    expect(vueSource(source({ status: 'running' }), presents)).toMatchObject({ etat: 'syncing', action: null });
    expect(vueSource(source({ status: 'pending' }), presents)).toMatchObject({ etat: 'waiting', action: null });
    expect(vueSource(source({ status: 'confirmation' }), presents)).toMatchObject({ etat: 'confirm', action: null });
    expect(vueSource(source({ enabled: false, status: 'ready' }), presents)).toMatchObject({ etat: 'paused', action: 'sync' });
    expect(vueSource(source({ status: 'this_server', enabled: false, report: { code: 'this_server' } }), presents))
      .toMatchObject({ etat: 'thisServer', action: null, message: { cle: 'v2.ms.thisServerMsg' } });
  });
});

describe('sources : détails et diagnostic', () => {
  it('lit profondeur, pistes, albums et retraits ; « incomplet » si rien n’a été retiré faute de parcours complet', () => {
    const d = detailsSource(source({ status: 'partial', report: {
      pistes: { distinctes: 1 }, albums_ajoutes: 0,
      parcours: { plafonds: { profondeur_max: 6 }, plafond: { nature: 'profondeur', message: 'x' } } } }));
    expect(d).toEqual({ profondeur: 6, profondeurAtteinte: true, pistes: 1, albums: 0, retirees: 'incomplete' });
    expect(detailsSource(source({ report: { supprimees: 3 } })).retirees).toBe(3);
  });

  it('le diagnostic copié porte identifiants, code et texte brut — l’écran, non', () => {
    const s = source({ status: 'unavailable', report: { code: 'unknown_server', detail: 'No media server registered' } });
    const d = texteDiagnostic(s, serveur(UDN, { name: 'Asset UPnP: Mac-Studio-6' }));
    expect(d).toContain(`udn: ${UDN}`);
    expect(d).toContain('code: unknown_server');
    expect(d).toContain('No media server registered');
    expect(texteBrut(s)).toEqual(['No media server registered']);
  });
});

describe('i18n : chaque clé d’état et de message existe en anglais et en français', () => {
  it('aucune clé manquante', () => {
    const cles = [
      ...Object.values(CLE_ETAT_SOURCE), ...Object.values(CLE_ETAT_SERVEUR),
      ...Object.values(CLE_PLAFOND).flatMap((c) => [c.message, c.bouton]),
      'v2.ms.offlineMsg', 'v2.ms.thisServerMsg', 'v2.ms.genericLimitation', 'v2.ms.genericFailure',
    ];
    for (const c of cles) {
      expect(en[c], `${c} absente de en.ts`).toBeTruthy();
      expect(fr[c], `${c} absente de fr.ts`).toBeTruthy();
    }
  });
  it('l’anglais ne contient plus le texte brut français au premier niveau', () => {
    expect(en['v2.ms.ceiling.depth']).not.toMatch(/profondeur|réglage/);
  });
});
