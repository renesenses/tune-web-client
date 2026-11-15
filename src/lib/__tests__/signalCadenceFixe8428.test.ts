// @vitest-environment jsdom
// Contrat de #8520 : fixed_rate est une raison du chemin du signal,
// pas une contrainte de GET /upsampler. Le serveur fournit déjà les textes.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});
it.each([
  ['fr', 'Suréchantillonnage inactif : la fréquence de sortie fixe de la zone porte déjà la conversion ; retirez-la dans les réglages de la zone pour suréchantillonner', '192 kHz demandé, 96 kHz appliqué'],
  ['en', "Upsampling inactive: the zone's fixed output sample rate already performs the conversion; remove it in the zone settings to upsample", '192 kHz requested, 96 kHz applied'],
])('affiche les descriptions serveur %s avec la nouvelle raison fixed_rate', (_langue, raison, plafond) => {
  zones.set([{
    id: 1, name: 'Zone synthétique', state: 'playing', online: true, volume: 0.4,
    signal_path: {
      bit_perfect: false, lossless: true,
      upsampling: { active: false, reason: 'fixed_rate', filter: 'polyvalent' },
      rate_conversion: { from_hz: 44100, to_hz: 96000 },
      steps: [
        { name: 'Source', description: 'FLAC 44,1 kHz', bit_perfect: true },
        { name: 'Resampler', code: 'rate_conversion', description: '44,1 kHz → 96 kHz', bit_perfect: false },
        { name: 'Upsampler', code: 'upsampling', description: raison, bit_perfect: true },
        { name: 'Output sample rate', code: 'fixed_rate_limit', description: plafond, bit_perfect: true },
        { name: 'Output', description: 'WASAPI', bit_perfect: true },
      ],
    },
  }] as never);
  currentZoneId.set(1);
  component = mount(TransportBar, { target: host });
  flushSync();
  const bouton = host.querySelector<HTMLButtonElement>('.signal-led');
  expect(bouton).not.toBeNull();
  bouton!.click();
  flushSync();
  const panneau = host.querySelector('.sp-card');
  expect(panneau?.textContent, '8428 : la cause fournie par le serveur reste visible').toContain(raison);
  expect(panneau?.textContent, '8428 : demande et cadence appliquée restent visibles').toContain(plafond);
  expect(bouton!.classList.contains('bit-perfect')).toBe(false);
  expect(host.querySelectorAll('.sp-row')[2]?.querySelector('.sp-ndot')?.classList.contains('bp')).toBe(true);
});
