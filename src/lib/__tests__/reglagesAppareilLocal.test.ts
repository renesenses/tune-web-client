/**
 * Sauvegarde et récupération locales des réglages d'appareil.
 *
 * Les cas ci-dessous ne sont pas inventés : ils reprennent l'installation de
 * Bertrand telle que `GET /zones` la rendait le 08/09/2026 sur le .18 —
 * quatorze zones, une seule non neutre (l'Eversolo DMP-A8), un Sonos dont la
 * marque n'est que détectée, et une zone navigateur sans sortie.
 */
import { describe, it, expect } from 'vitest';
import {
  FORMAT, VERSION, CLES_REGLAGES, CLES_A_LA_MAIN,
  reglagesDeZone, estNeutre, construireSauvegarde, serialiser, lireSauvegarde,
  nomFichierSauvegarde, apparier, changements, corpsPatch, resume,
  type Sauvegarde,
} from '../reglagesAppareilLocal';
import type { Zone } from '../types';

const zone = (p: Partial<Zone>): Zone => ({
  id: 1, name: 'Zone', output_type: 'dlna', output_device_id: 'uuid:x',
  dsd_mode: 'auto', max_sample_rate: null, lyrics_offset_ms: 0,
  dlna_native_flac: false, alac_passthrough: false, aac_passthrough: false,
  dlna_lpcm: false, dlna_cap_16bit: false, dlna_wav24: false,
  dlna_play_delay_ms: 0, gain_trim_db: 0, upnp_renderer: false,
  mono_downmix: false, fixed_volume: false,
  brand: null, model: null, detected_manufacturer: null, detected_model: null,
  ...p,
} as Zone);

/** L'Eversolo, seule zone réglée des quatorze. */
const EVERSOLO = zone({
  id: 10, name: 'Eversolo DMP-A8', output_device_id: 'uuid:9C41535E-DB73-11F0-A7C6-800A805D4DEE',
  brand: 'Eversolo', model: 'DMP-A8',
  detected_manufacturer: 'EVERSOLO', detected_model: 'AV Renderer Device',
  dsd_mode: 'native', dlna_native_flac: true, alac_passthrough: true,
  aac_passthrough: true, dlna_wav24: true,
});

const SONOS = zone({
  id: 8, name: 'Chambre - Sonos Play:1 Media Renderer - RINCON_B8E937B44D0801400',
  output_device_id: 'uuid:RINCON_B8E937B44D0801400',
  detected_manufacturer: 'Sonos, Inc.', detected_model: 'Sonos Play:1',
});

const NAVIGATEUR = zone({ id: 15, name: 'Cet ordinateur', output_type: 'browser', output_device_id: null });

