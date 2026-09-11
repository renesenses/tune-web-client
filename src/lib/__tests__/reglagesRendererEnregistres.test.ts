/**
 * La configuration du renderer enregistrée à la main, et rattachée à l'appareil.
 *
 * Bertrand, 09/09/2026 : « Et un bouton "sauvegarder mes réglages" dans
 * configuration du renderer ?? » ; puis le 11/09, la raison — **on perd des
 * configurations d'une session à l'autre.**
 *
 * Les zones ci-dessous reprennent l'installation telle que `GET /zones` la
 * rendait le 08/09/2026 : l'Eversolo DMP-A8, seule zone réglée des quatorze, un
 * Sonos neutre, et une zone navigateur sans sortie.
 */
import { describe, it, expect } from 'vitest';
import {
  VERSION, CLES_RENDERER,
  cleAppareil, parLeNom, identiteStable, reglagesAEnregistrer, construireInstantane,
  ranger, oublier, lireInstantane, ecarts, corpsPatch,
  type Instantane, type Instantanes, type ValeursEcran,
} from '../reglagesRendererEnregistres';
import type { Zone, OutputType } from '../types';

const zone = (p: Partial<Zone>): Zone => ({
  id: 1, name: 'Zone', output_type: 'dlna', output_device_id: 'uuid:x',
  dlna_native_flac: false, alac_passthrough: false, aac_passthrough: false,
  dlna_lpcm: false, dlna_cap_16bit: false, dlna_wav24: false,
  dlna_play_delay_ms: 0,
  ...p,
} as Zone);

const EVERSOLO = zone({
  id: 10, name: 'Eversolo DMP-A8',
  output_device_id: 'uuid:9C41535E-DB73-11F0-A7C6-800A805D4DEE',
  dlna_native_flac: true, alac_passthrough: true, aac_passthrough: true,
  dlna_wav24: true,
});

const NAVIGATEUR = zone({ id: 15, name: 'Cet ordinateur', output_type: 'browser', output_device_id: null });

/** Ce que l'écran porte pour l'Eversolo — les sept, toujours les sept. */
const ECRAN_EVERSOLO: ValeursEcran = {
  dlna_native_flac: true,
  alac_passthrough: true,
  aac_passthrough: true,
  dlna_lpcm: false,
  dlna_wav24: true,
  dlna_cap_16bit: false,
  dlna_play_delay_ms: 0,
};

const ECRAN_NEUTRE: ValeursEcran = {
  dlna_native_flac: false,
  alac_passthrough: false,
  aac_passthrough: false,
  dlna_lpcm: false,
  dlna_wav24: false,
  dlna_cap_16bit: false,
  dlna_play_delay_ms: 0,
};

describe('La clé de rangement', () => {
  it('🔴 c’est l’APPAREIL, jamais l’identifiant de zone', () => {
    // C'est tout l'enjeu : `zones.id` est précisément ce qui change quand la
    // découverte recrée une zone. Ranger l'instantané dessous le perdrait dans
    // le seul cas qu'on veut couvrir.
    const avant = cleAppareil(EVERSOLO);
    const apres = cleAppareil(zone({ ...EVERSOLO, id: 47 }));
    expect(apres).toBe(avant);
    expect(avant).not.toContain('10');
  });

  it('la sortie prime, le nom n’est qu’un repli — et il se dit', () => {
    expect(cleAppareil(EVERSOLO)).toBe('sortie:uuid:9c41535e-db73-11f0-a7c6-800a805d4dee');
    expect(parLeNom(cleAppareil(EVERSOLO)!)).toBe(false);

    const sansSortie = cleAppareil(NAVIGATEUR)!;
    expect(sansSortie).toBe('nom:cet ordinateur');
    expect(parLeNom(sansSortie), 'un appariement par le nom doit pouvoir être signalé').toBe(true);
  });

  it('les deux formes sont préfixées — sinon un nom heurterait un identifiant', () => {
    // Une zone qu'on aurait nommée « uuid:x » ne doit pas venir se ranger sur
    // l'appareil `uuid:x`, dont elle n'a rien à voir.
    const homonyme = cleAppareil(zone({ name: 'uuid:x', output_device_id: null }));
    expect(homonyme).not.toBe(cleAppareil(zone({ output_device_id: 'uuid:x' })));
  });

  it('ni sortie ni nom : aucune clé, donc rien d’enregistrable', () => {
    expect(cleAppareil(zone({ name: '', output_device_id: null }))).toBeNull();
    expect(cleAppareil(zone({ name: '   ', output_device_id: '  ' }))).toBeNull();
  });
});

