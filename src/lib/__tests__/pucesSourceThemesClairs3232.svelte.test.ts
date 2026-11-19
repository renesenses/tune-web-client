// @vitest-environment jsdom
/**
 * web#3232 (fil 2934, rc12, Windows / Firefox) — thèmes « Clair / Gris » et
 * « Clair / Blanc » : la puce `LOCAL` (et les autres puces de source) était
 * illisible. `ServiceBadge` codait son texte en dur pour un fond sombre
 * (`#B4BCC8` : 1,3:1 sur `#EDEFF2`), sans aucun jeton de thème, et « Mon
 * thème » ne pouvait rien y faire.
 *
 * Correctif : la puce lit `--v2-puce-<source>` (repli = couleur d'origine) ;
 * les thèmes clairs et un « Mon thème » à fond clair posent une variante
 * assombrie (`PUCES_CLAIR`), un « Mon thème » sombre remet l'originale.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ServiceBadge from '../../components/partages/ServiceBadge.svelte';
import { PUCES_SOURCES, PUCES_CLAIR, PUCES_SOMBRE, FOND_PUCES, type PuceSource } from '../pucesSource';
import { contraste, cssDuTheme, type ThemePerso } from '../monTheme';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
/** Le fond réel de la puce : son teint `rgba` posé sur le fond de l'écran. */
function fondPuce(s: PuceSource, ecran: string): string {
  const [r, g, b, a] = FOND_PUCES[s];
  const e = [1, 3, 5].map((i) => parseInt(ecran.slice(i, i + 2), 16));
  return '#' + [r, g, b].map((c, i) => hex(c * a + e[i] * (1 - a))).join('');
}
// Fond de page de « Clair / Blanc », de « Clair / Gris », et la surface la plus
// sombre de « Clair / Gris » (`--v2-surface2`).
const FONDS_CLAIRS = ['#FFFFFF', '#EDEFF2', '#E2E6EB'];

describe('contraste des puces de source sur fond clair (WCAG AA 4,5:1)', () => {
  it('épreuve : chaque variante claire tient 4,5:1 sur les trois fonds clairs', () => {
    for (const s of PUCES_SOURCES) for (const f of FONDS_CLAIRS) {
      expect(contraste(PUCES_CLAIR[s], fondPuce(s, f)), `${s} sur ${f}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('contre-épreuve : les couleurs d’origine, elles, n’y tiennent pas (le défaut rapporté)', () => {
    expect(contraste(PUCES_SOMBRE.local, fondPuce('local', '#EDEFF2'))).toBeLessThan(2);
    for (const s of PUCES_SOURCES) {
      expect(contraste(PUCES_SOMBRE[s], fondPuce(s, '#EDEFF2')), s).toBeLessThan(4.5);
    }
  });

  it('les couleurs d’origine restent lisibles sur le fond sombre par défaut', () => {
    for (const s of PUCES_SOURCES) {
      expect(contraste(PUCES_SOMBRE[s], fondPuce(s, '#000000')), s).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('branchement : la puce lit le jeton, les thèmes clairs le posent', () => {
  let instance: ReturnType<typeof mount> | null = null;
  afterEach(() => { if (instance) unmount(instance); instance = null; document.body.innerHTML = ''; });

  it('ServiceBadge lit `--v2-puce-<source>` avec la couleur d’origine en repli', () => {
    const src = lire('src/components/partages/ServiceBadge.svelte');
    for (const s of PUCES_SOURCES) {
      const bloc = new RegExp(`\\.service-badge\\.${s} \\{[^}]*\\}`).exec(src)?.[0] ?? '';
      expect(bloc, s).toContain(`color: var(--v2-puce-${s}, ${PUCES_SOMBRE[s]});`);
    }
  });

  it('tune-v2.css pose PUCES_CLAIR sur « Clair / Blanc » et « Clair / Gris », et seulement là', () => {
    const css = lire('src/styles/tune-v2.css');
    const m = /:root\[data-v2-theme="clear-white"\] \.tune-v2,\n:root\[data-v2-theme="clear-grey"\] \.tune-v2\{([^}]*--v2-puce-[^}]*)\}/.exec(css);
    expect(m, 'bloc des puces des thèmes clairs').not.toBeNull();
    for (const s of PUCES_SOURCES) expect(m![1]).toContain(`--v2-puce-${s}:${PUCES_CLAIR[s]};`);
    expect(css.match(/--v2-puce-local:/g)).toHaveLength(1);
  });

  it('la puce LOCAL rendue porte la classe que la feuille colore', () => {
    const hote = document.createElement('div');
    document.body.append(hote);
    instance = mount(ServiceBadge, { target: hote, props: { source: 'local' } });
    flushSync();
    const puce = hote.querySelector('.service-badge');
    expect(puce?.classList.contains('local')).toBe(true);
    expect(puce?.textContent?.trim()).toBe('LOCAL');
  });
});

describe('« Mon thème » : les puces suivent la famille du fond choisi', () => {
  const theme = (bg: string, txt: string): Pick<ThemePerso, 'colors'> => ({
    colors: {
      '--v2-bg': bg, '--v2-bg2': bg, '--v2-surface': bg, '--v2-surface2': bg, '--v2-hover': bg,
      '--v2-txt': txt, '--v2-txt2': txt, '--v2-txt3': txt, '--v2-acc1': '#356C88', '--v2-acc2': '#356C88',
      '--v2-acc-tint': txt, '--v2-on-acc': '#FFFFFF', '--v2-line': '#888888', '--v2-line2': '#888888',
      '--v2-active1': bg, '--v2-active2': bg, '--v2-player1': bg, '--v2-player2': bg,
      '--v2-danger': '#B3382B', '--v2-danger-bd': '#B3382B',
    },
  });
  it('fond clair → variantes claires', () => {
    const css = cssDuTheme(theme('#F4F1EA', '#1A1A1A'));
    for (const s of PUCES_SOURCES) expect(css).toContain(`--v2-puce-${s}:${PUCES_CLAIR[s]};`);
  });
  it('fond sombre → couleurs d’origine (même sur une palette de base claire)', () => {
    const css = cssDuTheme(theme('#101214', '#F0F0F0'));
    for (const s of PUCES_SOURCES) expect(css).toContain(`--v2-puce-${s}:${PUCES_SOMBRE[s]};`);
  });
});
