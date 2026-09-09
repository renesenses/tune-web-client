// @vitest-environment jsdom
//
// « Choix de la zone dans barre de lecture : proposer le nom de la zone et pas
// le nom de la marque et du modèle de l'appareil » — renesenses/tune-server-rust
// #3695, FabienM, fils forum 1691 (07/09/2026, v0.9.140) puis 1730
// (09/09/2026, v0.9.143, `severity: major`, avec capture) :
//
//   « Ici par exemple : il faudrait afficher "Salon" au lieu de "D Phantom" »
//
// La pastille refermée inversait la priorité par rapport au menu déroulant de
// la MÊME pastille : le menu montrait « Salon » puis « D Phantom » en
// sous-titre, la pastille n'écrivait que « D Phantom ». C'était un choix
// documenté dans `zoneIdentity.ts` ; Bertrand l'a repris le 09/09/2026.
//
// 🔴 CES TÉMOINS MONTENT LA VRAIE BARRE ET LISENT LE DOM. Vérifier que
// `zoneChipLabel` renvoie la bonne chaîne ne prouve pas ce que l'utilisateur
// voit : on lit ici le `textContent` du `<span class="zone-chip-label">` rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TransportBar from '../../components/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';

/** La capture de FabienM : « Salon », DLNA, « D Phantom » en sous-titre —
 *  et l'appareil vient de la DÉTECTION, pas d'une saisie. */
const SALON = {
  id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
  output_type: 'dlna',
  detected_manufacturer: 'D', detected_model: 'Phantom',
};

/** Une zone que l'utilisateur n'a pas nommée. Le serveur renvoie tantôt
 *  `null`, tantôt la chaîne vide — c'est la chaîne vide qui est piégeuse. */
const SANS_NOM = {
  id: 2, name: '', state: 'stopped', online: true, volume: 0.4,
  output_type: 'dlna',
  brand: 'Marantz', model: 'ND8006',
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poserLaBarre(liste: unknown[], courante: number): HTMLDivElement {
  zones.set(liste as never);
  currentZoneId.set(courante);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  return hote;
}

/** Le texte RENDU de la pastille refermée. */
function pastille(el: HTMLElement): string {
  const span = el.querySelector('.zone-chip-label');
  expect(span, 'le <span class="zone-chip-label"> a disparu de la barre de lecture').not.toBeNull();
  return (span!.textContent ?? '').trim();
}

function ouvrirLeSelecteur(el: HTMLElement) {
  const bouton = el.querySelector('.zone-selector-btn') as HTMLButtonElement;
  expect(bouton, 'le sélecteur de zones a disparu de la barre').not.toBeNull();
  bouton.click();
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('#3695 — la pastille de zone porte le nom de la zone', () => {
  it('écrit « Salon » et non « D Phantom » — le cas exact de la capture', () => {
    const el = poserLaBarre([SALON], 1);
    const vu = pastille(el);
    expect(
      vu,
      `la pastille écrit « ${vu} » : le nom choisi par l'utilisateur est encore évincé par l'appareil (#3695)`,
    ).toBe('Salon');
    expect(vu).not.toBe('D Phantom');
    expect(vu.includes('Phantom')).toBe(false);
  });

  it('une zone SANS nom retombe sur l’appareil, et jamais sur du vide', () => {
    const el = poserLaBarre([SANS_NOM], 2);
    const vu = pastille(el);
    // Une pastille vide serait un défaut pire que celui qu'on corrige : elle
    // se lit comme une panne de la barre.
    expect(vu.length, 'la pastille est VIDE sur une zone sans nom').toBeGreaterThan(0);
    expect(vu).toBe('Marantz ND8006');
  });

  it('la marque et le modèle restent lisibles là où ils informent', () => {
    // Contre-épreuve du correctif lui-même : on n'a pas supprimé l'appareil du
    // produit, on a seulement cessé de le faire passer devant le nom SUR LA
    // PASTILLE. Il reste (a) en sous-titre dans le menu déroulant de cette même
    // pastille, (b) dans l'étiquette d'accessibilité du bouton.
    const el = poserLaBarre([SALON, SANS_NOM], 1);
    ouvrirLeSelecteur(el);

    const sousTitres = Array.from(el.querySelectorAll('.zone-popover-device'))
      .map((n) => (n.textContent ?? '').trim());
    expect(
      sousTitres,
      `le menu déroulant n'affiche plus l'appareil : sous-titres vus = ${JSON.stringify(sousTitres)}`,
    ).toContain('D Phantom');

    const bouton = el.querySelector('.zone-selector-btn') as HTMLButtonElement;
    const etiquette = bouton.getAttribute('aria-label') ?? '';
    expect(
      etiquette,
      `l'étiquette d'accessibilité du bouton ne porte plus l'appareil : « ${etiquette} »`,
    ).toContain('D Phantom');
    expect(etiquette).toContain('Salon');
  });
});
