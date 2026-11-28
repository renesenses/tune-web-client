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

describe('Nocturne — itération 8, lot B : choix d’interface et profils en lignes', () => {
  it('les deux blocs perdent leurs cartes sous Nocturne', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    const E = ':root[data-interface="nocturne"] .nocturne .noc-tune:not([data-vue="tess"])[data-vue="settings"]';
    expect(css).toContain(`${E} .liste-interfaces button {`);
    expect(css).toContain(`${E} .liste .profil {`);
  });
});

describe('Nocturne — itération 8, lot C : accueil, crédits, singles', async () => {
  const { creditsParRole, separerSingles } = await import('./proximiteNocturne');
  it('crédits regroupés par rôle, dans l’ordre d’apparition, sans doublon', () => {
    const g = creditsParRole([
      { nom: 'Ana', roles: ['Composer', 'Performer · piano'], artisteId: 4 },
      { nom: 'Bo', roles: ['Composer'], artisteId: null },
      { nom: 'Cy', roles: [], artisteId: null },
    ]);
    expect(g).toEqual([
      { role: 'Composer', noms: [{ nom: 'Ana', artisteId: 4 }, { nom: 'Bo', artisteId: null }] },
      { role: 'Performer · piano', noms: [{ nom: 'Ana', artisteId: 4 }] },
      { role: '', noms: [{ nom: 'Cy', artisteId: null }] },
    ]);
  });
  it('singles et EP : six titres au plus, nombre connu', () => {
    const l = [{ id: 1, track_count: 4 }, { id: 2, track_count: 12 }, { id: 3 }, { id: 4, track_count: 6 }] as any[];
    const r = separerSingles(l);
    expect(r.singles.map((a) => a.id)).toEqual([1, 4]);
    expect(r.albums.map((a) => a.id)).toEqual([2, 3]);
  });
  it('les écrans les montrent', () => {
    expect(lire(ICI, 'AccueilNocturne.svelte')).toContain('data-aide-accueil');
    expect(lire(ICI, 'AlbumNocturne.svelte')).toContain('data-credits-par-role');
    expect(lire(ICI, 'ArtisteNocturne.svelte')).toContain("cle: 'singles'");
  });
});

describe('Nocturne — itération 9, lot 1 : mosaïque des genres', async () => {
  const { tuilesDeGenres, albumsDuGenre, placesLarges, placesEtroites } = await import('./genresNocturne');
  const { genrePrincipal } = await import('./triNocturne');
  const al = (id: number, genre: string, cover: string | null = `c${id}`) => ({ id, title: `A${id}`, genre, cover_path: cover, added_at: id }) as any;
  it('du genre le plus fourni au moins fourni, avec une pochette', () => {
    const l = [al(1, 'Jazz'), al(2, 'Jazz'), al(3, 'Jazz', null), al(4, 'Rock'), al(5, 'Rock'), al(6, 'Folk')];
    const t = tuilesDeGenres(l);
    expect(t.map((x) => [x.genre, x.nombre])).toEqual([['Jazz', 3], ['Rock', 2], ['Folk', 1]]);
    expect(t[0].pochette?.cover_path).toBeTruthy();
  });
  it('aucune rangée trouée, quel que soit le nombre de genres (6 et 2 colonnes)', () => {
    for (let n = 1; n <= 30; n++) {
      const l = placesLarges(n);
      expect(l.length).toBe(n);
      const tete = n === 1 ? l[0].colonnes : l[0].colonnes + l[1].colonnes;
      expect(tete).toBe(6);
      const suite = l.slice(n === 1 ? 1 : 2);
      let somme = 0;
      for (const p of suite) { somme += p.colonnes; if (somme > 6) throw new Error(`débordement n=${n}`); if (somme === 6) somme = 0; }
      expect(somme, `n=${n}`).toBe(0);
      const e = placesEtroites(n);
      const totalE = e.slice(1).reduce((s, p) => s + p.colonnes, 0);
      expect(totalE % 2, `n=${n}`).toBe(0);
    }
  });
  it('les albums d’un genre, sans tenir compte de la casse', () => {
    const l = [al(1, 'Jazz; Soul'), al(2, 'jazz'), al(3, 'Rock')];
    expect(albumsDuGenre(l, 'JAZZ', genrePrincipal).map((a) => a.id)).toEqual([1, 2]);
  });
  it('le tiroir et la colonne Bibliothèque mènent à la mosaïque', () => {
    expect(lire(ICI, 'TiroirNocturne.svelte')).toContain("nocturne({ nom: 'genres' }, tr('nav.genres'), Music2)");
    expect(lire(ICI, 'BarreBibliothequeNocturne.svelte')).toContain("ouvrirRubrique({ nom: 'genres' })");
    expect(lire(ICI, 'ShellNocturne.svelte')).toContain('<GenresNocturne />');
  });
});

