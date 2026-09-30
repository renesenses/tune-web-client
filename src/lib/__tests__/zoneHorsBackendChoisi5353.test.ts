// @vitest-environment jsdom
//
// tune-server-rust#5353 — Jean-François (fil 2018) : « Le choix est bien ASIO
// malgré l'erreur WASAPI ». ASIO était choisi, mais il jouait sur la zone
// « Speakers », une sortie WASAPI, et rien à l'écran ne le lui disait.
//
// Décision de Bertrand (29/09/2026) : ces zones RESTENT jouables, mais elles
// sont SIGNALÉES. Le serveur (tune-server-rust#5458) pose `backend_sortie` et
// `hors_backend_choisi` sur la zone ; la liste des zones montre un badge
// « WASAPI » et la note « ASIO est choisi : utilisez la zone ASIO ».
//
// Le banc MONTE le badge, là où le rendu se joue : une règle juste mais jamais
// dessinée resterait verte sur un écran muet.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { locale } from '../i18n';
import { signalementHorsBackend } from '../zoneHorsBackend';
import BadgeHorsBackend from '../../components/v2/BadgeHorsBackend.svelte';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const SPEAKERS = {
  id: 1,
  name: 'This Computer',
  output_type: 'local',
  output_device_id: 'local:Speakers',
  backend_sortie: 'wasapi',
  hors_backend_choisi: true,
};

let monte: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  document.body.innerHTML = '';
});

function rendre(zone: Record<string, unknown>): HTMLElement {
  locale.set('fr');
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  monte = mount(BadgeHorsBackend, { target: cible, props: { zone: zone as any } });
  flushSync();
  return cible;
}

describe('#5353 — une zone WASAPI quand ASIO est choisi', () => {
  it('🔴 porte le badge « WASAPI » et la note qui conseille la zone ASIO', () => {
    const cible = rendre(SPEAKERS);
    const badge = cible.querySelector('[data-hors-backend]');
    expect(badge?.textContent).toBe('WASAPI');
    expect(cible.textContent).toContain('ASIO est choisi : utilisez la zone ASIO');
  });

  it('un serveur sans le drapeau ne change rien', () => {
    const { backend_sortie: _b, hors_backend_choisi: _h, ...ancien } = SPEAKERS;
    expect(rendre(ancien).innerHTML.replace(/<!---->/g, '').trim()).toBe('');
  });

  it('le pilote ASIO, lui, n’est pas signalé', () => {
    const cible = rendre({ ...SPEAKERS, output_device_id: 'local:STX', backend_sortie: 'asio', hors_backend_choisi: false });
    expect(cible.querySelector('[data-hors-backend]')).toBeNull();
  });

  it('WASAPI choisi, sortie encore ASIO : badge « ASIO », sans la note ASIO', () => {
    const cible = rendre({ ...SPEAKERS, backend_sortie: 'asio', hors_backend_choisi: true });
    expect(cible.querySelector('[data-hors-backend]')?.textContent).toBe('ASIO');
    expect(cible.textContent).not.toContain('utilisez la zone ASIO');
  });

  it('la règle : aucun signalement sans backend connu', () => {
    expect(signalementHorsBackend({ hors_backend_choisi: true })).toBeNull();
    expect(signalementHorsBackend({ hors_backend_choisi: true, backend_sortie: '  ' })).toBeNull();
    expect(signalementHorsBackend({ backend_sortie: 'wasapi' })).toBeNull();
  });

  it('🔴 la liste des zones le dessine dans ses DEUX vues (grille et liste)', () => {
    const ecran = readFileSync(resolve(process.cwd(), 'src/components/v2/ZonesV2.svelte'), 'utf-8')
      .replace(/<!--[\s\S]*?-->/g, '');
    const grille = ecran.slice(ecran.indexOf('<div class="grille">'), ecran.indexOf('<div class="list">'));
    const liste = ecran.slice(ecran.indexOf('<div class="list">'));
    expect(grille).toContain('<BadgeHorsBackend zone={z} />');
    expect(liste).toContain('<BadgeHorsBackend zone={z} />');
  });

  it('la note existe dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const texte = dictionnaire(code)['v2.zone.horsBackendAsio'];
      expect(texte, code).toBeTruthy();
      expect(texte, code).toContain('ASIO');
    }
  });
});
