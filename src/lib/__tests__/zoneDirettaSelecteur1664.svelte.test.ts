// @vitest-environment jsdom
/**
 * #1664 — Patatorz, fil 1860 : la zone Diretta « dCS Vivaldi Upsampler Plus
 * USB » est sur la page Zones et absente du sélecteur de la barre de lecture.
 *
 * Deux bancs :
 *
 * 1. Le CONTENU : la barre monte le vrai composant avec une liste où la zone
 *    Diretta (sortie d'un type que le client ne connaît pas, identifiant
 *    d'appareil non standard) est triée en dernier, comme le fait le serveur
 *    (`ORDER BY name`, binaire : « dCS… » passe après les majuscules). La zone
 *    doit avoir sa ligne. Ce banc était déjà vert avant le correctif : il
 *    établit qu'aucun filtre ne l'écarte.
 *
 * 2. La MISE EN PAGE, cause réelle : le menu est une colonne flex à hauteur
 *    bornée ; tant que ses lignes gardaient `flex-shrink: 1`, la dernière
 *    (`overflow: hidden`, donc hauteur minimale 0) était écrasée à 0 px dès que
 *    la liste dépassait la hauteur du panneau. jsdom ne calcule aucune mise en
 *    page : ce banc lit donc la feuille du composant et exige que les enfants
 *    du menu ne puissent pas rétrécir. Mesure faite dans Chromium sur Shrek
 *    (voir la PR) : 0 px avant, 36 px après.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';

const DCS = 'dCS Vivaldi Upsampler Plus USB';

function zonesDeTest(variante: Record<string, unknown>) {
  const reseau = Array.from({ length: 11 }, (_, i) => ({
    id: i + 1,
    name: `Zone ${String.fromCharCode(65 + i)}`,
    output_type: 'dlna',
    output_device_id: `uuid:${i}`,
    state: 'stopped',
    online: true,
  }));
  return [
    ...reseau,
    {
      id: 42,
      name: DCS,
      output_type: 'diretta',
      output_device_id: 'diretta:192.168.1.50-dCS Vivaldi Upsampler Plus USB',
      state: 'playing',
      online: true,
      is_default: true,
      ...variante,
    },
  ];
}

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  })));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {},
  }));
  selecteurZoneOuvert.set(false);
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  vi.unstubAllGlobals();
});

describe('#1664 — la zone Diretta a sa ligne dans le sélecteur', () => {
  const variantes: [string, Record<string, unknown>][] = [
    ['diretta, qui joue', {}],
    ['diretta, arrêtée, pas par défaut', { state: 'stopped', is_default: false }],
    ['type de sortie inconnu du client', { output_type: 'tune-server-diretta' }],
    ['identifiant d’appareil par index', { output_device_id: 'diretta:0' }],
    ['sans identifiant d’appareil', { output_device_id: null }],
    ['sans type de sortie', { output_type: null }],
    ['hors ligne', { online: false, state: 'stopped' }],
  ];

  for (const [nom, variante] of variantes) {
    it(nom, () => {
      zones.set(zonesDeTest(variante) as never);
      currentZoneId.set(1);
      const hote = document.createElement('div');
      document.body.appendChild(hote);
      hotes.push(hote);
      montes.push(mount(TransportBar, { target: hote }));
      flushSync();
      selecteurZoneOuvert.set(true);
      flushSync();
      const noms = Array.from(hote.querySelectorAll('.zone-popover .zone-popover-name'))
        .map((e) => e.textContent?.trim());
      expect(noms).toContain(DCS);
      expect(noms.length).toBe(12);
    });
  }
});

describe('#1664 — aucune ligne du menu des zones ne peut rétrécir', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/partages/TransportBar.svelte'),
    'utf8',
  );
  const feuille = (source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  /** Les règles (sélecteur, déclarations) de la feuille, à plat. */
  function regles(): { selecteurs: string[]; corps: string }[] {
    const rendu: { selecteurs: string[]; corps: string }[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(feuille))) {
      rendu.push({ selecteurs: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), corps: m[2] });
    }
    return rendu;
  }

  it('le menu est bien une colonne flex à hauteur bornée qui défile (la condition du défaut)', () => {
    const menu = regles().find((r) => r.selecteurs.includes('.zone-popover'));
    expect(menu).toBeTruthy();
    expect(menu!.corps).toMatch(/display:\s*flex/);
    expect(menu!.corps).toMatch(/flex-direction:\s*column/);
    expect(menu!.corps).toMatch(/max-height:/);
    expect(menu!.corps).toMatch(/overflow-y:\s*auto/);
  });

  it('les enfants directs du menu ont flex-shrink: 0', () => {
    const tous = regles().filter((r) =>
      r.selecteurs.some((s) => s === '.zone-popover > *'),
    );
    expect(
      tous.some((r) => /flex-shrink:\s*0\s*(;|$)/.test(r.corps.trim())),
      'sans `.zone-popover > * { flex-shrink: 0 }`, la dernière ligne (overflow: hidden) est écrasée à 0 px quand la liste déborde',
    ).toBe(true);
  });
});
