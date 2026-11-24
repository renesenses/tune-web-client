// @vitest-environment jsdom
/**
 * #3240 — carte /world : l'attribution DB-IP (licence CC BY 4.0), fournie par le
 * champ `attribution` de `/api/v1/world/countries`, s'affiche en pied de carte.
 * Champ absent (ancien site) ou illisible : rien n'est affiché.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { paysMondeValides, attributionValide } from '../paysMonde';
import { locale, preparerLocale } from '../i18n';
import PaysMondeV2 from '../../components/v2/PaysMondeV2.svelte';
import fr from '../locales/fr';

const ATTRIBUTION = { label: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', licence: 'CC BY 4.0' };
const base = { pays: { FR: 42 }, maj: '2026-11-19T08:00:00Z' };
const montes: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  for (const c of montes.splice(0)) await unmount(c);
  document.body.innerHTML = '';
});

async function monter(json: unknown) {
  await preparerLocale('fr');
  locale.set('fr');
  const donnees = paysMondeValides(json)!;
  const target = document.body.appendChild(document.createElement('div'));
  montes.push(mount(PaysMondeV2, { target, props: { donnees, afficher: true, onAfficher: () => {} } }));
  await tick();
  flushSync();
  return target;
}

describe('#3240 — attribution DB-IP sur la carte des instances', () => {
  it('🔴 lit le champ attribution du JSON', () => {
    expect(paysMondeValides({ ...base, attribution: ATTRIBUTION })?.attribution).toEqual({
      label: 'IP Geolocation by DB-IP', url: 'https://db-ip.com/', licence: 'CC BY 4.0',
    });
  });

  it('🔴 affiche le lien vers la source en pied de carte, avec la licence', async () => {
    const target = await monter({ ...base, attribution: ATTRIBUTION });
    const lien = target.querySelector('.pays-monde a') as HTMLAnchorElement | null;
    expect(lien).not.toBeNull();
    expect(lien!.textContent).toBe('IP Geolocation by DB-IP');
    expect(lien!.getAttribute('href')).toBe('https://db-ip.com/');
    expect(lien!.getAttribute('rel')).toContain('noopener');
    const note = lien!.closest('p')!.textContent!;
    expect(note).toContain((fr as unknown as Record<string, string>)['v2.circle.worldCountries.attribution']);
    expect(note).toContain('(CC BY 4.0)');
  });

  it('ancien site sans le champ : aucune attribution affichée', async () => {
    const target = await monter(base);
    expect(paysMondeValides(base)).not.toHaveProperty('attribution');
    expect(target.querySelector('.pays-monde')).not.toBeNull();
    expect(target.querySelector('.pays-monde a')).toBeNull();
  });

  it('refuse un lien qui ne serait pas http(s) et un libellé vide', () => {
    expect(attributionValide({ label: 'x', url: 'javascript:void(0)' })).toBeNull();
    expect(attributionValide({ label: '  ', url: 'https://db-ip.com' })).toBeNull();
    expect(attributionValide({ label: 'x', url: 'pas une url' })).toBeNull();
    expect(attributionValide('IP Geolocation by DB-IP')).toBeNull();
    expect(attributionValide({ label: 'x', url: 'https://db-ip.com' })).toEqual({ label: 'x', url: 'https://db-ip.com/' });
  });
});
