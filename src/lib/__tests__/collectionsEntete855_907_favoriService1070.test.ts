import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * #855 / #907 — Collections : seule la liste défile, l'en-tête (« Retour »,
 * tri, onglets) reste à l'écran.
 * #1070 — la recopie d'un favori vers le service ne se tait plus.
 */
const SRC = readFileSync('src/components/v2/CollectionsV2.svelte', 'utf8');
const CSS = SRC.slice(SRC.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('#855 / #907 — l’en-tête de Collections reste à l’écran', () => {
  it('la section ne défile plus elle-même', () => {
    const regle = CSS.match(/\.v2-collections\{[^}]*\}/)![0];
    expect(regle).not.toMatch(/overflow-y:\s*auto/);
    expect(regle).toMatch(/overflow:\s*hidden/);
  });

  it('un conteneur `.defil` porte le défilement', () => {
    expect(CSS).toMatch(/\.defil\{[^}]*overflow-y:\s*auto/);
  });

  it('dans le détail, la grille est dans `.defil`, l’en-tête et son Retour dehors', () => {
    const detail = SRC.slice(SRC.indexOf('<header class="v2-top detail">'), SRC.indexOf('<header class="v2-top">'));
    const d = detail.indexOf('<div class="defil">');
    expect(d).toBeGreaterThan(detail.indexOf('class="back"'));
    expect(detail.indexOf('class="aveclettres"')).toBeGreaterThan(d);
  });

  it('dans la liste, la grille est dans `.defil`, les onglets dehors', () => {
    const liste = SRC.slice(SRC.indexOf('<header class="v2-top">'), SRC.indexOf('</section>'));
    const d = liste.indexOf('<div class="defil">');
    expect(d).toBeGreaterThan(liste.indexOf('</nav>'));
    expect(liste.indexOf('<div class="grid">')).toBeGreaterThan(d);
  });
});

const push = vi.fn();
vi.mock('../stores/notifications', () => ({ notifications: { error: (m: string) => push(m) } }));

describe('#1070 — la recopie vers le service signale son échec', () => {
  beforeEach(() => push.mockReset());

  it('le motif du serveur atteint l’utilisateur', async () => {
    const { signalerRecopieManquee } = await import('../streamingFavorites');
    signalerRecopieManquee('qobuz', Object.assign(new Error('502 — Qobuz a refusé'), { status: 502 }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain('qobuz');
    expect(push.mock.calls[0][0]).toContain('Qobuz a refusé');
  });

  it('un 501 (service sans API de favoris) reste muet', async () => {
    const { signalerRecopieManquee } = await import('../streamingFavorites');
    signalerRecopieManquee('youtube', Object.assign(new Error('501'), { status: 501 }));
    expect(push).not.toHaveBeenCalled();
  });

  it('la recopie n’avale plus l’erreur', () => {
    const src = readFileSync('src/lib/streamingFavorites.ts', 'utf8');
    expect(src).not.toMatch(/(?:add|remove)StreamingFavorite\([^)]*\)\.catch\(\(\) => \{\}\)/);
    expect(src).toMatch(/recopie\.catch\(\(e\) => signalerRecopieManquee\(/);
  });
});
