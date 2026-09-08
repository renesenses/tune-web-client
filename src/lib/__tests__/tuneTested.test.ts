/**
 * Le catalogue « Tune tested » lu par le client.
 *
 * Chantier ouvert par Bertrand le 08/09/2026, objectif 3 : « afficher avec un
 * badge les appareils Tune tested sur la page Réglages/Appareils ».
 *
 * ## Ce que la mesure a imposé
 *
 * Relevé sur le .18 le 08/09/2026, `GET /devices` — ce que la découverte rend
 * réellement :
 *
 *     manufacturer: "Sonos, Inc."   model: "Sonos Play:1"
 *     manufacturer: "EVERSOLO"      model: "AV Renderer Device"
 *
 * La marque porte sa raison sociale, et le modèle d'Eversolo n'est pas un
 * modèle. Une comparaison naïve n'aurait fait correspondre AUCUN appareil.
 *
 * Et sur `GET /zones` : **1 zone sur 14** portait une marque corrigée. Le badge
 * se tait donc la plupart du temps, et c'est le comportement juste — mieux vaut
 * pas de badge qu'un badge faux.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  chargerCatalogueTuneTested,
  clefAppareil,
  indexer,
  oublierCatalogue,
  URL_CATALOGUE,
  DUREE_CACHE_MS,
  type CatalogueTuneTested,
} from '../tuneTested';

const CATALOGUE: CatalogueTuneTested = {
  version: 1788800000,
  count: 2,
  devices: [
    {
      brand: 'Sonos', model: 'Play:1', output_type: 'dlna',
      vocabulary: 'tune.renderer.v1',
      settings: { dlna_lpcm: true }, households: 9,
      validated_at: '2026-09-08T09:00:00+00:00', note: null,
    },
    {
      brand: 'Eversolo', model: 'DMP-A8', output_type: 'dlna',
      vocabulary: 'tune.quirks.v1',
      settings: { max_sample_rate: 192000 }, households: 20,
      validated_at: '2026-09-08T09:05:00+00:00', note: 'Firmware 1.4.',
    },
  ],
};

/**
 * `environment: 'node'` dans `vitest.config.ts` : pas de `localStorage`. On en
 * pose un vrai — une simple Map —, et non un objet muet : ces tests vérifient
 * précisément que le cache RETIENT, ce qu'un faux stockage sans mémoire ne
 * pourrait pas montrer.
 */
const memoire = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => { memoire.set(k, String(v)); },
  removeItem: (k: string) => { memoire.delete(k); },
  clear: () => { memoire.clear(); },
});

const reponse = (corps: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(corps) }) as unknown as Response;

beforeEach(() => {
  localStorage.clear();
  oublierCatalogue();
});

describe('La clef d’un appareil', () => {
  it('🔴 retire la raison sociale que la découverte colle à la marque', () => {
    // Mesuré : `"Sonos, Inc."` là où le catalogue dit « Sonos ». Sans cela,
    // aucun Sonos ne porterait jamais son badge.
    expect(clefAppareil('Sonos, Inc.', 'Play:1')).toBe(clefAppareil('Sonos', 'Play:1'));
    for (const raison of ['Sonos, Inc.', 'Sonos Inc', 'Sonos, Incorporated', 'Sonos GmbH', 'Sonos Ltd.', 'Sonos Corp.']) {
      expect(clefAppareil(raison, 'Play:1'), raison).toBe('sonos play:1');
    }
  });

  it('plie comme le site : casse, espaces et tirets bas', () => {
    // Le catalogue s'indexe sur `mb_strtolower` + `[\s_]+` ramené à une espace.
    // Plier autrement, c'est ne jamais se rencontrer.
    expect(clefAppareil('AURALIC', 'ARIES_G2.2')).toBe('auralic aries g2.2');
    expect(clefAppareil('Auralic', 'Aries  G2.2')).toBe('auralic aries g2.2');
    expect(clefAppareil('  auralic ', ' aries g2.2 ')).toBe('auralic aries g2.2');
  });

  it('🔴 sans MODÈLE, il n’y a pas d’appareil', () => {
    // Une marque seule ne désigne rien, et le catalogue refuse d'enregistrer un
    // modèle bouche-trou.
    expect(clefAppareil('Sonos', null)).toBeNull();
    expect(clefAppareil('Sonos', '   ')).toBeNull();
    // Une marque vide, en revanche, reste une clef valable : le site range bien
    // « (rien) / FiiO SR11 ».
    expect(clefAppareil(null, 'FiiO SR11')).toBe(' fiio sr11');
  });

  it('une marque entièrement faite de sa raison sociale ne se vide pas en boucle', () => {
    // Le retrait est répété tant qu'il mord : il doit s'arrêter.
    expect(clefAppareil('Inc.', 'X')).toBeTruthy();
    expect(clefAppareil('Co. Ltd.', 'X')).toBeTruthy();
  });
});