describe('Ce que la sauvegarde emporte', () => {
  it('🔴 n’emporte QUE de la configuration — ni volume, ni file, ni groupe', () => {
    // Un fichier de réglages qui rejouerait le volume ou l'appartenance à un
    // groupe changerait ce qui joue, pas ce qui est réglé.
    const r = reglagesDeZone(zone({ volume: 42, group_id: 'g1', queue_length: 12, state: 'playing' } as Partial<Zone>));
    for (const interdit of ['volume', 'group_id', 'queue_length', 'state', 'name', 'id']) {
      expect(Object.keys(r)).not.toContain(interdit);
    }
  });

  it('relève les cinq réglages de l’Eversolo, et rien de plus', () => {
    const r = reglagesDeZone(EVERSOLO);
    expect(r.dsd_mode).toBe('native');
    expect(r.dlna_native_flac).toBe(true);
    expect(r.alac_passthrough).toBe(true);
    expect(r.aac_passthrough).toBe(true);
    expect(r.dlna_wav24).toBe(true);
    expect(r.dlna_lpcm).toBe(false);
  });

  it('🔴 une clé que le serveur ne publie pas reste ABSENTE, jamais inventée', () => {
    // Serveur antérieur à #2362 : `mono_downmix` n'existe pas dans la fiche.
    // L'écrire à `false` ferait croire que le réglage a été relevé, et la
    // récupération le poserait sur une installation où il valait `true`.
    const vieux = { id: 3, name: 'Vieux', output_device_id: 'uuid:v' } as Zone;
    const r = reglagesDeZone(vieux);
    expect('mono_downmix' in r).toBe(false);
    expect('dlna_wav24' in r).toBe(false);
  });

  it('sait dire qu’une zone n’a rien de particulier', () => {
    // Treize des quatorze zones du .18 sont dans ce cas.
    expect(estNeutre(reglagesDeZone(SONOS))).toBe(true);
    expect(estNeutre(reglagesDeZone(EVERSOLO))).toBe(false);
  });

  it('garde AUSSI les zones neutres', () => {
    // Leur absence se lirait « cette zone n'existait pas » au lieu de « cette
    // zone n'avait rien de particulier ».
    const s = construireSauvegarde([EVERSOLO, SONOS, NAVIGATEUR]);
    expect(s.zones).toHaveLength(3);
    expect(s.zones.map((z) => z.nom)).toContain('Cet ordinateur');
  });

  it('écarte une zone sans identifiant : elle n’est pas enregistrée au serveur', () => {
    const s = construireSauvegarde([EVERSOLO, zone({ id: null, name: 'Fantôme' })]);
    expect(s.zones).toHaveLength(1);
  });

  it('le fichier est daté et se range', () => {
    const d = new Date('2026-09-08T12:00:00Z');
    expect(nomFichierSauvegarde(d)).toBe('tune-appareils-2026-09-08.json');
    expect(construireSauvegarde([EVERSOLO], d).exporte_le).toBe('2026-09-08T12:00:00.000Z');
  });
});

describe('La relecture', () => {
  const bon = construireSauvegarde([EVERSOLO, SONOS]);

  it('fait l’aller-retour sans rien perdre', () => {
    const l = lireSauvegarde(serialiser(bon));
    expect(l.ok).toBe(true);
    if (l.ok) expect(l.sauvegarde).toEqual(bon);
  });

  it('🔴 refuse un JSON qui n’est pas une sauvegarde Tune', () => {
    // Ce fichier va servir à ÉCRIRE sur des appareils. Un JSON quelconque qui
    // aurait par hasard un tableau `zones` ne doit pas passer.
    expect(lireSauvegarde('pas du json')).toEqual({ ok: false, raison: 'illisible' });
    expect(lireSauvegarde('{"zones":[{"nom":"x"}]}')).toEqual({ ok: false, raison: 'pas_un_fichier_tune' });
    expect(lireSauvegarde('null')).toEqual({ ok: false, raison: 'pas_un_fichier_tune' });
    expect(lireSauvegarde(JSON.stringify({ format: FORMAT, version: 1, zones: [] })))
      .toEqual({ ok: false, raison: 'aucune_zone' });
  });

  it('🔴 refuse un fichier écrit par une version PLUS RÉCENTE', () => {
    // Il peut porter des réglages que celle-ci ne sait pas interpréter :
    // mieux vaut refuser que d'en appliquer la moitié.
    const futur = JSON.stringify({ ...bon, version: VERSION + 1 });
    expect(lireSauvegarde(futur)).toEqual({ ok: false, raison: 'version_future' });
  });

  it('🔴 n’introduit aucun champ venu du fichier', () => {
    const trafique = JSON.stringify({
      format: FORMAT, version: 1, exporte_le: '',
      zones: [{ nom: 'X', output_device_id: 'uuid:x', reglages: { dlna_lpcm: true, rm_rf: '/', volume: 100 } }],
    });
    const l = lireSauvegarde(trafique);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.sauvegarde.zones[0].reglages).toEqual({ dlna_lpcm: true });
  });
});

