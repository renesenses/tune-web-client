// Nocturne, itération 5 (27/11/2026) — toute l'app suit le thème, profils dans
// le tiroir, cibles tactiles, icônes de zone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attributsRacine, poserInterfaceSurRacine, iconesDeZoneActives } from '../../lib/interfaceSalon';

const ICI = __dirname;
const STYLES = join(ICI, '..', '..', 'styles', 'nocturne');
const lire = (...p: string[]) => readFileSync(join(...p), 'utf8');
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Les sélecteurs d'une liste, coupés aux virgules hors parenthèses. */
function auPremierNiveau(liste: string): string[] {
  const parts: string[] = [];
  let prof = 0, debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === ',' && prof === 0) { parts.push(liste.slice(debut, i)); debut = i + 1; }
  }
  parts.push(liste.slice(debut));
  return parts;
}

describe('Nocturne — interface posée sur <html>', () => {
  function racine() {
    const a = new Map<string, string>();
    return {
      a,
      setAttribute: (k: string, v: string) => void a.set(k, v),
      removeAttribute: (k: string) => void a.delete(k),
    } as unknown as HTMLElement & { a: Map<string, string> };
  }
  it('l’interface et son thème (sombre par défaut)', () => {
    expect(attributsRacine('nocturne', 'clair')).toEqual({ interface: 'nocturne', theme: 'clair' });
    expect(attributsRacine('nocturne', undefined)).toEqual({ interface: 'nocturne', theme: 'sombre' });
  });
  it('pose data-nocturne-theme, jamais data-salon-theme, et retire tout au retour', () => {
    const r = racine();
    poserInterfaceSurRacine('roon-like', 'clair', r);
    poserInterfaceSurRacine('nocturne', 'sombre', r);
    expect(r.a.get('data-interface')).toBe('nocturne');
    expect(r.a.get('data-nocturne-theme')).toBe('sombre');
    expect(r.a.has('data-salon-theme')).toBe(false);
    poserInterfaceSurRacine('actuelle', null, r);
    expect(r.a.size).toBe(0);
  });
  it('ShellV2 pose Nocturne avec le thème partagé', () => {
    const shell = lire(ICI, '..', 'v2', 'ShellV2.svelte');
    expect(shell).toContain('poserInterfaceSurRacine($preferences.interfaceStyle, $themeNocturne)');
  });
});

