// @vitest-environment jsdom
//
// web#2208 (Tades, fil 2312, rc6 Windows) — « Je ne sais pas quoi faire avec
// cette information : SACD_extract n'est pas détecté par Tune. Mais elle
// bloque le scan pour rien. »
//
// Depuis la v0.9.168 (tune-server-rust#5297, `tune-core/src/audio/sacd.rs`),
// Tune lit les ISO SACD NATIVEMENT ; `sacd_extract` ne sert plus qu'aux
// disques DST (DSD compressé), que le lecteur natif reconnaît sans les
// décoder. Le bloc « ISO SACD » de Réglages › Bibliothèque disait encore
// « Installez cet outil séparément sur le serveur […] puis relancez le scan » :
// les testeurs du fil en ont conclu qu'il fallait l'installer pour lire leurs
// ISO.
//
// Le témoin MONTE le vrai écran Réglages › Bibliothèque, serveur sans
// sacd_extract, et lit le texte rendu ; puis il tient les douze langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import SacdIsoStatus from '../../components/partages/SacdIsoStatus.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const isoUrl = '/api/v1/sacd-rip/iso-status';
let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let reply: unknown;
class Observer { observe() {} unobserve() {} disconnect() {} }
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const bloc = () => host.querySelector('.sacd-status')?.textContent ?? '';

beforeEach(() => {
  reply = { available: false, tool: 'none' };
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url === isoUrl ? reply : /\/(zones|devices)(\?|$)/.test(url) ? [] : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe('web#2208 — le bloc « ISO SACD » dit que Tune lit les ISO lui-même', () => {
  it('🔴 Réglages › Bibliothèque, sacd_extract absent : lecture native, l’outil réservé au DST', { timeout: 60_000 }, async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    v2SettingsTarget.set({ tab: 'library', section: 'library' });
    component = mount(SettingsV2, { target: host });
    await settle();
    const texte = bloc();
    expect(texte).toContain(fr['sacdIso.missing']);
    expect(texte).toContain('Tune lit les ISO SACD lui-même');
    expect(texte).toContain('DST');
    // Ce que le testeur a lu, et pris pour un prérequis.
    expect(texte).not.toContain('Installez cet outil séparément sur le serveur ;');
  });

  it('sacd_extract présent : il ne sert qu’aux disques DST', async () => {
    reply = { available: true, tool: 'sacd_extract' };
    component = mount(SacdIsoStatus, { target: host });
    await settle();
    expect(bloc()).toContain('Tune lit les ISO SACD lui-même');
    expect(bloc()).toContain('DST');
  });

  it.each(ONZE_LANGUES)('%s : les deux états nomment le DST, seul cas où l’outil sert', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['sacdIso.missing', 'sacdIso.available']) {
      expect(d[cle], `${code} ${cle} absent`).toBeTruthy();
      expect(d[cle], `${code} ${cle} : ne dit pas que l’outil ne sert qu’au DST`).toContain('DST');
      expect(d[cle]).toContain('sacd_extract');
    }
  });
});