describe('L’appariement', () => {
  const fichier = construireSauvegarde([EVERSOLO, SONOS]);

  it('reconnaît l’appareil par sa SORTIE, même renommé', () => {
    const renomme = { ...EVERSOLO, name: 'Salon' } as Zone;
    const [a] = apparier(fichier, [renomme, SONOS]);
    expect(a.zone?.id).toBe(10);
    expect(a.methode).toBe('sortie');
  });

  it('se rabat sur le nom quand la sortie a changé, et le DIT', () => {
    // Un Sonos réappairé change d'UUID ; le nom est alors le seul repère —
    // mais c'est un repère faible, et l'écran doit pouvoir le signaler.
    const reappaire = { ...EVERSOLO, output_device_id: 'uuid:AUTRE' } as Zone;
    const [a] = apparier(fichier, [reappaire]);
    expect(a.zone?.id).toBe(10);
    expect(a.methode).toBe('nom');
  });

  it('🔴 une zone n’est prise qu’UNE fois', () => {
    // Deux entrées qui portent le même nom ne peuvent pas écrire toutes les
    // deux dans la même zone : la seconde effacerait la première en silence.
    const doublon: Sauvegarde = {
      ...fichier,
      zones: [
        { ...fichier.zones[0], output_device_id: null },
        { ...fichier.zones[0], output_device_id: null },
      ],
    };
    const r = apparier(doublon, [EVERSOLO]);
    expect(r[0].zone?.id).toBe(10);
    expect(r[1].zone).toBeNull();
  });

  it('🔴 la SORTIE l’emporte, quel que soit l’ordre du fichier', () => {
    // Sans deux passes, l'entrée « Salon » appariée par son nom consommerait
    // la zone que l'entrée suivante désignait par son identifiant de sortie.
    const salon = zone({ id: 99, name: 'Eversolo DMP-A8', output_device_id: 'uuid:AUTRE' });
    const f: Sauvegarde = {
      ...fichier,
      zones: [
        { ...fichier.zones[0], output_device_id: null },              // apparie par NOM
        { ...fichier.zones[0] },                                      // apparie par SORTIE
      ],
    };
    const r = apparier(f, [salon, EVERSOLO]);
    expect(r[1].zone?.id).toBe(10);
    expect(r[1].methode).toBe('sortie');
    expect(r[0].zone?.id).toBe(99);
  });

  it('une zone absente du serveur reste sans appariement — pas d’erreur', () => {
    const r = apparier(fichier, [EVERSOLO]);
    expect(r[1].zone).toBeNull();
    expect(r[1].changements).toEqual([]);
  });

  it('n’apparie pas deux zones sans sortie par leur seul `null`', () => {
    // `output_device_id` vaut `null` sur toutes les zones navigateur.
    const f = construireSauvegarde([NAVIGATEUR]);
    const autre = zone({ id: 77, name: 'Un autre ordinateur', output_type: 'browser', output_device_id: null });
    expect(apparier(f, [autre])[0].zone).toBeNull();
  });
});