describe('Nocturne — itération 9, lot 2 : sous-menus du tiroir', () => {
  const tiroir = lire(ICI, 'TiroirNocturne.svelte');
  it('Collection, Technique et Système sous « Mes fichiers locaux », en descente', () => {
    expect(tiroir).toContain("sousMenu('l-collection'");
    expect(tiroir).toContain("sousMenu('l-technique'");
    expect(tiroir).toContain("sousMenu('l-systeme'");
    expect(tiroir).toContain('data-remonter-sous-menu');
  });
  it('l’accordéon s’active aussi quand le contenu dépasse la hauteur (mesure)', () => {
    expect(tiroir).toContain('accordeonMesure = corps.scrollHeight > corps.clientHeight + 1');
    expect(tiroir).toContain('const accordeon = $derived(accordeonToucher || accordeonMesure)');
  });
});

describe('Nocturne — itération 9, lot 3 : Mes fichiers locaux', async () => {
  const { ONGLETS_FICHIERS, estOngletFichiers } = await import('./fichiersNocturne');
  it('trois segments : Entretien, Albums, Doublons', () => {
    expect([...ONGLETS_FICHIERS]).toEqual(['entretien', 'albums', 'doublons']);
    expect(estOngletFichiers('albums')).toBe(true);
    expect(estOngletFichiers('autre')).toBe(false);
  });
  it('les gestes sont ceux de Tune, et « Ajouter de la musique » y mène', () => {
    const page = lire(ICI, 'FichiersLocauxNocturne.svelte');
    expect(page).toContain('api.getMusicDirectoryOrder()');
    expect(page).toContain('api.triggerScan()');
    expect(page).toContain("v2SettingsTarget.set({ tab: 'library' })");
    expect(lire(ICI, 'TiroirNocturne.svelte')).toContain("nocturne({ nom: 'fichiers' }, tr('nocturne.tiroir.ajouterMusique'), Plus)");
  });
});

describe('Nocturne — itération 9, lot 4 : pastille de source des playlists', () => {
  it('la pastille du service, déjà posée par Tune, passe en haut à gauche sous Nocturne', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    expect(css).toMatch(/\[data-vue="playlists"\] \.cover-badge \{\s*top: 8px;\s*bottom: auto;\s*left: 8px;/);
  });
});

