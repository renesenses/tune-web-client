/**
 * Les retours d'Alex Campbell du 08/09/2026, gardés un par un.
 *
 * Quatre défauts, tous mesurés avant d'être corrigés :
 *
 *  1. le badge de qualité sur la pochette est redondant et illisible ;
 *  5. la file d'attente ne se ferme pas au clic à côté, et demande deux clics ;
 *  6. le menu Profil recouvre la file dans une webapp Safari ;
 *  7. « Reprendre l'écoute » mélange albums et morceaux sans le dire.
 *
 * (2, 3 et 8 — le français en dur, la zone « sur cet ordinateur » et le vidage
 * de l'historique — ont leurs propres gardes : `check-francais-v2`,
 * `zoneNavigateurUnique`, et le bouton de `HistoriqueV2`.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estUnePiste, sousTitreReprise, reprisesUtiles } from '../reprendreEcoute';
import { nextQueueSheetState } from '../stores/queue';

const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const np = lire('components/NowPlaying.svelte');
/** Le code seul : une garde qui lit les COMMENTAIRES se déclenche sur le récit
 *  du correctif au lieu du correctif. */
const npCode = np.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const shell = lire('components/v2/ShellV2.svelte');
const widgets = lire('lib/accueilWidgets.ts');

/** Les lignes telles que `GET /home/continue-listening` les rend sur le .18. */
const MESURE = [
  { context_type: 'track', album_id: null, title: 'VHOLUME (Original Soundtrack)', album_title: null, artist_name: '1000 Eyes' },
  { context_type: 'track', album_id: 934, title: 'Extreme Ways', album_title: '18', artist_name: 'Moby' },
  { context_type: 'album', album_id: 232, title: 'Jamais Content', album_title: 'Jamais Content', artist_name: 'Alain Souchon', listened_tracks: 1, track_count: 10, progress_percent: 10 },
  { context_type: 'track', album_id: 232, title: 'Stella by Starlight', album_title: 'Jamais Content', artist_name: 'Alain Souchon' },
  { context_type: 'album', album_id: 341, title: 'The Art of Three', album_title: 'The Art of Three', artist_name: 'Billy Cobham' },
];

describe('7. « Reprendre l’écoute » dit ce qu’il propose de reprendre', () => {
  it('le serveur étiquette, et on lit l’étiquette', () => {
    expect(estUnePiste(MESURE[1])).toBe(true);
    expect(estUnePiste(MESURE[2])).toBe(false);
    // Une ligne sans étiquette n'est PAS déclarée piste : on ne devine pas.
    expect(estUnePiste({})).toBe(false);
  });

  it('🔴 une ligne album porte l’artiste, une ligne piste porte « artiste · album »', () => {
    expect(sousTitreReprise(MESURE[4])).toBe('Billy Cobham');
    expect(sousTitreReprise(MESURE[1])).toBe('Moby · 18');
  });

  it('la progression paraît quand le serveur la chiffre, et jamais à moitié', () => {
    expect(sousTitreReprise(MESURE[2])).toBe('Alain Souchon · 1/10');
    expect(sousTitreReprise({ context_type: 'album', artist_name: 'X', listened_tracks: 3 })).toBe('X');
    expect(sousTitreReprise({ context_type: 'album', artist_name: 'X', track_count: 0, listened_tracks: 0 })).toBe('X');
  });

  it('une piste sans album ne fabrique pas un séparateur vide', () => {
    expect(sousTitreReprise(MESURE[0])).toBe('1000 Eyes');
  });

  it('🔴 la piste dont l’album est DÉJÀ proposé disparaît', () => {
    // Mesuré : 2 des 20 lignes du .18 étaient dans ce cas.
    const restant = reprisesUtiles(MESURE);
    expect(restant.map((l) => l.title)).toEqual([
      'VHOLUME (Original Soundtrack)', 'Extreme Ways', 'Jamais Content', 'The Art of Three',
    ]);
  });

  it('l’ordre du serveur est conservé — c’est lui qui sait ce qui est récent', () => {
    const ordre = reprisesUtiles(MESURE).map((l) => l.title);
    const attendu = MESURE.map((l) => l.title).filter((t) => ordre.includes(t));
    expect(ordre).toEqual(attendu);
  });

  it('le widget d’accueil APPELLE la règle', () => {
    expect(widgets).toContain("from './reprendreEcoute'");
    expect(widgets).toContain('reprisesUtiles(liste(await api.getContinueListening(LIMITE)))');
    expect(widgets).toContain('sousTitreReprise(o)');
  });
});

describe('5. la file d’attente : un appui pour ouvrir, un pour fermer', () => {
  it('🔴 deux crans, quelle que soit la largeur', () => {
    for (const large of [true, false]) {
      expect(nextQueueSheetState('collapsed', large)).toBe('expanded');
      expect(nextQueueSheetState('expanded', large)).toBe('collapsed');
      expect(nextQueueSheetState('peek', large)).toBe('collapsed');
    }
  });

  it('🔴 l’état ouvert porte le voile qui referme au clic à côté', () => {
    // Les deux moitiés du retour n'en font qu'une : le premier appui donnait
    // `peek`, l'état SANS voile. Un appui donne maintenant `expanded`.
    expect(np).toContain("{#if queueSheetState === 'expanded'}");
    expect(np).toContain('<div class="qs-backdrop" onclick={closeQueueSheet}></div>');
  });
});

describe('6. « Lecture en cours » passe au-dessus de la grappe', () => {
  it('🔴 l’écran plein l’emporte sur la grappe et sur le tiroir', () => {
    const css = shell.slice(shell.lastIndexOf('<style'));
    const np_z = /\.np-overlay\{[^}]*z-index:(\d+)/.exec(css);
    const av_z = /\.av-tr\{z-index:(\d+)/.exec(css);
    expect(np_z, 'la règle .np-overlay a disparu').not.toBeNull();
    expect(av_z, 'la règle petite fenêtre de .av-tr a disparu').not.toBeNull();
    expect(Number(np_z![1])).toBeGreaterThan(Number(av_z![1]));
  });
});

describe('1. le badge de qualité ne répète plus ses voisins', () => {
  it('🔴 il ne porte que le palier', () => {
    expect(np).toContain('<span class="aqb-tier">{getQualityTierLabel(tier)}</span>');
    expect(npCode, 'le détail redondant est revenu').not.toContain('aqb-detail');
  });

  it('ce qu’il a cessé de dire est dit à côté, pas perdu', () => {
    // Le service : la pastille juste à gauche. Les chiffres : la rangée de
    // puces juste en dessous. Le détail complet : l'infobulle.
    expect(np).toContain('<ServiceBadge source={displayTrack.source} />');
    expect(np).toContain("<span class=\"tech-chip\">{displayTrack.bit_depth}-bit</span>");
    expect(np).toContain('title={formatQualityTooltip(displayTrack)}');
  });

  it('et il se lit : au-dessus de 10 px, sur un fond opaque', () => {
    const regle = /\.artwork-quality-badge \{[^}]*\}/.exec(npCode)?.[0] ?? '';
    const taille = Number(/font-size:\s*([\d.]+)px/.exec(regle)?.[1] ?? 0);
    expect(taille).toBeGreaterThan(10);
    const fond = Number(/background: rgba\([^)]*,\s*([\d.]+)\)/.exec(regle)?.[1] ?? 0);
    expect(fond).toBeGreaterThan(0.85);
  });
});