describe('Nocturne — couche commune des écrans de Tune', () => {
  const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
  const selecteurs = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith('@'))
    .flatMap((s) => auPremierNiveau(s).map((x) => x.trim()));
  it('chaque règle est limitée à Nocturne', () => {
    expect(selecteurs.length).toBeGreaterThan(30);
    for (const s of selecteurs) expect(s, s).toMatch(/^:root(\[data-v2-theme\])?\[data-interface="nocturne"\]/);
  });
  it('TESS garde sa structure : exclu de chaque règle de grammaire', () => {
    for (const s of selecteurs.filter((x) => x.includes('.noc-tune') && !x.includes('scrollbar') && !/\.noc-tune\s*$/.test(x))) {
      expect(s, s).toContain('.noc-tune:not([data-vue="tess"])');
    }
    for (const s of selecteurs.filter((x) => x.includes('[data-nocturne-theme] :is(.v2-shell, .tune-v2)') && !x.includes('.toast') && !x.includes('.modal-backdrop') && !x.includes('.dialog-btn.primary.danger'))) {
      expect(s, s).toContain('[data-vue="tess"] *');
    }
  });
  it('aucune couleur, taille, rayon ni ombre en dur : tout vient des jetons', () => {
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
    expect(css.match(/rgba?\(/g)).toBeNull();
    expect(css.match(/font-size:\s*(?:calc\()?\d/g)).toBeNull();
    expect(css.match(/border-radius:\s*\d+px/g)).toBeNull();
    expect(css.match(/box-shadow:\s*\d/g)).toBeNull();
  });
  it('la coquille la charge et nomme la vue montée (pour exclure TESS)', () => {
    const shell = lire(ICI, 'ShellNocturne.svelte');
    expect(shell).toContain("styles/nocturne/ecrans-tune.css");
    expect(shell).toContain('data-vue={$activeView}');
  });
  it('les jetons valent aussi sur <html>, en sombre et en clair', () => {
    const jetons = lire(STYLES, 'jetons-nocturne.css');
    expect(jetons).toContain(':root[data-interface="nocturne"] {');
    expect(jetons).toContain(':root[data-interface="nocturne"][data-nocturne-theme="clair"] {');
  });
});

describe('Nocturne — tiroir', () => {
  const tiroir = lire(ICI, 'TiroirNocturne.svelte');
  it('change de profil par la mécanique existante (Réglages › Profils)', () => {
    expect(tiroir).toContain("from '../../lib/basculeDeProfil'");
    expect(tiroir).toContain('retenirCoteServeur(id)');
    expect(tiroir).toContain('basculerVers(get(currentProfileId), id)');
    expect(tiroir).toContain('$visibleProfiles');
  });
  it('« Garder le panneau ouvert » n’apparaît pas au téléphone', () => {
    expect(tiroir).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.noc-tiroir-epingle \{ display: none; \}/);
    expect(lire(ICI, 'ShellNocturne.svelte')).toContain('const epingleEffectif = $derived(tiroirEpingle && !etroit)');
  });
  it('rubriques à 44 px au moins au téléphone, après les paliers de hauteur', () => {
    const jetons = sansCommentaires(lire(STYLES, 'jetons-nocturne.css'));
    const telephone = jetons.lastIndexOf('@media (max-width: 600px)');
    expect(telephone).toBeGreaterThan(jetons.lastIndexOf('@media (max-height'));
    expect(jetons.slice(telephone)).toMatch(/--noc-hauteur-rubrique: 44px/);
  });
});

describe('Nocturne — icônes de zone de Rémi', () => {
  it('actives dans Nocturne (écran Zones), pas dans l’interface actuelle', () => {
    expect(iconesDeZoneActives('nocturne')).toBe(true);
    expect(iconesDeZoneActives('roon-like')).toBe(true);
    expect(iconesDeZoneActives('actuelle')).toBe(false);
  });
  it('le sélecteur de zone de la barre les montre', () => {
    const barre = lire(ICI, 'BarreLectureNocturne.svelte');
    expect(barre).toContain("import IconeZone from '../partages/IconeZone.svelte'");
    expect(barre.match(/<IconeZone zone=/g)?.length).toBe(2);
  });
});