describe('Nocturne — itération 10, lot 1 : colonne Bibliothèque au téléphone', () => {
  const shell = lire(ICI, 'ShellNocturne.svelte');
  it('dépliée, elle se superpose au contenu (qui garde toute sa largeur)', () => {
    expect(shell).toMatch(/@media \(max-width: 600px\) \{\s*\.noc-milieu\.avec-biblio \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\.noc-milieu\.avec-biblio > :global\(\.noc-biblio\) \{\s*position: absolute;/);
  });
  it('elle se referme au choix d’une entrée', () => {
    expect(shell).toContain('if (ecranPrecedent && cle !== ecranPrecedent && etroit && !biblioRepliee) biblioRepliee = true;');
  });
});

describe('Nocturne — itération 10, lot 2 : passe sur les écrans secondaires', () => {
  it('chiffres sans chasse fixe, blocs alignés sur la marge du titre', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    expect(css).toContain('--police-chiffres: var(--noc-police);');
    expect(css).toMatch(/\.pays-ecoute \{\s*padding-left: var\(--noc-marge-ecran-tune\);/);
    expect(css).toMatch(/\.v2-hist \.list \{\s*padding-left: var\(--noc-marge-ecran-tune\);/);
  });
  it('le Tableau de bord est atteignable (Système), la barre ne coupe plus le titre au téléphone', () => {
    expect(lire(ICI, 'TiroirNocturne.svelte')).toContain("tune('s-tableau', tr('nav.dashboard'), LayoutDashboard, 'tableaudebord')");
    expect(lire(ICI, 'BarreLectureNocturne.svelte')).toMatch(/@media \(max-width: 600px\) \{\s*\.noc-barre :global\(\.noc-qualite-reso\) \{ display: none; \}/);
  });
});

describe('Nocturne — itération 11 : proportions relevées sur les planches côte à côte', () => {
  it('artiste : styles dans la colonne de l’en-tête, playlists à la taille des pochettes', () => {
    const a = lire(ICI, 'ArtisteNocturne.svelte');
    expect(a.indexOf('data-genres-artiste')).toBeLessThan(a.indexOf('</header>'));
    expect(a).toContain('.noc-artiste-playlists ul { grid-template-columns: repeat(auto-fill, var(--noc-tuile)); }');
  });
  it('genres : rangées qui suivent la largeur, nom plus grand sur les grandes tuiles', () => {
    expect(lire(STYLES, 'jetons-nocturne.css')).toContain('--noc-rangee-mosaique: clamp(150px, 7.5vw, 200px);');
    expect(lire(ICI, 'GenresNocturne.svelte')).toContain('* (1 + (var(--lig, 1) - 1) * 0.35)');
  });
  it('panneaux à la proportion de la référence, cartes du tableau de bord alignées', () => {
    const j = lire(STYLES, 'jetons-nocturne.css');
    expect(j).toContain('--noc-largeur-reglages: 480px;');
    expect(j).toContain('--noc-largeur-recherche: 420px;');
    expect(sansCommentaires(lire(STYLES, 'ecrans-tune.css'))).toMatch(/\.mosaique:has\(> \.bloc\) \{\s*padding-left: var\(--noc-marge-ecran-tune\);/);
  });
});

describe('Nocturne — itération 12 : accessibilité', () => {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const jetons = lire(STYLES, 'jetons-nocturne.css');
  const clair = jetons.slice(jetons.indexOf(':root[data-interface="nocturne"][data-nocturne-theme="clair"] {'));
  const valeur = (bloc: string, nom: string) => bloc.match(new RegExp(`--noc-${nom}: (#[0-9a-f]{6});`))![1];
  it.each([
    ['sombre', jetons],
    ['clair', clair],
  ])('textes à 4,5:1 au moins sur le fond, les surfaces et la barre (%s)', (_theme, bloc) => {
    for (const texte of ['texte', 'texte-2', 'texte-3', 'texte-4', 'ambre', 'danger']) {
      for (const fond of ['fond', 'fond-barre', 'surface', 'surface-2']) {
        expect(contraste(valeur(bloc, texte), valeur(bloc, fond)), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('un anneau de focus explicite dans toute la coquille', () => {
    expect(lire(ICI, 'ShellNocturne.svelte')).toContain('.nocturne :global(:focus-visible) { outline: 2px solid var(--noc-focus); outline-offset: 2px; }');
  });
});

describe('Nocturne — itération 12 : contrastes et cibles', () => {
  it('l’initiale d’un profil prend le blanc ou l’encre selon sa pastille', async () => {
    const { texteSurFond, contraste } = await import('./contrasteNocturne');
    // Claires ou foncées : 4,5:1. Les teintes moyennes (indigo, turquoise)
    // n'atteignent 4,5 ni en blanc ni en encre ; l'initiale y double le nom
    // affiché à côté et reste décorative (aria-hidden).
    for (const fond of ['#c7a755', '#f59e0b', '#e11d48', '#ffffff', '#000000']) {
      expect(contraste(texteSurFond(fond), fond), fond).toBeGreaterThanOrEqual(4.5);
    }
    for (const fond of ['#6366f1', '#0f8a72']) expect(contraste(texteSurFond(fond), fond), fond).toBeGreaterThan(4.3);
    expect(lire(ICI, 'TiroirNocturne.svelte')).toContain('<span aria-hidden="true" class="noc-tiroir-avatar" style:background={pastilleProfil.fond} style:color={texteSurFond(pastilleProfil.fond)}>');
    expect(texteSurFond(null)).toBe('#ffffff');
  });
  it('au doigt, les commandes de la coquille et des écrans de Tune font 44 px', () => {
    const j = lire(STYLES, 'jetons-nocturne.css');
    expect(j).toMatch(/:root \.nocturne :is\(\.noc-entete-bouton, \.noc-t, /);
    expect(sansCommentaires(lire(STYLES, 'ecrans-tune.css'))).toMatch(/@media \(pointer: coarse\) \{\s*:root\[data-interface="nocturne"\] \.nocturne \.noc-tune:not\(\[data-vue="tess"\]\) :is\(button, \[role="tab"\], \[role="option"\], \[role="menuitem"\], select, a\[href\], input/);
  });
  it('succès et alerte de Tune suivent des teintes lisibles', () => {
    const css = lire(STYLES, 'ecrans-tune.css');
    expect(css).toContain('--tune-success: var(--noc-succes);');
    expect(css).toContain('--tune-warning: var(--noc-alerte);');
  });
});

describe('Nocturne — itération 13 : liens voisins des cartes', () => {
  it('titre et artiste gardent 24 px de haut chacun, sans chevauchement', () => {
    const carte = lire(ICI, 'CarteAlbumNocturne.svelte');
    expect(carte).toMatch(/\.noc-carte-titre \{\s*min-height: var\(--noc-cible-lien\);/);
    expect(carte).toMatch(/\.noc-carte-artiste \{\s*min-height: var\(--noc-cible-lien\);\s*line-height: var\(--noc-cible-lien\);\s*margin-top: 0;/);
    expect(lire(STYLES, 'jetons-nocturne.css')).toContain('--noc-cible-lien: 24px;');
  });
});

describe('Nocturne — itération 13 : téléphone', () => {
  it('l’en-tête resserre ses écarts, la barre cède la version, la lecture tient dans sa marge', () => {
    expect(lire(ICI, 'EnteteNocturne.svelte')).toMatch(/@media \(max-width: 600px\) \{\s*\.noc-entete, \.noc-entete-droite \{ gap: 2px; \}/);
    expect(lire(ICI, 'BarreLectureNocturne.svelte')).toMatch(/\.noc-version \{ display: none; \}\s*\.noc-barre-transport \{ justify-content: flex-start; \}/);
    const lecture = lire(ICI, 'LectureNocturne.svelte');
    expect(lecture).toContain('.noc-lecture-infos { align-self: stretch; width: 100%; }');
    expect(lecture).toContain('.noc-lecture-rail { height: var(--noc-cible-tactile); margin-block: -15px; }');
  });
});

describe('Nocturne — itération 15 : derniers écarts', () => {
  const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
  it('Réglages › Profils : initiale à l’encre sur les pastilles claires de la palette', () => {
    for (const c of ['f59e0b', '10b981', 'ec4899', '8b5cf6', '14b8a6', 'ef4444', '3b82f6']) {
      expect(css).toContain(`button.principal > span.rond[style*="${c}" i]`);
    }
    expect(css).not.toContain('span.rond[style*="6366f1" i]');
  });
  it('Zones : colonne centrée sur grand écran', () => {
    expect(css).toMatch(/\.v2-zones \{\s*padding-inline: max\(0px, calc\(\(100% - var\(--noc-largeur-colonne-zones\)\) \/ 2\)\);/);
  });
});

describe('Nocturne — itération 15 : tablette au doigt', () => {
  it('progression de la barre, zone, Focus et Filtrer à 44 px', () => {
    expect(lire(ICI, 'BarreLectureNocturne.svelte')).toContain('.noc-barre-progression { height: var(--noc-cible-tactile); margin-block: -16px; }');
    expect(lire(STYLES, 'jetons-nocturne.css')).toContain('.noc-zone, .noc-focus, .noc-filtrer) { min-height: var(--noc-cible-tactile); }');
  });
});