describe('Ce que la récupération changerait', () => {
  it('ne liste que ce qui DIFFÈRE', () => {
    const nu = zone({ id: 10, name: 'Eversolo DMP-A8', output_device_id: EVERSOLO.output_device_id });
    const c = changements(construireSauvegarde([EVERSOLO]).zones[0], nu);
    expect(c.map((x) => x.cle).sort()).toEqual(
      ['aac_passthrough', 'alac_passthrough', 'brand', 'dlna_native_flac', 'dlna_wav24', 'dsd_mode', 'model'].sort(),
    );
    expect(changements(construireSauvegarde([EVERSOLO]).zones[0], EVERSOLO)).toEqual([]);
  });

  it('pose la marque et le modèle : c’est d’eux que dépend tout le reste', () => {
    const nu = zone({ id: 10, output_device_id: EVERSOLO.output_device_id });
    const c = changements(construireSauvegarde([EVERSOLO]).zones[0], nu);
    expect(c.find((x) => x.cle === 'brand')?.apres).toBe('Eversolo');
    expect(c.find((x) => x.cle === 'model')?.apres).toBe('DMP-A8');
  });

  it('🔴 un fichier sans identité n’EFFACE pas celle qui est posée', () => {
    const c = changements(construireSauvegarde([SONOS]).zones[0], zone({ id: 8, brand: 'Sonos', model: 'Play:1' }));
    expect(c.filter((x) => x.cle === 'brand' || x.cle === 'model')).toEqual([]);
  });

  it('🔴 `fixed_volume` n’est JAMAIS appliqué par la récupération', () => {
    // L'activer envoie le signal à 100 % vers l'appareil ; c'est pour cela que
    // l'écran fait taper « 100 » à la main. Un fichier lu ne porte pas cette
    // décision-là à la place de quelqu'un.
    const bitperfect = { ...EVERSOLO, fixed_volume: true } as Zone;
    const c = changements(construireSauvegarde([bitperfect]).zones[0], zone({ id: 10 }));
    const fv = c.find((x) => x.cle === 'fixed_volume');
    expect(fv).toBeDefined();
    expect(fv!.applicable).toBe(false);
    expect(corpsPatch(c)).not.toHaveProperty('fixed_volume');
  });

  it('🔴 il est SIGNALÉ, pas escamoté', () => {
    // Le taire laisserait croire que la récupération est complète.
    const bitperfect = { ...EVERSOLO, fixed_volume: true } as Zone;
    const a = apparier(construireSauvegarde([bitperfect]), [zone({ id: 10, output_device_id: EVERSOLO.output_device_id })]);
    expect(resume(a).aLaMain).toBe(1);
  });

  it('le corps du PATCH ne porte que le nécessaire', () => {
    const nu = zone({ id: 10, output_device_id: EVERSOLO.output_device_id, dlna_native_flac: true });
    const corps = corpsPatch(changements(construireSauvegarde([EVERSOLO]).zones[0], nu));
    expect(corps).not.toHaveProperty('dlna_native_flac');   // déjà à la bonne valeur
    expect(corps).not.toHaveProperty('dlna_lpcm');          // neutre des deux côtés
    expect(corps.dsd_mode).toBe('native');
    expect(corps.brand).toBe('Eversolo');
  });

  it('🔴 rien à changer donne un corps VIDE, pour que l’appelant n’appelle pas', () => {
    // Un PATCH vide serait une écriture de zone pour rien. Et comme tout part
    // en UN seul appel, un corps vide est aussi le signal « cette zone est
    // déjà conforme » que l'écran montre avant d'écrire quoi que ce soit.
    expect(corpsPatch(changements(construireSauvegarde([EVERSOLO]).zones[0], EVERSOLO))).toEqual({});
  });

  it('🔴 tout ce qui est appliqué est un champ que le serveur accepte en PATCH', () => {
    // Mesuré sur le .18 : `PATCH /zones/{id}` accepte ces clés-là. Une clé
    // inventée serait ignorée en silence — et la récupération se croirait faite.
    const ACCEPTEES = new Set([
      'dsd_mode', 'max_sample_rate', 'lyrics_offset_ms', 'dlna_native_flac',
      'alac_passthrough', 'aac_passthrough', 'dlna_lpcm', 'dlna_cap_16bit',
      'dlna_wav24', 'dlna_play_delay_ms', 'gain_trim_db', 'upnp_renderer',
      'mono_downmix', 'fixed_volume', 'brand', 'model',
    ]);
    for (const { cle } of CLES_REGLAGES) expect(ACCEPTEES.has(cle), cle).toBe(true);
    expect(CLES_A_LA_MAIN.every((c) => ACCEPTEES.has(c))).toBe(true);
  });
});

describe('Le résumé montré avant d’écrire', () => {
  it('compte ce qui sera trouvé, changé, et laissé à la main', () => {
    const bitperfect = { ...EVERSOLO, fixed_volume: true } as Zone;
    const f = construireSauvegarde([bitperfect, SONOS]);
    const a = apparier(f, [zone({ id: 10, output_device_id: EVERSOLO.output_device_id })]);
    expect(resume(a)).toEqual({
      zonesDuFichier: 2, zonesTrouvees: 1, zonesAbsentes: 1,
      zonesAChanger: 1, changements: 7, aLaMain: 1,
    });
  });

  it('un fichier rejoué sur l’installation d’où il sort ne change RIEN', () => {
    // C'est la contre-épreuve : si une sauvegarde relue proposait des
    // changements, c'est que l'aller ou le retour ment.
    const zones = [EVERSOLO, SONOS, NAVIGATEUR];
    const a = apparier(construireSauvegarde(zones), zones);
    expect(resume(a)).toMatchObject({ zonesTrouvees: 3, zonesAChanger: 0, changements: 0, aLaMain: 0 });
  });
});