/**
 * Ces cas viennent d'une installation RÉELLE, relevée le 11/09/2026 sur un
 * serveur 0.9.145 : sept zones découvertes, deux Sonos Play:1, un Eversolo
 * DMP-A8, un AppleTV, un Mac et un Tune Endpoint.
 */
describe('🔴 Un identifiant dérivé de l’ADRESSE n’est pas une identité', () => {
  // Le serveur produit deux formes (`mdns.rs:787`) : celle que l'appareil
  // annonce, et `{output_type}-{host}-{port}` quand il n'annonce rien. La
  // seconde suit le bail DHCP — « un bail DHCP renouvelé changeait l'identité
  // de l'appareil » (#1528, en tête de `device_id_for`).

  it('mesuré : le Mac a changé d’identifiant à `id` constant', () => {
    // Relevé à quelques minutes d'intervalle sur la même installation, la même
    // zone (id=3, « Mac13,1 »). Si la clé suivait cette chaîne, la
    // configuration enregistrée serait devenue orpheline entre les deux.
    const avant = zone({ id: 3, name: 'Mac13,1', output_type: 'airplay', output_device_id: 'airplay-192.168.1.41-7000' });
    const apres = zone({ id: 3, name: 'Mac13,1', output_type: 'airplay', output_device_id: 'airplay-192.168.1.24-7000' });

    expect(identiteStable(avant)).toBe(false);
    expect(cleAppareil(apres)).toBe(cleAppareil(avant));
    expect(parLeNom(cleAppareil(avant)!), 'le repli par le nom doit être signalé').toBe(true);
  });

  it('une MAC annoncée, elle, EST une identité — et ne se replie pas', () => {
    // `airplay-80:0A:80:5D:4D:EE` : pas de `-<port>` final, séparateurs `:`.
    const z = zone({ name: 'Salon', output_type: 'airplay', output_device_id: 'airplay-80:0A:80:5D:4D:EE' });
    expect(identiteStable(z)).toBe(true);
    expect(cleAppareil(z)).toBe('sortie:airplay-80:0a:80:5d:4d:ee');
  });

  it('l’IPv6 aussi est une adresse — le `-<port>` final la trahit', () => {
    const z = zone({ name: 'Cuisine', output_type: 'airplay', output_device_id: 'airplay-2a02:842a::17bc-7000' });
    expect(identiteStable(z)).toBe(false);
    expect(cleAppareil(z)).toBe('nom:cuisine');
  });

  it('les formes annoncées relevées sur l’installation restent des identités', () => {
    // 🔴 `oaat` n'est PAS dans l'union `OutputType` du client, et le serveur le
    // publie quand même — relevé le 11/09/2026 sur la zone « Tune Endpoint »
    // d'une installation 0.9.145. D'où le `as` : l'union a pris du retard sur
    // le serveur, et corriger `types.ts` déborderait de cette PR. Ce test
    // documente l'écart en attendant.
    const mesurees: [string, string][] = [
      ['dlna', 'uuid:RINCON_B8E937B44D0801400'],
      ['dlna', 'uuid:9C41535E-DB73-11F0-A7C6-800A805D4DEE'],
      ['dlna', 'uuid:aef5e377-bc40-4807-8bb9-30f09fc0a6e8'],
      ['oaat', 'oaat:1081bb7a-ad6e-485e-a33b-c0596e3c8154'],
      ['local', 'local:alsa:usbstream:CARD=Generic'],
    ];
    for (const [output_type, output_device_id] of mesurees) {
      const z = zone({ name: 'X', output_type: output_type as OutputType, output_device_id });
      expect(identiteStable(z), `${output_device_id} devrait être une identité`).toBe(true);
      expect(parLeNom(cleAppareil(z)!)).toBe(false);
    }
  });

  it('les trois zones AirPlay mesurées se replient toutes sur leur nom', () => {
    const mesurees: [string, string][] = [
      ['Mac13,1', 'airplay-192.168.1.24-7000'],
      ['eversolo,1', 'airplay-192.168.1.17-5500'],
      ['AppleTV14,1', 'airplay-192.168.1.37-7000'],
    ];
    const cles = mesurees.map(([name, output_device_id]) =>
      cleAppareil(zone({ name, output_type: 'airplay', output_device_id })),
    );
    expect(cles).toEqual(['nom:mac13,1', 'nom:eversolo,1', 'nom:appletv14,1']);
  });

  it('sans `output_type`, on ne devine pas : la chaîne reste une identité', () => {
    // Le repli ne s'arme que sur la forme EXACTE `{type}-{host}-{port}`. Sans
    // type publié, rien ne prouve qu'on a affaire à une adresse, et déclasser
    // une identité valable serait le défaut symétrique.
    const z = zone({ name: 'X', output_type: undefined, output_device_id: 'airplay-192.168.1.24-7000' });
    expect(identiteStable(z)).toBe(true);
  });
});

