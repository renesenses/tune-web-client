import { describe, it, expect, vi } from 'vitest';
/**
 * Annuaire radio-metadata.fr (tune-server-rust#6516) : ce que l'écran envoie
 * au serveur Tune — jamais à mozaiklabs.fr ni à radio-metadata.fr.
 */
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
const api = await import('../api');

function repond(corps: unknown, status = 200) {
  const texte = JSON.stringify(corps);
  const f = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => texte,
    json: async () => JSON.parse(texte),
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('annuaire des radios', () => {
  it('la liste part vers le serveur Tune, filtres en paramètres', async () => {
    const f = repond({ items: [], total: 0 });
    await api.getAnnuaireRadios({ q: ' fip ', country: 'FR', genre: 'eclectic', offset: 120, limit: 60 });
    const url = f.mock.calls[0][0] as string;
    expect(url.startsWith('/api/v1/radios/directory?')).toBe(true);
    const p = new URLSearchParams(url.split('?')[1]);
    expect(Object.fromEntries(p)).toEqual({ q: 'fip', country: 'FR', genre: 'eclectic', offset: '120', limit: '60' });
  });

  it('sans filtre, aucun paramètre vide', async () => {
    const f = repond({ items: [] });
    await api.getAnnuaireRadios({ q: '  ', country: null, genre: null });
    expect(f.mock.calls[0][0]).toBe('/api/v1/radios/directory');
  });

  it('ajouter est un POST qui dit si la station va aussi en favori', async () => {
    const f = repond({ id: 9, name: 'FIP', stream_url: 'x', favorite: true }, 201);
    await api.ajouterDepuisAnnuaire('S000973', true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/radios/directory/S000973/add');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ favorite: true });
  });

  it('écouter une fiche est un POST sur sa zone, identifiant encodé', async () => {
    const f = repond({ zone_id: 4, radio: 'x', output_sent: true });
    await api.jouerDepuisAnnuaire('S/1', 4);
    expect(f.mock.calls[0][0]).toBe('/api/v1/radios/directory/S%2F1/play/4');
    expect(f.mock.calls[0][1].method).toBe('POST');
  });
});

describe('radios dans la recherche globale (tune-server-rust#7045)', () => {
  it('demande les radios SEULES : sources=radios, sans la bibliothèque ni les services', async () => {
    const f = repond({ radios: [], radios_annuaire: { total: 0, items: [] } });
    await api.chercherRadios('fip jazz');
    expect(f.mock.calls[0][0]).toBe('/api/v1/search?q=fip%20jazz&sources=radios');
  });

  it("lit « Mes radios » et l'annuaire, et dit combien l'aperçu n'en montre pas", async () => {
    repond({
      radios: [{ id: 3, name: 'FIP', stream_url: 'x', favorite: false }],
      radios_annuaire: { total: 45, items: [{ external_id: 'S1', name: 'FIP Jazz', stream_url: 'y', now_playing: false }] },
    });
    const r = await api.chercherRadios('fip');
    expect(r.miennes.map((x) => x.name)).toEqual(['FIP']);
    expect(r.annuaire.map((x) => x.name)).toEqual(['FIP Jazz']);
    expect(r.reste).toBe(44);
  });

  it("un serveur plus ancien (sans radios_annuaire, ou sans rien) ne casse pas l'écran", async () => {
    repond({ local: { artists: [], albums: [], tracks: [] }, services: {} });
    expect(await api.chercherRadios('fip')).toEqual({ miennes: [], annuaire: [], reste: 0 });
    expect(api.lireRadiosTrouvees(null)).toEqual({ miennes: [], annuaire: [], reste: 0 });
    expect(api.lireRadiosTrouvees({ radios: [{ id: 1, name: 'A', stream_url: 'x', favorite: false }] }).reste).toBe(0);
  });
});
