// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import type { CibleParTitre } from '../versionsParTitre';

let composant: ReturnType<typeof mount> | undefined;
let hote: HTMLDivElement;
afterEach(() => { if (composant) unmount(composant); hote?.remove(); vi.unstubAllGlobals(); });
const reposer = async () => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } };

it('conserve les résultats quand la même cible est republiée, recharge quand ses valeurs changent', async () => {
  const recherches: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/search?')) recherches.push(url);
    return new Response(JSON.stringify({ local: { tracks: [] }, streaming: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  const cible: CibleParTitre = { titre: 'Lovely Day', artiste: 'Bill Withers', source: 'qobuz', source_id: '52528016' };
  const props = $state({ parTitre: cible, titre: cible.titre, onClose: () => {} });
  hote = document.createElement('div'); document.body.appendChild(hote);
  composant = mount(VersionsPistePanneau, { target: hote, props });
  await reposer();
  expect(recherches).toHaveLength(1);
  const contenu = document.querySelector('.etat');
  expect(contenu).not.toBeNull();
  for (let i = 0; i < 3; i++) {
    props.parTitre = { ...cible };
    flushSync();
    expect(document.querySelector('.etat'), 'une cible identique ne remet pas le panneau en chargement').toBe(contenu);
    await reposer();
  }
  expect(recherches, 'une nouvelle référence identique ne doit pas relancer la recherche').toHaveLength(1);
  for (const changement of [{ titre: 'Lean On Me' }, { artiste: 'Autre artiste' }, { source: 'tidal' }, { source_id: 'autre' }]) {
    props.parTitre = { ...props.parTitre, ...changement };
    await reposer();
  }
  expect(recherches).toHaveLength(5);
});
