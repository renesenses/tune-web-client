// @vitest-environment jsdom
//
// tune-server-rust#7996 (Didier, forum, 05/11/2026) : « Est-ce utile d'avoir
// deux drapeaux signaler sur la page d'un artiste ? ». La photo et la bio
// avaient chacune leur `ReportButton`, côte à côte dans l'en-tête. Il n'en
// reste qu'un : son menu range les motifs sous le nom de chaque donnée, et
// chaque motif part sur la BONNE entité.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import ReportButton from '../../components/partages/ReportButton.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import lFr from '../locales/fr';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reportMetadata: vi.fn(async () => ({ pushed: false })),
}));

const FR = lFr as Record<string, string>;
const CIBLES = [
  { entity: 'artist_image' as const, entityId: 42, mbid: 'mb-1', titreKey: 'report.target.artistImage',
    reasons: ['wrong_entity', 'incorrect', 'poor_quality', 'offensive'] },
  { entity: 'bio' as const, entityId: 42, mbid: 'mb-1', titreKey: 'report.target.bio',
    reasons: ['incorrect', 'wrong_entity', 'offensive'] },
];

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
const stabiliser = async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

beforeEach(() => {
  locale.set('fr');
  vi.mocked(api.reportMetadata).mockClear();
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove();
});

function ouvrir(props: Record<string, unknown>) {
  composant = mount(ReportButton as any, { target: hote, props });
  flushSync();
  const boutons = hote.querySelectorAll('.report-btn');
  expect(boutons).toHaveLength(1);
  (boutons[0] as HTMLButtonElement).click();
  flushSync();
}

describe('tune-server-rust#7996 — un seul drapeau sur la page artiste', () => {
  it('🔴 la page artiste ne pose plus qu’UN ReportButton', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/ArtisteServiceV2.svelte'), 'utf-8')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(src.match(/<ReportButton\b/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/<ReportButton \{cibles\} \/>/);
  });

  it('photo ET bio : un drapeau, deux groupes nommés dans le menu', () => {
    ouvrir({ cibles: CIBLES });
    const groupes = [...hote.querySelectorAll('[data-report-groupe]')].map((g) => g.textContent);
    expect(groupes).toEqual([FR['report.target.artistImage'], FR['report.target.bio']]);
    expect(hote.querySelectorAll('.report-menu-item')).toHaveLength(7);
  });

  it('un motif du groupe « Biographie » part sur l’entité `bio`', async () => {
    ouvrir({ cibles: CIBLES });
    const items = [...hote.querySelectorAll<HTMLButtonElement>('.report-menu-item')];
    items[4].click(); // 1er motif du 2e groupe : « Donnée incorrecte » de la bio
    await stabiliser();
    expect(api.reportMetadata).toHaveBeenCalledWith({ entity: 'bio', entity_id: 42, mbid: 'mb-1', reason: 'incorrect' });
  });

  it('une seule donnée : pas d’intertitre de groupe', () => {
    ouvrir({ cibles: [CIBLES[1]] });
    expect(hote.querySelectorAll('[data-report-groupe]')).toHaveLength(0);
    expect(hote.querySelectorAll('.report-menu-item')).toHaveLength(3);
  });

  it('témoin : sans `cibles`, le bouton marche comme avant (champ et valeur transmis)', async () => {
    ouvrir({ entity: 'track', entityId: 7, field: 'composer', value: 'X', reasons: ['incorrect'] });
    expect(hote.querySelectorAll('[data-report-groupe]')).toHaveLength(0);
    hote.querySelector<HTMLButtonElement>('.report-menu-item')!.click();
    await stabiliser();
    expect(api.reportMetadata).toHaveBeenCalledWith({ entity: 'track', entity_id: 7, mbid: undefined, field: 'composer', value: 'X', reason: 'incorrect' });
  });
});