describe('Ce que l’instantané emporte', () => {
  it('les SEPT réglages de l’écran, et rien d’autre', () => {
    const cles = CLES_RENDERER.map((c) => c.cle);
    expect(cles).toEqual([
      'dlna_native_flac', 'alac_passthrough', 'aac_passthrough',
      'dlna_lpcm', 'dlna_wav24', 'dlna_cap_16bit', 'dlna_play_delay_ms',
    ]);
  });

  it('🔴 JAMAIS `fixed_volume` — l’armer pousse l’appareil à 100 % (#2395)', () => {
    // Le seul réglage de l'écran Appareils dont la mauvaise remise en place
    // s'entend dans un haut-parleur. Il n'entre pas dans cette liste, donc
    // aucune remise en place ne peut le poser.
    const cles = CLES_RENDERER.map((c) => String(c.cle));
    expect(cles).not.toContain('fixed_volume');
    const corps = corpsPatch(construireInstantane(EVERSOLO, ECRAN_EVERSOLO));
    expect(Object.keys(corps)).not.toContain('fixed_volume');
  });

  it('les valeurs viennent de l’ÉCRAN, pas de la fiche de zone', () => {
    // L'écran est écrit dès le clic, mais la fiche reçue en `props` peut
    // encore porter l'état d'avant. C'est l'écran qui fait foi.
    const i = construireInstantane(zone({ dlna_native_flac: false }), {
      ...ECRAN_NEUTRE, dlna_native_flac: true,
    });
    expect(i.reglages.dlna_native_flac).toBe(true);
  });

  it('🔴 une clé que le serveur ne publie PAS n’entre pas dans l’instantané', () => {
    // Serveur antérieur à la colonne : `aac_passthrough` est absent de la
    // fiche. L'écrire à sa valeur d'écran ferait croire qu'il a été relevé, et
    // la remise en place le patcherait dans le vide.
    const ancien = zone({});
    delete (ancien as unknown as Record<string, unknown>).aac_passthrough;

    const r = reglagesAEnregistrer(ancien, ECRAN_EVERSOLO);
    expect('aac_passthrough' in r).toBe(false);
    expect(r.dlna_native_flac, 'les autres clés doivent être là').toBe(true);
  });

  it('le nom et la date accompagnent les réglages', () => {
    const i = construireInstantane(EVERSOLO, ECRAN_EVERSOLO, new Date('2026-09-11T10:20:30Z'));
    expect(i.version).toBe(VERSION);
    expect(i.nom).toBe('Eversolo DMP-A8');
    expect(i.enregistre_le).toBe('2026-09-11T10:20:30.000Z');
  });
});

describe('Ranger et relire', () => {
  const CLE = cleAppareil(EVERSOLO)!;
  const table = (): Instantanes =>
    ranger({}, CLE, construireInstantane(EVERSOLO, ECRAN_EVERSOLO));

  it('ranger ne mute pas la table reçue', () => {
    // Le store de préférences compare par référence : muter en place ne
    // déclencherait ni l'écriture locale ni la synchronisation serveur.
    const avant: Instantanes = {};
    const apres = ranger(avant, CLE, construireInstantane(EVERSOLO, ECRAN_EVERSOLO));
    expect(avant).toEqual({});
    expect(apres[CLE]).toBeTruthy();
  });

  it('un aller-retour rend la même configuration', () => {
    const relu = lireInstantane(table(), CLE)!;
    expect(relu.reglages).toEqual({
      dlna_native_flac: true, alac_passthrough: true, aac_passthrough: true,
      dlna_lpcm: false, dlna_wav24: true, dlna_cap_16bit: false,
      dlna_play_delay_ms: 0,
    });
  });

  it('oublier retire cette configuration, et elle seule', () => {
    const deux = ranger(table(), 'sortie:uuid:autre', construireInstantane(zone({}), ECRAN_NEUTRE));
    const reste = oublier(deux, CLE);
    expect(lireInstantane(reste, CLE)).toBeNull();
    expect(lireInstantane(reste, 'sortie:uuid:autre')).toBeTruthy();
  });

  it('rien de rangé, ou pas de clé : rien à proposer', () => {
    expect(lireInstantane(undefined, CLE)).toBeNull();
    expect(lireInstantane({}, CLE)).toBeNull();
    expect(lireInstantane(table(), null)).toBeNull();
  });
});