describe('L’index', () => {
  it('retrouve un appareil quelle que soit la graphie reçue', () => {
    const index = indexer(CATALOGUE);
    expect(index.get(clefAppareil('Sonos, Inc.', 'Play:1')!)?.brand).toBe('Sonos');
    expect(index.get(clefAppareil('EVERSOLO', 'dmp-a8')!)?.model).toBe('DMP-A8');
  });

  it('un appareil absent du catalogue ne rend rien — pas un badge par défaut', () => {
    const index = indexer(CATALOGUE);
    // C'est le cas MAJORITAIRE : 1 zone sur 14 portait une marque corrigée.
    expect(index.get(clefAppareil('EVERSOLO', 'AV Renderer Device')!)).toBeUndefined();
    expect(index.get(clefAppareil('WiiM', 'Pro')!)).toBeUndefined();
  });

  it('un catalogue absent donne un index vide, jamais une erreur', () => {
    expect(indexer(null).size).toBe(0);
  });
});

describe('Le chargement', () => {
  it('lit le catalogue et le range', async () => {
    const f = vi.fn().mockResolvedValue(reponse(CATALOGUE));
    const c = await chargerCatalogueTuneTested(f as unknown as typeof fetch);

    expect(c?.count).toBe(2);
    expect(f).toHaveBeenCalledWith(URL_CATALOGUE, { credentials: 'omit' });
  });

  /**
   * 🔴 LA RAISON 3 DE LA RÈGLE DU DÉPÔT.
   *
   * `api.ts` interdit d'appeler mozaiklabs.fr depuis la page, notamment parce
   * que « chaque client du parc rejouait cet appel à chaque changement
   * d'écran ». Le cache est ce qui rend cet appel acceptable.
   */
  it('🔴 ne redemande pas : une requête par navigateur et par jour', async () => {
    const f = vi.fn().mockResolvedValue(reponse(CATALOGUE));
    await chargerCatalogueTuneTested(f as unknown as typeof fetch);
    await chargerCatalogueTuneTested(f as unknown as typeof fetch);
    await chargerCatalogueTuneTested(f as unknown as typeof fetch);

    expect(f).toHaveBeenCalledTimes(1);
  });

  it('redemande une fois le cache périmé', async () => {
    const f = vi.fn().mockResolvedValue(reponse(CATALOGUE));
    await chargerCatalogueTuneTested(f as unknown as typeof fetch);

    // On vieillit l'entrée plutôt que d'attendre vingt-quatre heures.
    const brut = JSON.parse(localStorage.getItem('tune_v2_catalogue_tune_tested')!);
    brut.at = Date.now() - DUREE_CACHE_MS - 1000;
    localStorage.setItem('tune_v2_catalogue_tune_tested', JSON.stringify(brut));

    await chargerCatalogueTuneTested(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('trois écrans montés ensemble ne font qu’un aller-retour', async () => {
    let resoudre: (r: Response) => void = () => {};
    const f = vi.fn().mockReturnValue(new Promise<Response>((r) => { resoudre = r; }));

    const trois = Promise.all([
      chargerCatalogueTuneTested(f as unknown as typeof fetch),
      chargerCatalogueTuneTested(f as unknown as typeof fetch),
      chargerCatalogueTuneTested(f as unknown as typeof fetch),
    ]);
    resoudre(reponse(CATALOGUE));
    const [a, b, c] = await trois;

    expect(f).toHaveBeenCalledTimes(1);
    expect(a?.count).toBe(2);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('🔴 un échec rend `null` et ne fait pas tomber l’écran', async () => {
    // Hors ligne, site indisponible : le badge disparaît, et c'est tout. Il ne
    // doit jamais empêcher l'écran de s'afficher.
    for (const f of [
      vi.fn().mockRejectedValue(new Error('offline')),
      vi.fn().mockResolvedValue(reponse(null, false)),
      vi.fn().mockResolvedValue(reponse({ message: 'Service Unavailable' })),
    ]) {
      oublierCatalogue();
      localStorage.clear();
      await expect(chargerCatalogueTuneTested(f as unknown as typeof fetch)).resolves.toBeNull();
    }
  });

  it('🔴 une réponse MALFORMÉE ne s’installe pas dans le cache pour la journée', async () => {
    // Une page de maintenance HTML servie en 200 rendrait le badge muet
    // vingt-quatre heures durant.
    const mauvais = vi.fn().mockResolvedValue(reponse({ devices: 'pas un tableau' }));
    await chargerCatalogueTuneTested(mauvais as unknown as typeof fetch);
    expect(localStorage.getItem('tune_v2_catalogue_tune_tested')).toBeNull();

    const bon = vi.fn().mockResolvedValue(reponse(CATALOGUE));
    expect((await chargerCatalogueTuneTested(bon as unknown as typeof fetch))?.count).toBe(2);
  });
});
