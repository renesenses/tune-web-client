/**
 * #1043 — Alex Campbell, 14/09/2026, zone « This computer » dans sa weblet :
 * « This zone plays in the browser, but no tab is receiving the sound » —
 * un bandeau SANS croix, qu'il ne pouvait pas fermer, alors que sa
 * configuration lui semblait correcte.
 *
 * Le bandeau se ferme pour l'INCIDENT COURANT : même zone + même motif =
 * fermé. Dès que la sortie redevient joignable, l'incident est clos et le
 * suivant s'affiche. Un autre motif, ou une autre zone, s'affiche aussi.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { creerBandeauLisible } from '../bandeauLisible';
import { dictionnaire } from './onzeDictionnaires';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#1043 — fermer le bandeau pour l’incident courant', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('🔴 fermé, il ne revient pas tant que la même zone porte le même motif', () => {
    const b = creerBandeauLisible(100);
    b.signaler(1, 'browser_unattended');
    expect(get(b.affiche)).toBe('browser_unattended');
    b.fermer();
    expect(get(b.affiche)).toBeNull();
    // Le serveur redit la même chose à chaque sondage : rien ne réapparaît.
    for (let i = 0; i < 5; i++) b.signaler(1, 'browser_unattended');
    expect(get(b.affiche)).toBeNull();
  });

  it('🔴 la sortie redevient joignable, puis retombe : c’est un NOUVEL incident, il s’affiche', () => {
    const b = creerBandeauLisible(100);
    b.signaler(1, 'browser_unattended');
    b.fermer();
    b.signaler(1, 'ok');
    b.signaler(1, 'browser_unattended');
    expect(get(b.affiche)).toBe('browser_unattended');
  });

  it('un AUTRE motif sur la même zone s’affiche', () => {
    const b = creerBandeauLisible(100);
    b.signaler(1, 'browser_unattended');
    b.fermer();
    b.signaler(1, 'no_output');
    expect(get(b.affiche)).toBe('no_output');
  });

  it('changer de zone oublie ce qui a été écarté', () => {
    const b = creerBandeauLisible(100);
    b.signaler(1, 'no_output');
    b.fermer();
    b.signaler(2, 'no_output');
    expect(get(b.affiche)).toBe('no_output');
    b.signaler(1, 'no_output');
    expect(get(b.affiche)).toBe('no_output');
  });

  it('fermer sans bandeau ne fait rien, et n’écarte rien pour plus tard', () => {
    const b = creerBandeauLisible(100);
    b.fermer();
    b.signaler(1, 'no_output');
    expect(get(b.affiche)).toBe('no_output');
  });

  it('fermer annule une extinction programmée — pas de double geste', () => {
    const b = creerBandeauLisible(1000);
    b.signaler(1, 'no_output');
    b.signaler(1, 'ok'); // extinction programmée dans 1 s
    b.fermer(); // fermé tout de suite
    expect(get(b.affiche)).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(get(b.affiche)).toBeNull();
  });
});

describe('branchement — la croix existe et appelle `fermer`', () => {
  it('🔴 le bandeau porte un bouton de fermeture', () => {
    const src = lire('src/components/partages/ZoneOutputBanner.svelte');
    expect(src).toContain('onclick={() => bandeau.fermer()}');
    // `[\s\S]*?` et non `[^>]*` : l'attribut `onclick={() => …}` porte un `>`.
    expect(src).toMatch(/class="zone-output-banner-close"[\s\S]*?aria-label=\{\$t\('zone\.bannerDismiss'\)\}/);
  });
  it('le libellé existe dans les onze langues', async () => {
    for (const code of ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh']) {
      const dico = dictionnaire(code);
      expect(dico['zone.bannerDismiss'], code).toBeTruthy();
    }
  });
});
