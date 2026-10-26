// @vitest-environment jsdom
/**
 * #2109 — proposer la photo d'appareil au catalogue communautaire, et
 * seulement sur accord explicite.
 *
 * Tenu ici :
 * 1. la DÉCISION (`proposerPhotoAuCatalogue`) : refuser n'envoie rien, et le
 *    dialogue dit où part la photo AVANT l'envoi ;
 * 2. la ROUTE : `POST /zones/{id}/image/share`, celle du serveur ;
 * 3. l'HONNÊTETÉ : pas de bouton sur un serveur qui ne sait pas proposer, et
 *    jamais « partagée » — l'état reste « en attente de relecture » ;
 * 4. le BRANCHEMENT dans Réglages › Appareils, et les TEXTES en onze langues.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLES_AVANT_PROPOSITION, cleRefusProposition, proposerPhotoAuCatalogue, propositionPossible,
} from '../photoAppareil';
import { shareZoneImage } from '../api';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import plLocale from '../locales/pl';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const DICOS = { de, en, es, fr, hu, vi: viLocale, el: elLocale, nb: nbLocale, pl: plLocale, it: it_, ja, ko, ro, sv, zh } as unknown as Record<string, Record<string, string>>;
const traduire = (k: string) => `«${k}»`;

afterEach(() => vi.unstubAllGlobals());

describe('#2109 — proposerPhotoAuCatalogue', () => {
  it('refusé : rien ne part', async () => {
    const proposer = vi.fn(async () => ({ image_share_status: 'pending' as const }));
    const r = await proposerPhotoAuCatalogue(7, { confirmer: async () => false, traduire, proposer });
    expect(r).toBeNull();
    expect(proposer).not.toHaveBeenCalled();
  });

  it('accepté : la photo de CETTE zone est proposée, après la question', async () => {
    const ordre: string[] = [];
    let lu = '';
    const r = await proposerPhotoAuCatalogue(7, {
      confirmer: async (m) => { lu = m; ordre.push('question'); return true; },
      traduire,
      proposer: async (id) => { ordre.push(`envoi ${id}`); return { image_share_status: 'pending' }; },
    });
    expect(r).toEqual({ image_share_status: 'pending' });
    expect(ordre).toEqual(['question', 'envoi 7']);
    // Où part la photo, la consigne de prise de vue, puis la question.
    expect(lu).toBe(CLES_AVANT_PROPOSITION.map((c) => `«${c}»`).join('\n\n'));
    expect(CLES_AVANT_PROPOSITION).toContain('v2.zone.photoConsentGuide');
  });

  it('appelle POST /zones/{id}/image/share', async () => {
    const appels: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push([String(url), init]);
      return new Response(JSON.stringify({ zone_id: 7, image_share_status: 'pending' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    const r = await shareZoneImage(7);
    expect(r.image_share_status).toBe('pending');
    expect(appels).toHaveLength(1);
    expect(appels[0][0]).toMatch(/\/zones\/7\/image\/share(?:\?lang=[a-z]{2})?$/);
    expect(appels[0][1]?.method).toBe('POST');
  });
});

describe('#2109 — ce que l’écran promet', () => {
  it('pas de bouton sur un serveur d’avant #2109, ni sans photo', () => {
    expect(propositionPossible({ image_path: 'abc' })).toBe(false);
    expect(propositionPossible({ image_path: null, image_share_status: null })).toBe(false);
    expect(propositionPossible({ image_path: 'abc', image_share_status: null })).toBe(true);
  });

  it('les refus du serveur ont chacun leur phrase', () => {
    expect(cleRefusProposition({ status: 409 })).toBe('v2.zone.photoShareNeedsDevice');
    expect(cleRefusProposition({ status: 422 })).toBe('v2.zone.photoShareUnknownBrand');
    expect(cleRefusProposition({ status: 502 })).toBeNull();
    expect(cleRefusProposition(null)).toBeNull();
  });

  it('Réglages › Appareils passe par l’accord, jamais par la route en direct', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(src).toContain('proposerPhotoAuCatalogue(zid, {');
    expect(src).toContain('{#if propositionPossible(z)}');
    expect(src).toContain("{#if z.image_share_status === 'pending'}");
    expect(src).not.toContain('api.shareZoneImage(');
  });
});

describe('#2109 — les textes', () => {
  const CLES = [
    'v2.zone.photoShare', 'v2.zone.photoShareWhere', 'v2.zone.photoShareConfirm',
    'v2.zone.photoSharePending', 'v2.zone.photoShareSent',
    'v2.zone.photoShareNeedsDevice', 'v2.zone.photoShareUnknownBrand',
  ];

  it.each(Object.keys(DICOS))('%s : toutes les clés sont traduites', (langue) => {
    for (const c of CLES) {
      expect(DICOS[langue][c], `${langue} ${c}`).toBeTruthy();
      if (langue !== 'en') expect(DICOS[langue][c], `${langue} ${c} non traduite`).not.toBe(en[c as keyof typeof en]);
    }
  });

  it('le français dit que la photo est relue, et rien de partagé avant', () => {
    expect(fr['v2.zone.photoShareWhere']).toContain('Mozaiklabs');
    expect(fr['v2.zone.photoShareWhere']).toContain("rien n'est partagé avant l'approbation");
    expect(fr['v2.zone.photoSharePending']).toContain('en attente de relecture');
    // La photo posée ne « reste sur ce serveur » que tant qu'on ne la propose pas.
    expect(fr['v2.zone.deviceImageHint']).toContain('sauf si vous la proposez au catalogue');
  });
});
