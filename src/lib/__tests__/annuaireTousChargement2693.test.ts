// @vitest-environment jsdom
//
// web#2693, relecture de la PR #2756 — la puce « Tous » de l'annuaire radio
// ne doit jamais montrer le total d'une AUTRE requête que celle des filtres
// affichés :
//
//  (a) pendant un chargement sans genre, la page affichée est encore celle de
//      la réponse précédente : « Tous (40) » juste après avoir quitté le genre
//      Info ;
//  (b) une réponse qui arrive pendant la pause de frappe (250 ms) d'un
//      changement de filtres ne doit pas être notée sous la clé des NOUVEAUX
//      filtres.
//
// Le témoin MONTE l'annuaire, le serveur répondant à la demande du test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
// `vi.mock` est remonté en tête par Vitest : l'import statique reçoit le faux serveur.
import RadioAnnuaire from '../../components/v2/RadioAnnuaire.svelte';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 60_000 });

type Reponse = { items: unknown[]; total: number; stations: number; genres: { key: string; count: number }[]; countries: unknown[] };
const enAttente: { params: any; repondre: (r: Reponse) => void }[] = [];

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  getAnnuaireRadios: (params: any) => new Promise<Reponse>((repondre) => { enAttente.push({ params, repondre }); }),
}));


const reponse = (total: number): Reponse => ({
  items: [], total, stations: 1119, genres: [{ key: 'news', count: 40 }, { key: 'rock', count: 300 }], countries: [],
});
const respirer = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function attendreRequete(n: number) {
  for (let i = 0; i < 100 && enAttente.length < n; i++) await respirer(10);
  expect(enAttente.length, `requête n° ${n} partie`).toBeGreaterThanOrEqual(n);
}
async function repondre(i: number, total: number) {
  enAttente[i].repondre(reponse(total));
  for (let k = 0; k < 5; k++) await respirer();
  flushSync();
}
const puceTous = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.chips .chip')!;

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  enAttente.length = 0;
  preferences.update((p) => ({ ...p, radioFiltres: null }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  preferences.update((p) => ({ ...p, radioFiltres: null }));
});

describe('web#2693 — « Tous » pendant un chargement', () => {
  it('🔴 (a) quitter le genre Info : pas de « Tous (40) » pendant le chargement', async () => {
    monte = mount(RadioAnnuaire, { target: hote, props: { genre: 'news' } as any });
    await attendreRequete(1);
    await repondre(0, 40);
    expect(puceTous(hote).textContent).not.toMatch(/\(40\)/);

    puceTous(hote).click();
    flushSync();
    await attendreRequete(2);
    expect(enAttente[1].params.genre ?? null).toBeNull();
    expect(puceTous(hote).textContent, 'réponse sans genre pas encore là').not.toMatch(/\(\d+\)/);

    await repondre(1, 271);
    expect(puceTous(hote).textContent).toMatch(/\(271\)/);
  });

  it('🔴 (b) réponse arrivée pendant la pause de frappe : pas notée sous les nouveaux filtres', async () => {
    monte = mount(RadioAnnuaire, { target: hote, props: { q: 'jazz' } as any });
    await attendreRequete(1);
    // Les critères changent pendant que la première requête est en vol : la
    // suivante attend la fin de la pause de frappe (250 ms, `q` non vide).
    preferences.update((p) => ({ ...p, radioFiltres: { lossless: true } as any }));
    flushSync();
    await repondre(0, 1119);
    expect(enAttente.length, 'la requête des nouveaux filtres n’est pas encore partie').toBe(1);
    expect(puceTous(hote).textContent, 'le total des ANCIENS filtres ne vaut pas pour les nouveaux').not.toMatch(/\(1119\)/);

    await attendreRequete(2);
    await repondre(1, 12);
    expect(puceTous(hote).textContent).toMatch(/\(12\)/);
  });
});
