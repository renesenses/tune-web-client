/**
 * web#2073 — Tades, fil 2214 (1.0.0-rc3) : « J'écoute en "Pure" mais le
 * Crossfeed Pro est annoncé ». Lecture en cours allumait le bouton du
 * crossfeed (`class:cf-pro={cfProTraite}`, même style que `.active`) alors
 * que PURE était actif et la pastille Bit-Perfect verte : l'état venait du
 * greffon (actif, case cochée) et ignorait PURE, qui ne construit aucun
 * traitement.
 *
 * Attendu : en PURE, le bouton n'est jamais allumé, ni pour le greffon ni
 * pour le crossfeed intégré ; il dit pourquoi (même voile que les écrans
 * dédiés, `v2.pure.veilCfPro` / `v2.pure.veilCf`), et le panneau aussi.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { etatBoutonCrossfeed } from '../boutonCrossfeed';

describe('web#2073 — le bouton crossfeed de Lecture en cours tient compte de PURE', () => {
  it('🔴 PURE + greffon qui traite la zone : bouton éteint, voile du greffon', () => {
    const e = etatBoutonCrossfeed({ cfEnabled: false, cfProTraite: true, pur: true });
    expect(e.pro).toBe(false);
    expect(e.actif).toBe(false);
    expect(e.voile).toBe('v2.pure.veilCfPro');
  });
  it('🔴 PURE + crossfeed intégré coché : bouton éteint, voile du crossfeed', () => {
    const e = etatBoutonCrossfeed({ cfEnabled: true, cfProTraite: false, pur: true });
    expect(e.actif).toBe(false);
    expect(e.pro).toBe(false);
    expect(e.voile).toBe('v2.pure.veilCf');
  });
  it('hors PURE : rien ne change (greffon → pro, intégré → actif, pas de voile)', () => {
    expect(etatBoutonCrossfeed({ cfEnabled: false, cfProTraite: true, pur: false })).toEqual({ actif: false, pro: true, voile: null });
    expect(etatBoutonCrossfeed({ cfEnabled: true, cfProTraite: false, pur: false })).toEqual({ actif: true, pro: false, voile: null });
    expect(etatBoutonCrossfeed({ cfEnabled: false, cfProTraite: false, pur: false })).toEqual({ actif: false, pro: false, voile: null });
  });

  const source = readFileSync(resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'), 'utf-8');
  it('🔴 Lecture en cours branche l’état PURE du bouton PURE (store audiophileEnabled)', () => {
    expect(source).toMatch(/import \{[^}]*\baudiophileEnabled\b[^}]*\} from '\.\.\/\.\.\/lib\/stores\/audiophile'/);
    expect(source).toContain('etatBoutonCrossfeed({ cfEnabled, cfProTraite, pur: $audiophileEnabled, crosstalk: cfCrosstalk })');
    expect(source).toContain('class:active={cfBouton.actif}');
    expect(source).toContain('class:cf-pro={cfBouton.pro}');
    expect(source).not.toContain('class:cf-pro={cfProTraite}');
  });
  it('🔴 le panneau ouvert depuis ce bouton porte le voile PURE', () => {
    expect(source).toContain('{#if cfBouton.voile}<VoilePur cle={cfBouton.voile} />{/if}');
  });
});