describe('Nocturne — retours du 27/11 sur Réglages au téléphone', () => {
  const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
  it('la pile de bandeaux se pose au-dessus de la barre de lecture', () => {
    expect(css).toMatch(/\.toast-pile \{[^}]*bottom: calc\(var\(--noc-hauteur-barre\) \+ var\(--noc-ecart-bandeau\)\)/);
  });
  it('au téléphone, le nom du profil garde sa ligne (actions dessous)', () => {
    const tel = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
    expect(tel).toMatch(/\.liste > \.profil > \.principal \{\s*flex: 1 0 100%;/);
  });
  it('le bouton « Remonter en haut » a sa réserve en bas, et se retire au téléphone', () => {
    expect(css).toMatch(/:is\(\.pane, \.scroll\) \{\s*padding-bottom: var\(--noc-reserve-remonter\);/);
    const tel = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
    expect(tel).toMatch(/\[data-remonter-en-haut\] \{\s*display: none;/);
  });
});

describe('Nocturne — sélecteur de zone rangé par rubrique', async () => {
  const { zonesParRubrique, rubriqueDeZone } = await import('./zonesNocturne');
  it('sorties locales, lecteurs réseau, autres ; rubriques vides omises', () => {
    const z = [{ output_type: 'dlna' }, { output_type: 'local' }, { output_type: 'browser' }, { output_type: 'airplay' }] as any[];
    expect(zonesParRubrique(z).map((g) => [g.rubrique, g.zones.length])).toEqual([['locales', 1], ['reseau', 2], ['autres', 1]]);
    expect(zonesParRubrique([{ output_type: 'local' }] as any[]).map((g) => g.rubrique)).toEqual(['locales']);
    expect(rubriqueDeZone({ output_type: null } as any)).toBe('autres');
  });
});

describe('Nocturne — menu du profil', () => {
  it('le tiroir monte le menu de l’avatar de la coquille v2, tel quel', () => {
    const tiroir = lire(ICI, 'TiroirNocturne.svelte');
    expect(tiroir).toContain("import AvatarMenu from '../v2/AvatarMenu.svelte'");
    expect(tiroir).toMatch(/\{#if integree\}<span class="noc-tiroir-menu-profil"[^>]*><AvatarMenu \/><\/span>\{\/if\}/);
  });
  it('itération 6 : les palettes v2 retirées par la condition d’AvatarMenu (plus de CSS), la langue en un geste', () => {
    const menu = lire(ICI, '..', 'v2', 'AvatarMenu.svelte');
    expect(menu).toContain('{#if !salonActif($preferences.interfaceStyle) && !nocturneActif($preferences.interfaceStyle)}');
    expect(menu).toContain('data-avatar-langue');
    expect(menu).toMatch(/function choisirLangue\(l: Locale\) \{\s*preferences\.update\(\(pr\) => \(\{ \.\.\.pr, language: l, langueAuto: null \}\)\);\s*locale\.set\(l\);/);
    expect(lire(ICI, 'TiroirNocturne.svelte')).not.toContain('.avmenu .themes');
  });
});

describe('Nocturne — itération 6, lot 1', async () => {
  const { liaisonApres } = await import('./liaisonNocturne');
  it('la liaison suit les événements du client WebSocket', () => {
    expect(liaisonApres('inconnue', '_connected')).toBe('reliee');
    expect(liaisonApres('reliee', '_disconnected')).toBe('coupee');
    expect(liaisonApres('coupee', '_polling_started')).toBe('reliee');
    expect(liaisonApres('coupee', 'zone.updated')).toBe('coupee');
  });
  it('bandeau de reconnexion en haut au centre, sous l’en-tête', () => {
    const shell = lire(ICI, 'ShellNocturne.svelte');
    expect(shell).toContain('data-bandeau-liaison');
    expect(shell).toMatch(/\.noc-liaison \{[^}]*top: calc\(var\(--noc-hauteur-entete\) \+ var\(--noc-ecart-bandeau\)\);[^}]*left: 50%;/);
  });
  it('sélecteur de zone présent au téléphone (icône, 44 px) et segment multi-zone vers la Lecture groupée', () => {
    const barre = lire(ICI, 'BarreLectureNocturne.svelte');
    const etroit = barre.slice(barre.indexOf('@media (max-width: 900px)'));
    expect(etroit).not.toMatch(/\.noc-zone-ancre \{ display: none/);
    expect(etroit).toContain('min-height: var(--noc-cible-tactile)');
    expect(barre).toContain('<ZoneConfigModal');
    expect(barre).toContain('section="groupe"');
  });
  it('segment de tri actif doré', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    expect(css).toMatch(/:is\(\.segment, \.seg, \.seg4\) > button:is\(\.on[^{]*\{\s*background: var\(--noc-ambre\);/);
  });
});

describe('Nocturne — itération 6, lot 2 : voisinage album et artiste', async () => {
  const { albumsDuMemeArtiste, albumsProches, musiciensDesCredits, genresDeLArtiste } = await import('./proximiteNocturne');
  const al = (id: number, o: Record<string, unknown> = {}) => ({ id, title: `A${id}`, ...o }) as any;
  const l = [
    al(1, { artist_id: 7, genre: 'Jazz', year: 1960 }),
    al(2, { artist_id: 7, genre: 'Jazz', year: 1965 }),
    al(3, { artist_id: 8, genre: 'Jazz', year: 1962 }),
    al(4, { artist_id: 9, genre: 'Jazz; Soul', year: 1990 }),
    al(5, { artist_id: 9, genre: 'Rock', year: 1961 }),
  ];
  it('du même artiste : sans l’album lui-même, du plus récent au plus ancien', () => {
    expect(albumsDuMemeArtiste(l, l[0]).map((a) => a.id)).toEqual([2]);
    expect(albumsDuMemeArtiste(l, { id: 1, artist_id: null } as any)).toEqual([]);
  });
  it('albums proches : même genre principal, autres artistes, année la plus proche d’abord', () => {
    expect(albumsProches(l, l[0]).map((a) => a.id)).toEqual([3, 4]);
  });
  it('musiciens : une entrée par personne, rôles fusionnés, lien d’artiste gardé', () => {
    const m = musiciensDesCredits([
      { artist_name: 'Ana', role: 'Performer', instrument: 'piano', artist_id: null },
      { artist_name: 'Ana', role: 'Composer', artist_id: 12 },
      { artist_name: ' ', role: 'Producer' },
    ]);
    expect(m).toEqual([{ nom: 'Ana', roles: ['Performer · piano', 'Composer'], artisteId: 12 }]);
  });
  it('genres d’un artiste : du plus fréquent au plus rare', () => {
    expect(genresDeLArtiste(l)).toEqual(['Jazz', 'Rock']);
  });
  it('les pages les affichent', () => {
    const album = lire(ICI, 'AlbumNocturne.svelte');
    expect(album).toContain("$t('nocturne.album.proches' as any)");
    expect(album).toContain('data-musiciens');
    const artiste = lire(ICI, 'ArtisteNocturne.svelte');
    expect(artiste).toContain('data-genres-artiste');
    expect(artiste).toContain('data-populaires');
  });
});

describe('Nocturne — itération 6, lot 3 : panneaux latéraux', async () => {
  const nav = await import('./navigationNocturne');
  const { filtrerResultats } = await import('./rechercheNocturne');
  const { get } = await import('svelte/store');
  it('Réglages s’ouvrent en panneau PAR-DESSUS l’écran courant, qui reste dessiné derrière', () => {
    nav.reinitialiser({ nom: 'album', id: 3 });
    nav.ouvrirTune('settings');
    expect(get(nav.ecranNocturne)).toEqual({ nom: 'tune', vue: 'settings' });
    expect(get(nav.ecranDeFond)).toEqual({ nom: 'album', id: 3 });
    nav.ouvrirTune('settings', 'audio');
    expect(get(nav.ecranNocturne)).toEqual({ nom: 'tune', vue: 'settings', onglet: 'audio' });
    nav.fermerPanneau();
    expect(get(nav.ecranNocturne)).toEqual({ nom: 'album', id: 3 });
  });
  it('derrière un panneau ouvert depuis un écran de Tune : l’écran Nocturne d’avant, sinon l’accueil', () => {
    expect(nav.ecranDeFondDe([{ nom: 'accueil' }, { nom: 'tune', vue: 'zonemanager' }, { nom: 'tune', vue: 'settings' }])).toEqual({ nom: 'accueil' });
    expect(nav.ecranDeFondDe([{ nom: 'tune', vue: 'settings' }])).toEqual({ nom: 'accueil' });
    nav.ouvrirTune('zonemanager');
    expect(get(nav.ecranDeFond)).toEqual({ nom: 'tune', vue: 'zonemanager' });
  });
  it('filtres de la recherche', () => {
    const r = { albums: [{ id: 1 }], artists: [{ id: 2 }], tracks: [{ id: 3 }] } as any;
    expect(filtrerResultats(r, 'albums')).toEqual({ albums: [{ id: 1 }], artists: [], tracks: [] });
    expect(filtrerResultats(r, 'tout')).toEqual(r);
    expect(filtrerResultats(null, 'tout')).toEqual({ albums: [], artists: [], tracks: [] });
  });
  it('la coquille monte le panneau des Réglages et celui de la recherche', () => {
    const shell = lire(ICI, 'ShellNocturne.svelte');
    expect(shell).toContain('data-panneau-reglages');
    expect(shell).toContain('<PanneauRechercheNocturne');
    expect(lire(ICI, 'EnteteNocturne.svelte')).toContain('data-recherche-entete');
  });
});

describe('Nocturne — itération 7, lot A', async () => {
  const { reconnaissanceVocale } = await import('./rechercheNocturne');
  it('Réglages : sous Nocturne, Sombre / Clair à la place des palettes v2', () => {
    const reglages = lire(ICI, '..', 'v2', 'SettingsV2.svelte');
    expect(reglages).toContain('{#if nocturneActif($preferences.interfaceStyle)}');
    expect(reglages).toContain('data-reglage="theme-nocturne"');
    expect(reglages).toContain('onclick={() => choisirThemeNocturne(th)}');
  });
  it('micro : seulement si le navigateur sait dicter', () => {
    function SR() {}
    expect(reconnaissanceVocale({})).toBeNull();
    expect(reconnaissanceVocale({ webkitSpeechRecognition: SR })).toBe(SR);
    expect(reconnaissanceVocale(undefined)).toBeNull();
    expect(lire(ICI, 'PanneauRechercheNocturne.svelte')).toMatch(/\{#if Dictee\}[\s\S]*data-micro-recherche/);
  });
  it('au doigt : accordéon du tiroir et cibles de 44 px', () => {
    const tiroir = lire(ICI, 'TiroirNocturne.svelte');
    expect(tiroir).toContain("'(pointer: coarse) and (max-height: 1100px)'");
    expect(tiroir).toContain('{#if !accordeon || sectionOuverte === s.id}');
    const jetons = sansCommentaires(lire(STYLES, 'jetons-nocturne.css'));
    expect(jetons).toMatch(/@media \(pointer: coarse\) \{\s*\.nocturne \{\s*--noc-hauteur-rubrique: 44px;/);
  });
});

describe('Nocturne — itération 7, lot B : faits rapides, playlists, proches', async () => {
  const f = await import('./faitsAlbumNocturne');
  const pl = await import('./playlistsArtisteNocturne');
  it('écoutes : somme des comptes, rien si aucun titre ne le porte', () => {
    expect(f.ecoutesDesTitres([{ play_count: 2 }, { play_count: 0 }, {}])).toBe(2);
    expect(f.ecoutesDesTitres([{}, {}])).toBeNull();
  });
  it('dernière écoute : la plus récente', () => {
    expect(f.derniereEcoute([{ last_played_at: '2026-01-02T10:00:00Z' }, { last_played_at: '2026-03-01T10:00:00Z' }, {}])).toBe('2026-03-01T10:00:00Z');
  });
  it('première écoute : exacte si l’historique est complet, « au plus tard » sinon, rien si l’album n’y est pas', () => {
    const items = [{ album_id: 3, played_at: '2026-02-01T00:00:00Z' }, { album_id: 3, played_at: '2025-12-24T00:00:00Z' }, { album_id: 4, played_at: '2024-01-01T00:00:00Z' }];
    expect(f.premiereEcoute({ items, total: 3 }, 3)).toEqual({ date: '2025-12-24T00:00:00Z', auPlusTard: false });
    expect(f.premiereEcoute({ items, total: 5000 }, 3)).toEqual({ date: '2025-12-24T00:00:00Z', auPlusTard: true });
    expect(f.premiereEcoute({ items }, 3)).toEqual({ date: '2025-12-24T00:00:00Z', auPlusTard: true });
    expect(f.premiereEcoute({ items, total: 5000 }, 9)).toBeNull();
  });
  it('résolution lisible', () => {
    expect(f.resolution({ sample_rate: 96000, bit_depth: 24, format: 'flac' })).toBe('24 bits / 96 kHz');
    expect(f.resolution({ sample_rate: 44100, bit_depth: 16 })).toBe('16 bits / 44.1 kHz');
    expect(f.resolution({ sample_rate: 2822400, format: 'dsf' })).toBe('DSD64');
    expect(f.resolution({ format: 'mp3' })).toBe('');
  });
  it('playlists de l’artiste : les vôtres et celles de Tune qui le contiennent', async () => {
    pl.viderCachePlaylists();
    const r = await pl.playlistsDeLArtiste({ id: 7, nom: 'Ana' }, {
      playlists: async () => [{ id: 1, name: 'Soir' }, { id: 2, name: 'Matin' }],
      pistesPlaylist: async (id) => (id === 1 ? [{ id: 10, artist_id: 7 }, { id: 11, artist_id: 8 }] : [{ id: 12, artist_id: 8 }]) as any,
      intelligentes: async () => [{ id: 5, name: 'Hi-Res' }],
      pistesIntelligente: async () => [{ id: 13, artist_id: null, artist_name: 'ana' }, { id: 14, artist_id: 7 }] as any,
    });
    expect(r.map((x) => [x.nom, x.origine, x.deLArtiste, x.pistes])).toEqual([['Hi-Res', 'tune', 2, [13, 14]], ['Soir', 'perso', 1, [10, 11]]]);
  });
  it('une playlist illisible n’empêche pas les autres', async () => {
    pl.viderCachePlaylists();
    const r = await pl.playlistsDeLArtiste({ id: 7, nom: 'Ana' }, {
      playlists: async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      pistesPlaylist: async (id) => { if (id === 1) throw new Error('x'); return [{ id: 3, artist_id: 7 }] as any; },
      intelligentes: async () => { throw new Error('y'); },
      pistesIntelligente: async () => [],
    });
    expect(r.map((x) => x.nom)).toEqual(['B']);
  });
  it('les pages les montrent, « Si vous aimez » seulement si Tune connaît des proches', () => {
    expect(lire(ICI, 'AlbumNocturne.svelte')).toContain('data-faits-rapides');
    const artiste = lire(ICI, 'ArtisteNocturne.svelte');
    expect(artiste).toContain('{#if similaires.length}');
    expect(artiste).toContain('data-playlists-artiste');
  });
});

describe('Nocturne — itération 7, lot C : Réglages en lignes', () => {
  it('cartes défaites, lignes séparées, limité aux Réglages montés dans Nocturne', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    const E = ':root[data-interface="nocturne"] .nocturne .noc-tune:not([data-vue="tess"])[data-vue="settings"]';
    expect(css).toContain(`${E} .card {`);
    expect(css).toMatch(new RegExp(`${E.replace(/[[\]().:"=-]/g, '\\$&')} \\.row \\{[^}]*border-bottom: 1px solid var\\(--noc-ligne\\);`));
  });
});

describe('Nocturne — itération 8, lot A : playlists sans rafale', async () => {
  const pl = await import('./playlistsArtisteNocturne');
  it('deux lectures à la fois au plus, et une playlist lue une seule fois par session', async () => {
    pl.viderCachePlaylists();
    let enCours = 0, pic = 0, lectures = 0;
    const lire = async (id: number) => {
      enCours++; lectures++; pic = Math.max(pic, enCours);
      await new Promise((r) => setTimeout(r, 5));
      enCours--;
      return [{ id: id * 10, artist_id: id % 2 ? 7 : 8 }] as any;
    };
    const sources = {
      playlists: async () => Array.from({ length: 9 }, (_, k) => ({ id: k + 1, name: `P${k + 1}` })),
      pistesPlaylist: lire,
      intelligentes: async () => [],
      pistesIntelligente: async () => [],
    };
    const a = await pl.playlistsDeLArtiste({ id: 7, nom: 'Ana' }, sources);
    expect(pic).toBeLessThanOrEqual(pl.LECTURES_EN_PARALLELE);
    expect(a.length).toBe(5);
    await pl.playlistsDeLArtiste({ id: 7, nom: 'Ana' }, sources);
    await pl.playlistsDeLArtiste({ id: 8, nom: 'Bo' }, sources);
    expect(lectures).toBe(9);
  });
  it('la page ne calcule qu’à la vue de la section', () => {
    const artiste = lire(ICI, 'ArtisteNocturne.svelte');
    expect(artiste).toContain('new IntersectionObserver(');
    expect(artiste).toContain('bind:this={sentinellePlaylists}');
  });
});
