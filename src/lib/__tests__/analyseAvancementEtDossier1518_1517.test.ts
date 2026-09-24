import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import {
  avancementAnalyse, fusionnerAvancement, pourcentAnalyse, aDesChiffres,
  abonnerAvancementAnalyse, lancerAnalyse, demarrerAvancement, terminerAvancement,
} from '../analyseBibliotheque';
import fr from '../locales/fr';

/**
 * #1518 — aucun avancement pendant une analyse de bibliothèque.
 * #1517 — plus d'analyse par dossier dans les Réglages.
 *
 * Les deux vivent dans le même écran, `SettingsV2.svelte`.
 */

/** Un faux bus d'événements, aussi proche que possible de `tuneWS.onEvent`. */
function fauxBus() {
  const handlers: ((e: any) => void)[] = [];
  return {
    onEvent: (h: (e: any) => void) => {
      handlers.push(h);
      return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
    },
    emettre: (type: string, data?: any) => handlers.slice().forEach((h) => h({ type, data })),
    combien: () => handlers.length,
  };
}

beforeEach(() => terminerAvancement());

describe('#1518 — les chiffres apparaissent pendant une analyse', () => {
  /** Le geste que l'utilisateur voit : il lance une analyse, le serveur
   *  travaille, et l'écran montre où il en est — au lieu d'un « Analyse en
   *  cours » figé pendant des heures sur un NAS. */
  it('un scan qui tourne fait apparaître fichiers, total et pourcentage', () => {
    const bus = fauxBus();
    const off = abonnerAvancementAnalyse(bus.onEvent);

    // Phase 1, le parcours des dossiers : le serveur ne connaît pas encore le
    // total, il envoie 0. Pas de pourcentage possible — mais le compte bouge.
    bus.emettre('library.scan.progress', {
      phase: 'indexing', scanned: 1840, added: 0, total: 0, current_dir: '/NAS/Musique/Jazz',
    });
    let a = get(avancementAnalyse);
    expect(a?.scanned).toBe(1840);
    expect(a?.dossier).toBe('/NAS/Musique/Jazz');
    expect(pourcentAnalyse(a)).toBeNull();   // null, PAS 0 : « 0 % » serait faux
    expect(aDesChiffres(a)).toBe(true);

    // Phase 2, les fichiers : le total existe, la jauge aussi.
    bus.emettre('library.scan.progress', {
      phase: 'files', scanned: 900, total: 3000, inserted: 120, updated: 8, skipped: 4,
    });
    a = get(avancementAnalyse);
    expect(pourcentAnalyse(a)).toBe(30);
    expect(a?.inserted).toBe(120);
    expect(a?.updated).toBe(8);
    expect(a?.skipped).toBe(4);

    // La fin efface l'avancement : un écran qui garde « 30 % » après coup ment.
    bus.emettre('library.scan.completed', { inserted: 120 });
    expect(get(avancementAnalyse)).toBeNull();
    off();
    expect(bus.combien()).toBe(0);
  });

  /** Le sondage ne PEUT PAS y arriver : la route ne porte qu'un booléen. C'est
   *  la raison pour laquelle #1518 exige l'abonnement à l'événement. */
  it('`GET /scan/status` ne porte aucun compteur — le sondage seul ne suffit pas', () => {
    const api = readFileSync('src/lib/api.ts', 'utf8');
    const bloc = api.slice(api.indexOf('export function getScanStatus'));
    const signature = bloc.slice(0, bloc.indexOf('}\n'));
    expect(signature).toContain('scanning: boolean');
    expect(signature).not.toContain('scanned');
    expect(signature).not.toContain('total');
  });

  /** Les phases tardives (`prune`, `artwork`) n'envoient QUE leur champ : un
   *  remplacement remettrait les compteurs à zéro juste quand ils comptent. */
  it('une phase partielle ne remet pas les compteurs à zéro', () => {
    const plein = fusionnerAvancement(null, {
      phase: 'files', scanned: 3000, total: 3000, inserted: 400, updated: 12, skipped: 9,
    });
    const apres = fusionnerAvancement(plein, { phase: 'prune', pruned: 7 });
    expect(apres.phase).toBe('prune');
    expect(apres.inserted).toBe(400);
    expect(apres.scanned).toBe(3000);
    expect(pourcentAnalyse(apres)).toBe(100);
  });

  it('le pourcentage reste borné, même sur des chiffres incohérents', () => {
    expect(pourcentAnalyse(fusionnerAvancement(null, { scanned: 5000, total: 3000 }))).toBe(100);
    expect(pourcentAnalyse(fusionnerAvancement(null, { scanned: -4, total: 3000 }))).toBe(0);
    expect(pourcentAnalyse(fusionnerAvancement(null, { scanned: 10, total: 0 }))).toBeNull();
  });

  /** L'écran s'abonne vraiment, et ne se contente pas du sondage. */
  it("l'écran des Réglages est abonné à `library.scan.progress`", () => {
    const ecran = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(ecran).toContain('abonnerAvancementAnalyse');
    expect(ecran).toContain('tuneWS.onEvent');
    // Et il AFFICHE les chiffres, pas seulement le booléen.
    expect(ecran).toContain("$t('v2.scan.progress'");
    expect(ecran).toContain('pourcentAnalyse($avancementAnalyse)');
  });

  /** `TuneHealthV2` affirmait en commentaire que le serveur ne donne pas de
   *  pourcentage. C'était faux : `sansJauge` ne doit plus être un `true` en
   *  dur sur la carte d'analyse. */
  it('la carte « Analyse » de Tune Health ne se déclare plus sans jauge par principe', () => {
    const sante = readFileSync('src/components/v2/TuneHealthV2.svelte', 'utf8');
    // La carte du scan RÉUSSI seulement : la branche de repli (route
    // injoignable) garde `sansJauge: true` à juste titre — elle n'a aucun
    // chiffre à montrer, ce n'est pas le défaut que #1518 décrit.
    const debut = sante.indexOf("id: 'scan', titre");
    const carte = sante.slice(debut, sante.indexOf('    } else {', debut));
    expect(carte).toContain('sansJauge: pctScan === null');
    expect(carte).not.toContain('sansJauge: true');
    expect(sante).toContain('abonnerAvancementAnalyse');
  });

  it('les messages d’avancement sont au catalogue français', () => {
    expect((fr as any)['v2.scan.progress']).toContain('{p}');
    expect((fr as any)['v2.scan.indexing']).toContain('{f}');
    expect((fr as any)['v2.scan.progressCounts']).toContain('{a}');
  });
});

