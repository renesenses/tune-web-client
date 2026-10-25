/**
 * web#2305 (suite de tune-server-rust#6729, PR #6744) — la carte Scan dit QUEL
 * scan tient le droit, et le refus 409 le nomme.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decrireScanCourant, refusScanConcurrent, ORIGINES_DE_SCAN } from '../scanDetenteur';
import { lancerAnalyse } from '../analyseBibliotheque';
import { fr, ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tr = (k: string) => (fr as Record<string, string>)[k] ?? k;
const heure = (s: number) => `H${s}`;

describe('web#2305 — la ligne du scan en cours', () => {
  it('nomme l’origine, le dossier et l’heure de départ', () => {
    const l = decrireScanCourant(
      { origin: 'late_network_mount', path: '/musique/Billy Joel', started_at: '1761160000', stale: false },
      tr, heure,
    );
    expect(l).toBe('Scan d’un partage réseau monté en retard · dossier /musique/Billy Joel · depuis H1761160000');
  });

  it('dit « toute la bibliothèque » sans dossier', () => {
    expect(decrireScanCourant({ origin: 'startup', path: null, started_at: '10', stale: false }, tr, heure))
      .toBe('Scan de démarrage · toute la bibliothèque · depuis H10');
  });

  it('dit le statut résiduel', () => {
    expect(decrireScanCourant({ origin: null, path: null, stale: true }, tr, heure))
      .toBe(tr('scanDetenteur.residuel'));
  });

  it('ne dit rien de plus quand le serveur ne nomme personne (serveur ancien, droit non annoncé)', () => {
    expect(decrireScanCourant(undefined, tr, heure)).toBeNull();
    expect(decrireScanCourant(null, tr, heure)).toBeNull();
    expect(decrireScanCourant({ origin: null, path: null, stale: false }, tr, heure)).toBeNull();
  });

  it('une origine inconnue reste dite, sans clé brute', () => {
    expect(decrireScanCourant({ origin: 'nouvelle', path: null, stale: false }, tr, heure))
      .toBe('Scan d’origine inconnue · toute la bibliothèque');
  });
});

describe('web#2305 — le refus 409 nomme le scan détenteur', () => {
  const refus = (current: unknown) =>
    Object.assign(new Error('409'), { status: 409, corps: { status: 'already_scanning', scanning: true, current } });

  it('nomme le scan qui tient le droit', () => {
    const m = refusScanConcurrent(refus({ origin: 'scheduled', path: null, started_at: '5', stale: false }), tr, heure);
    expect(m).toBe('Le serveur a refusé : un autre scan est déjà en cours (Scan programmé · toute la bibliothèque · depuis H5). Réessayez quand il sera terminé.');
  });

  it('rend null hors du refus nommé (l’écran garde sa phrase générique)', () => {
    expect(refusScanConcurrent(refus(undefined), tr, heure)).toBeNull();
    expect(refusScanConcurrent(Object.assign(new Error('x'), { status: 500 }), tr, heure)).toBeNull();
    expect(refusScanConcurrent(null, tr, heure)).toBeNull();
  });

  it('lancerAnalyse transmet l’erreur, pour que Réglages nomme le détenteur', async () => {
    const e = refus({ origin: 'manual', path: '/a', started_at: '1', stale: false });
    const r = await lancerAnalyse(async () => { throw e; }, { chemin: '/b' });
    expect(r.ok).toBe(false);
    expect(refusScanConcurrent(r.erreur, tr, heure)).toContain('Scan lancé à la main · dossier /a');
  });
});

describe('web#2305 — écrans branchés et 13 langues', () => {
  it('Réglages, État du serveur et Parcourir lisent le détenteur', () => {
    const lire = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
    expect(lire('../../components/v2/SettingsV2.svelte')).toMatch(/decrireScanCourant\(scanCourant/);
    expect(lire('../../components/v2/SettingsV2.svelte')).toMatch(/refusScanConcurrent\(r\.erreur/);
    expect(lire('../../components/v2/TuneHealthV2.svelte')).toMatch(/decrireScanCourant\(scan\.value\?\.current/);
    expect(lire('../../components/v2-heritage/BrowseView.svelte')).toMatch(/refusScanConcurrent\(e,/);
  });

  it('chaque libellé existe dans les 13 langues', () => {
    const cles = [
      ...ORIGINES_DE_SCAN.map((o) => `scanDetenteur.origine.${o}`),
      'scanDetenteur.origine.inconnue', 'scanDetenteur.dossier', 'scanDetenteur.toute',
      'scanDetenteur.depuis', 'scanDetenteur.residuel', 'scanDetenteur.refus409',
    ];
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of cles) expect(d[c], `${l} ${c}`).toBeTruthy();
      expect(d['scanDetenteur.refus409']).toContain('{scan}');
    }
  });
});
