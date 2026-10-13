/**
 * Assistant IA, étape 3 (tune-server-rust, chantier « assistant-ia ») :
 * suivi de consommation par usage, alerte à 80 % du plafond, tarif daté.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReglagesIa, EtatPlafondIa } from '../assistantIa';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
const notifier = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
vi.mock('../stores/notifications', () => ({ notifications: notifier }));

const ia = await import('../assistantIa');

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

const plafond = (p: Partial<EtatPlafondIa>): EtatPlafondIa => ({
  depense_eur: 1.6, plafond_eur: 2, part: 0.8, seuil_alerte: 80, alerte: true, atteint: false, ...p,
});

function reglages(conso: Partial<ReglagesIa['consommation']>): ReglagesIa {
  return {
    plafond_eur: 2,
    consommation: {
      mois: '2026-10', cout_eur: 1.7, appels: 3, jetons_entree: 0, jetons_sortie: 0,
      depuis_cache: 1, plafond_atteint: false, ...conso,
    },
  } as ReglagesIa;
}

describe('Assistant IA étape 3 — alerte à 80 %', () => {
  it("l'alerte s'affiche à partir de 80 % et se tait une fois le plafond atteint", () => {
    expect(ia.alerteAAfficher(plafond({}))).toBe(true);
    expect(ia.alerteAAfficher(plafond({ alerte: false, part: 0.5 }))).toBe(false);
    expect(ia.alerteAAfficher(plafond({ atteint: true, part: 1 }))).toBe(false);
    expect(ia.alerteAAfficher(null)).toBe(false);
    expect(ia.alerteAAfficher(undefined)).toBe(false);
  });

  it('le texte dit la part (arrondie vers le bas), la dépense et le plafond', () => {
    const t = ia.texteAlerte('{part} % — {cout} / {plafond}', plafond({ part: 0.8599, depense_eur: 1.72 }));
    expect(t).toBe('85 % — 1.72 / 2.00');
  });

  it("l'état du plafond se lit aussi dans les réglages, et pas sur un serveur d'avant l'étape 3", () => {
    const p = ia.plafondDesReglages(reglages({ alerte: true, part_du_plafond: 0.85 }));
    expect(p).toMatchObject({ alerte: true, atteint: false, part: 0.85, plafond_eur: 2, depense_eur: 1.7 });
    expect(ia.plafondDesReglages(reglages({}))).toBeNull();
    expect(ia.plafondDesReglages(null)).toBeNull();
  });
});

describe('Assistant IA étape 3 — consommation par usage', () => {
  it('les usages connus viennent dans leur ordre, les inconnus après', () => {
    const c = reglages({
      par_usage: {
        test: { cout_eur: 0.001, appels: 1, jetons_entree: 1, jetons_sortie: 1, depuis_cache: 0 },
        zzz: { cout_eur: 0, appels: 1, jetons_entree: 0, jetons_sortie: 0, depuis_cache: 0 },
        album: { cout_eur: 1.2, appels: 2, jetons_entree: 9, jetons_sortie: 9, depuis_cache: 1 },
        playlist: { cout_eur: 0.5, appels: 1, jetons_entree: 3, jetons_sortie: 3, depuis_cache: 0 },
      },
    }).consommation;
    expect(ia.lignesParUsage(c).map((l) => l.usage)).toEqual(['playlist', 'album', 'test', 'zzz']);
    expect(ia.lignesParUsage(c)[1]).toMatchObject({ usage: 'album', appels: 2, depuis_cache: 1 });
    expect(ia.lignesParUsage(reglages({}).consommation)).toEqual([]);
  });

  it('chaque usage connu a son nom traduit ; un usage inconnu garde le sien', () => {
    expect(ia.cleDUsage('album')).toBe('assistantIa.usageName.album');
    expect(ia.cleDUsage('inconnu')).toBeNull();
    const fr = source('../locales/fr.ts');
    for (const u of ia.USAGES_IA) expect(fr).toContain(`"assistantIa.usageName.${u}"`);
  });
});

describe('Assistant IA étape 3 — tarif daté', () => {
  it('une date ISO se lit dans la langue ; une date illisible reste telle quelle', () => {
    expect(ia.dateLisible('2027-01-01', 'fr')).toMatch(/2027/);
    expect(ia.dateLisible('2027-01-01', 'fr')).not.toBe('2027-01-01');
    expect(ia.dateLisible('pas une date')).toBe('pas une date');
    expect(ia.dateLisible(null)).toBe('');
  });
});

describe('Assistant IA étape 3 — branchements', () => {
  it("l'alerte est branchée sur les trois écrans d'usage et dans les réglages", () => {
    for (const f of ['PlaylistParPhraseV2', 'SuggestionsIaAlbumV2', 'SuggestionsIaLotV2', 'AssistantIaReglagesV2']) {
      const s = source(`../../components/v2/${f}.svelte`);
      expect(s, f).toContain('<AlertePlafondIaV2');
    }
    for (const f of ['PlaylistParPhraseV2', 'SuggestionsIaAlbumV2', 'SuggestionsIaLotV2']) {
      expect(source(`../../components/v2/${f}.svelte`), f).toContain('plafond = r.plafond ?? null');
    }
  });

  it('les réglages montrent le détail par usage et le tarif daté', () => {
    const s = source('../../components/v2/AssistantIaReglagesV2.svelte');
    expect(s).toContain('data-ia-par-usage');
    expect(s).toContain('data-ia-tarif');
    expect(s).toContain('data-ia-tarif-a-relever');
  });
});
