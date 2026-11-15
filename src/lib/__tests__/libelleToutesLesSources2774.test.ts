// renesenses/tune-web-client#2774 — Didier, fil 2610 : sur la page des albums
// d'un artiste, la pastille « Toutes » de la rangée Source se lisait comme
// « tous les albums ». Décision du 10/11 : écrire « Toutes les sources », et le
// même libellé partout où ce sélecteur existe (Bibliothèque, Favoris, page
// artiste). La pastille des Favoris et de la page artiste (`v2.fav.allSources`)
// reprend donc mot pour mot celle de la Bibliothèque (`v2.lib.sourceAll`).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import lDe from '../locales/de';
import lEl from '../locales/el';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lFr from '../locales/fr';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lNb from '../locales/nb';
import lPl from '../locales/pl';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lVi from '../locales/vi';
import lZh from '../locales/zh';

const langues: Record<string, Record<string, string>> = {
  de: lDe, el: lEl, en: lEn, es: lEs, fr: lFr, hu: lHu, it: lIt, ja: lJa, ko: lKo,
  nb: lNb, pl: lPl, ro: lRo, sv: lSv, vi: lVi, zh: lZh,
};

describe('#2774 — « Toutes les sources », dans les 15 langues', () => {
  it('le français dit « Toutes les sources », plus « Toutes » seul', () => {
    expect(lFr['v2.fav.allSources']).toBe('Toutes les sources');
    expect(lEn['v2.fav.allSources']).toBe('All sources');
  });

  it.each(Object.keys(langues))('%s : même libellé que la Bibliothèque', (l) => {
    const d = langues[l];
    expect(d['v2.lib.sourceAll'], `${l} : v2.lib.sourceAll`).toBeTruthy();
    expect(d['v2.fav.allSources'], `${l} : v2.fav.allSources`).toBe(d['v2.lib.sourceAll']);
  });

  it('la page artiste et les Favoris affichent bien cette clé', () => {
    for (const f of ['DiscographieCommune.svelte', 'FavoritesV2.svelte']) {
      const src = readFileSync(resolve(__dirname, '../../components/v2', f), 'utf-8');
      expect(src, f).toContain("'v2.fav.allSources'");
    }
  });
});