describe('#1517 — analyser UN dossier, et lui seul', () => {
  it('le geste par dossier envoie CE chemin, pas toute la bibliothèque', async () => {
    const declencher = vi.fn(async () => ({ status: 'scanning' }));
    const r = await lancerAnalyse(declencher, { chemin: '/NAS/Musique/Jazz' });
    expect(r.ok).toBe(true);
    expect(declencher).toHaveBeenCalledWith('/NAS/Musique/Jazz', false);
    // Et l'écran sait quel dossier il analyse : c'est ce qu'il affichera.
    expect(get(avancementAnalyse)?.cible).toBe('/NAS/Musique/Jazz');
  });

  it("l'analyse globale, elle, ne vise toujours aucun dossier", async () => {
    const declencher = vi.fn(async () => ({ status: 'scanning' }));
    await lancerAnalyse(declencher, { complete: true });
    expect(declencher).toHaveBeenCalledWith(undefined, true);
    expect(get(avancementAnalyse)?.cible).toBeNull();
  });

  /** Un chemin vide ou fait d'espaces n'est PAS une cible : l'envoyer tel quel
   *  ferait croire à un scan ciblé là où le serveur scanne tout. */
  it('un chemin vide retombe sur la bibliothèque entière', async () => {
    const declencher = vi.fn(async () => ({}));
    await lancerAnalyse(declencher, { chemin: '   ' });
    expect(declencher).toHaveBeenCalledWith(undefined, false);
  });

  it('un refus du serveur ne fait pas croire qu’une analyse tourne', async () => {
    const declencher = vi.fn(async () => { throw new Error('409'); });
    const r = await lancerAnalyse(declencher, { chemin: '/NAS/Musique' });
    expect(r.ok).toBe(false);
    expect(get(avancementAnalyse)).toBeNull();
  });

  /** La ligne de chaque dossier porte bien le geste, au niveau Essentiel —
   *  c'est tout l'objet du ticket : le seul geste ciblé restant vivait dans
   *  l'explorateur, classé « Avancé », donc invisible là où les dossiers sont
   *  listés. */
  it('chaque dossier listé porte un bouton qui analyse CE dossier', () => {
    const ecran = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    const liste = ecran.slice(ecran.indexOf('{#each musicDirs as d (d)}'));
    const ligne = liste.slice(0, liste.indexOf('{/each}'));
    expect(ligne).toContain('scan(false, d)');
    expect(ligne).toContain("$t('v2.scan.folderAction'");
    // Le retrait reste ce qu'il était : on ajoute un geste, on n'en retire pas.
    expect(ligne).toContain('removeDir(d)');
  });

  /** Le serveur accepte le chemin : la signature du client le passe bien. */
  it('`triggerScan` sait porter un chemin', () => {
    const api = readFileSync('src/lib/api.ts', 'utf8');
    const bloc = api.slice(api.indexOf('export function triggerScan'));
    expect(bloc.slice(0, 400)).toContain("params.set('path', path)");
  });

  it('le libellé du geste par dossier est au catalogue français', () => {
    expect((fr as any)['v2.scan.folderAction']).toBeTruthy();
    expect((fr as any)['v2.scan.folderHint']).toBeTruthy();
    expect((fr as any)['v2.scan.progressFolder']).toContain('{d}');
  });
});

describe('l’état partagé', () => {
  it('démarrer garde la cible et repart de zéro', () => {
    demarrerAvancement('/NAS/Musique');
    const a = get(avancementAnalyse);
    expect(a?.cible).toBe('/NAS/Musique');
    expect(a?.scanned).toBe(0);
    expect(aDesChiffres(a)).toBe(false);   // rien à montrer : on n'affiche rien
  });
});
