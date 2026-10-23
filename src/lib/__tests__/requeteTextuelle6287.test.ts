// @vitest-environment jsdom
//
// tune-server-rust#6287, étape 2 — la requête textuelle des playlists
// intelligentes s'écrit, s'essaie et se reprend dans l'éditeur.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ postRequeteTextuelle: vi.fn() }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import RequeteAvanceeV2 from '../../components/v2/RequeteAvanceeV2.svelte';
import { decouperALaPosition, essayerRequete } from '../requeteTextuelle';
import { t } from '../i18n';

const tr = (cle: string) => get(t)(cle);

const OK = {
  tracks: [{ id: 1, title: 'Waltz for Debby', artist_name: 'Bill Evans' }],
  total: 1,
  regles_refusees: [],
  rules: [{ field: 'genre', op: 'contains', value: 'jazz' }],
  match_mode: 'all',
};

function refus(position: number | null) {
  return Object.assign(new Error('400 Bad Request'), {
    corps: { error: 'requete_invalide', message: 'parenthèse fermante attendue', position },
  });
}

describe('essayer une requête', () => {
  it('rend la réponse, avec les tris et la borne de l’éditeur', async () => {
    const poster = vi.fn(async () => OK as any);
    const r = await essayerRequete('genre:jazz', { sort_by: 'year', sort_order: 'desc', max_tracks: 50 }, poster);
    expect(poster).toHaveBeenCalledWith({ q: 'genre:jazz', sort_by: 'year', sort_order: 'desc', max_tracks: 50 });
    expect(r).toMatchObject({ etat: 'ok', reponse: { total: 1, match_mode: 'all' } });
  });
  it('un refus du serveur garde son message et sa position', async () => {
    const r = await essayerRequete('(genre:jazz', {}, async () => { throw refus(11); });
    expect(r).toEqual({ etat: 'invalide', message: 'parenthèse fermante attendue', position: 11 });
  });
  it('toute autre erreur est un échec, pas un refus', async () => {
    const r = await essayerRequete('x', {}, async () => { throw new Error('404 Not Found'); });
    expect(r.etat).toBe('echec');
  });
  it('une requête sans forme d’éditeur rend `rules: null`', async () => {
    const r = await essayerRequete('non genre:jazz', {}, async () => ({ ...OK, rules: null, match_mode: null }) as any);
    expect(r).toMatchObject({ etat: 'ok', reponse: { rules: null, match_mode: null } });
  });
});

describe('la position de l’erreur', () => {
  it('coupe en caractères, accents compris', () => {
    expect(decouperALaPosition('année:19x', 8)).toEqual({ avant: 'année:19', fautif: 'x', apres: '' });
    expect(decouperALaPosition('abc', 99)).toEqual({ avant: 'abc', fautif: '', apres: '' });
  });
});

describe('le composant', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    cible?.remove();
    mocks.postRequeteTextuelle.mockReset();
  });

  async function essayerAvec(q: string, onReprendre = vi.fn()) {
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(RequeteAvanceeV2, { target: cible, props: { triPar: 'title', ordre: 'asc', maximum: 200, onReprendre } });
    flushSync();
    const zone = cible.querySelector('textarea')!;
    zone.value = q;
    zone.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (cible.querySelector('[data-essayer]') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) { await Promise.resolve(); await tick(); }
    flushSync();
    return onReprendre;
  }

  it('montre le compte, et reprend les règles dans l’éditeur', async () => {
    mocks.postRequeteTextuelle.mockResolvedValue(OK);
    const reprendre = await essayerAvec('genre:jazz');
    expect(mocks.postRequeteTextuelle).toHaveBeenCalledWith({ q: 'genre:jazz', sort_by: 'title', sort_order: 'asc', max_tracks: 200 });
    const res = cible.querySelector('[data-requete-resultat]')!;
    expect(res.textContent).toContain(tr('v2.spl.requeteCompte').replace('{n}', '1'));
    expect(res.textContent).toContain('Waltz for Debby — Bill Evans');
    (cible.querySelector('[data-reprendre]') as HTMLButtonElement).click();
    expect(reprendre).toHaveBeenCalledWith(OK.rules, 'all');
  });

  it('une requête imbriquée : pas de reprise, et on dit pourquoi', async () => {
    mocks.postRequeteTextuelle.mockResolvedValue({ ...OK, rules: null, match_mode: null });
    await essayerAvec('non (genre:jazz ou genre:blues)');
    expect(cible.querySelector('[data-reprendre]')).toBeNull();
    expect(cible.querySelector('[data-sans-forme]')?.textContent).toBe(tr('v2.spl.requeteSansForme'));
  });

  it('une requête fautive : le message, et le caractère fautif marqué', async () => {
    mocks.postRequeteTextuelle.mockRejectedValue(refus(3));
    await essayerAvec('ab(c');
    const err = cible.querySelector('[data-requete-erreur]')!;
    expect(err.textContent).toContain('parenthèse fermante attendue');
    expect(err.querySelector('mark')?.textContent).toBe('c');
  });
});

describe('l’éditeur monte la requête avancée', () => {
  it('sous les règles, avec la reprise vers ses règles et son mode', () => {
    const src = readFileSync('src/components/v2/PlaylistSmartEditeurV2.svelte', 'utf8');
    expect(src).toContain('<RequeteAvanceeV2 {triPar} {ordre} {maximum} onReprendre={reprendreRequete} />');
    expect(src).toMatch(/function reprendreRequete[\s\S]*?regles = lues\.length[\s\S]*?mode = m;/);
  });
});