describe('Une entrée douteuse est traitée comme absente', () => {
  // Ce qui sort d'ici sert à ÉCRIRE sur un appareil. Un blob de préférences
  // corrompu, ou écrit par une version ultérieure, ne doit rien écraser.
  const cas: [string, unknown][] = [
    ['pas un objet', 'nawak'],
    ['nul', null],
    ['aucun réglage connu', { version: 1, reglages: { reglage_de_demain: true } }],
    ['réglages absents', { version: 1, enregistre_le: '2026-09-11' }],
    ['version future', { version: VERSION + 1, reglages: { dlna_native_flac: true } }],
  ];

  for (const [nom, brut] of cas) {
    it(nom, () => {
      expect(lireInstantane({ k: brut } as unknown as Instantanes, 'k')).toBeNull();
    });
  }

  it('🔴 un réglage du mauvais TYPE est écarté, pas converti', () => {
    // `dlna_play_delay_ms: "2000"` patché tel quel partirait en texte dans une
    // colonne entière. Et un `dlna_native_flac: 1` n'est pas un booléen.
    const relu = lireInstantane(
      {
        k: {
          version: 1, enregistre_le: '', nom: '',
          reglages: { dlna_native_flac: 1, dlna_play_delay_ms: '2000', alac_passthrough: true },
        },
      } as unknown as Instantanes,
      'k',
    )!;
    expect(relu.reglages).toEqual({ alac_passthrough: true });
  });
});

describe('Ce que la remise en place changerait', () => {
  const enregistre = construireInstantane(EVERSOLO, ECRAN_EVERSOLO);

  it('rien quand l’écran porte déjà la configuration enregistrée', () => {
    expect(ecarts(enregistre, ECRAN_EVERSOLO)).toEqual([]);
  });

  it('l’écart est nommé, avec ce qui est là et ce qui serait remis', () => {
    // Le cas réel : la zone a été recréée, ses colonnes sont repartic au
    // défaut, et l'écran en est le reflet.
    const e = ecarts(enregistre, ECRAN_NEUTRE);
    expect(e.map((x) => x.cle)).toEqual([
      'dlna_native_flac', 'alac_passthrough', 'aac_passthrough', 'dlna_wav24',
    ]);
    expect(e[0]).toEqual({ cle: 'dlna_native_flac', courant: false, enregistre: true });
  });

  it('une clé absente de l’instantané n’est PAS un écart', () => {
    // Absent veut dire « ne touche pas », jamais « remets à zéro ».
    const partiel: Instantane = {
      version: VERSION, enregistre_le: '', nom: '',
      reglages: { dlna_native_flac: true },
    };
    const e = ecarts(partiel, { ...ECRAN_NEUTRE, aac_passthrough: true });
    expect(e.map((x) => x.cle)).toEqual(['dlna_native_flac']);
  });

  it('le délai de démarrage compte comme les drapeaux', () => {
    const avecDelai = construireInstantane(EVERSOLO, { ...ECRAN_EVERSOLO, dlna_play_delay_ms: 2000 });
    const e = ecarts(avecDelai, ECRAN_EVERSOLO);
    expect(e).toEqual([{ cle: 'dlna_play_delay_ms', courant: 0, enregistre: 2000 }]);
  });
});

describe('Le corps du PATCH de remise en place', () => {
  it('🔴 porte TOUJOURS la paire `dlna_lpcm` / `dlna_wav24`, pas le seul écart', () => {
    // Les deux sont exclusifs côté serveur. N'envoyer que celui qui diffère
    // laisserait la zone porter « forcer le 16 bits » ET « forcer le 24 bits ».
    // Même raison qu'`api.updateZoneWavMode`, qui patche toujours les deux.
    const en24 = construireInstantane(EVERSOLO, ECRAN_EVERSOLO);
    const corps = corpsPatch(en24);
    expect(corps.dlna_wav24).toBe(true);
    expect(corps.dlna_lpcm, 'la moitié muette de la paire est le défaut à écrire').toBe(false);
  });

  it('les sept clés quand le serveur les publie toutes', () => {
    const corps = corpsPatch(construireInstantane(EVERSOLO, ECRAN_EVERSOLO));
    expect(Object.keys(corps).sort()).toEqual(CLES_RENDERER.map((c) => String(c.cle)).sort());
  });

  it('une clé absente de l’instantané reste absente du corps', () => {
    const partiel: Instantane = {
      version: VERSION, enregistre_le: '', nom: '',
      reglages: { dlna_native_flac: true },
    };
    expect(corpsPatch(partiel)).toEqual({ dlna_native_flac: true });
  });
});
