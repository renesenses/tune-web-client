/**
 * « Créé un deuxième widget ! » (Bertrand, 06/09/2026), après la maquette
 * Figma de la carte de zone et sa consigne : « en ajoutant le nom de la zone !
 * et le spectrogramme ? Dans ce cas la card = 2 anciennes cards ».
 *
 * Le premier widget de zones — une bande de vignettes — RESTE. Le second prend
 * deux fois la place et montre ce que la vignette ne peut pas tenir : le
 * format, la fréquence, la profondeur, l'année, et où l'on en est dans le
 * morceau.
 *
 * ## Les deux pièges de ce widget
 *
 *  1. `charger` ne s'exécute QU'UNE FOIS. En y recopiant la position et le
 *     titre, la barre de progression resterait figée à l'instant du
 *     chargement et la carte annoncerait encore le morceau précédent. Il ne
 *     rend donc que des identifiants de zone, et le rendu relit le magasin.
 *  2. Le bouton de lecture doit passer par `playback-controls` : `api.pause()`
 *     seul ne met pas le magasin à jour, et une zone à l'arrêt demande de
 *     relancer avec le bon corps selon son origine.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Une zone telle que `/zones` la rend, mesurée sur le .18 le 06/09/2026. */
const zone = (o: any = {}) => ({
  id: 7, name: 'Salon', state: 'playing', position_ms: 42_000,
  current_track: {
    title: 'Out of Time', artist_name: 'Hugo Kant', album_id: 12,
    cover_path: '/c.jpg', format: 'flac', sample_rate: 44100, bit_depth: 16,
    year: 2017, duration_ms: 229_000, source: 'local',
  },
  ...o,
});

describe('le widget « En écoute »', () => {
  const w = widgetParId('zones-cartes')!;

  it('existe, avec sa forme et sa clé de titre', () => {
    expect(w).toBeTruthy();
    expect(w.forme).toBe('zones-cartes');
    expect(w.cleTitre).toBe('v2.home.wZonesCards');
  });

  it('ne remplace pas le premier : les deux coexistent', () => {
    expect(widgetParId('zones')?.forme).toBe('bande');
  });

  it("ne s'impose PAS sur l'accueil par défaut", () => {
    // « Personne ne doit voir son écran changer sans l'avoir demandé. » Le
    // widget a été demandé ; le changement d'accueil de tout le monde, non.
    expect(DISPOSITION_DEFAUT).not.toContain('zones-cartes');
    expect(WIDGETS.map((x) => x.id)).toContain('zones-cartes');
  });

  it('ne fait AUCUN appel réseau : tout vient de ctx.zones', () => {
    const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));
    const i = src.indexOf("id: 'zones-cartes'");
    const bloc = src.slice(i, src.indexOf("id: 'reprendre'", i));
    expect(bloc).toContain('ctx.zones');
    expect(bloc, 'un widget de plus ne doit pas coûter une requête de plus')
      .not.toMatch(/\bapi\.\w+\(/);
  });

  it('ne retient que les zones qui JOUENT ou sont en pause', async () => {
    // Sur le .18, une zone `stopped` porte un `current_track` à la position 0 :
    // la retenir remplirait le widget de cartes muettes.
    const els = await w.charger({
      profileId: 1, albums: [],
      zones: [
        zone(),
        zone({ id: 8, name: 'Cuisine', state: 'paused' }),
        zone({ id: 9, name: 'Cet ordinateur', state: 'stopped', position_ms: 0 }),
        zone({ id: 10, name: 'Vide', state: 'playing', current_track: null }),
      ],
    });
    expect(els.map((e) => e.zoneId)).toEqual([7, 8]);
  });

  it('ne rend que des identifiants de zone, pas un instantané figé', async () => {
    const els = await w.charger({ profileId: 1, albums: [], zones: [zone()] });
    expect(els[0].zoneId).toBe(7);
    expect(els[0].sous, 'le nom de la zone est le sous-titre').toBe('Salon');
    // Ce qui bouge — position, durée, format — ne doit PAS être recopié ici :
    // le rendu le relit dans le magasin vivant.
    expect(els[0]).not.toHaveProperty('position_ms');
    expect(els[0]).not.toHaveProperty('duration_ms');
  });

  it('une zone sans titre reste affichée : la carte annonce la ZONE', async () => {
    const els = await w.charger({
      profileId: 1, albums: [],
      zones: [zone({ current_track: { source: 'radio' } })],
    });
    expect(els).toHaveLength(1);
    expect(els[0].titre).toBe('—');
    expect(els[0].sous).toBe('Salon');
  });
});

describe('le rendu de la carte', () => {
  const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));

  it('relit le magasin VIVANT, pas l’élément chargé', () => {
    expect(src).toMatch(/const zoneVivante = \(id: number \| null \| undefined\) =>/);
    expect(src).toContain('$zones.find((z: any) => z.id === id)');
    expect(src).toContain('{@const z = zoneVivante(el.zoneId)}');
  });

  it('porte les deux ajouts demandés : nom de zone et spectrogramme', () => {
    expect(src).toContain('class="zzone"');
    expect(src).toMatch(/class="zviz"[\s\S]{0,200}<AudioVisualizer/);
  });

  it('la carte vaut DEUX vignettes, et la règle est écrite', () => {
    // 148 px × 2 + les 16 px de gouttière. En nombre magique, personne ne
    // saurait d'où il sort ni quoi changer si la vignette change de taille.
    expect(src).toContain('calc(148px * 2 + 16px)');
  });

  it('montre le format, la fréquence, la profondeur et l’année', () => {
    expect(src).toMatch(/String\(ct\.format\)\.toUpperCase\(\)/);
    expect(src).toContain('techPiste(ct)');
    expect(src).toMatch(/function techPiste[\s\S]{0,260}bit_depth/);
    expect(src).toContain('{ct.year}');
  });

  it('la barre de progression est BORNÉE', () => {
    // Une position au-delà de la durée arrive sur un flux dont la durée
    // annoncée est fausse : sans borne, la barre déborde de sa boîte.
    expect(src).toMatch(/Math\.max\(0, Math\.min\(100,/);
  });

  it('le bouton passe par le chemin PARTAGÉ de transport', () => {
    // `api.pause()` seul ne met pas le magasin à jour — le bouton garderait
    // l'icône pause et le clic suivant paraîtrait mort (vécu le 05/09).
    expect(src).toContain("import { togglePlayPause } from '../../lib/playback-controls'");
    expect(src).toMatch(/await togglePlayPause\(z, z\.current_track \?\? null, z\.state\)/);
    const i = src.indexOf('async function basculerZone');
    expect(src.slice(i, i + 300)).not.toMatch(/api\.(pause|resume)\(/);
  });
});
