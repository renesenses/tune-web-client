/**
 * LES RETOURS SUR LA PREMIÈRE LIGNE — FabienM et JeromeQ, 28/09/2026,
 * lendemain de la livraison.
 *
 * Quatre défauts, tous dans du code posé la veille :
 *
 *  - **#1711** (JeromeQ, fil 2011) : la carte de zone reste à 0:00 pendant la
 *    lecture. Rien ne suivait la position d'une zone autre que la zone
 *    courante.
 *  - **#1721** (FabienM, fil 2013 pt 7) : impossible de défiler à droite —
 *    la rangée masquait sa barre de défilement.
 *  - **#1722** (FabienM, fil 2013 pt 8) : cliquer un genre ouvre l'onglet
 *    Genres sans ouvrir le genre.
 *  - **#1712** (JeromeQ, fil 2011) : la rangée d'icônes débordait sur le
 *    cadran droit de la barre de lecture.
 *
 * Les témoins de position interrogent des fonctions PURES, avec leur propre
 * horloge : pas de minuteur, pas de magasin, pas d'attente. C'est la règle
 * qu'ils gardent, pas le cadencement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ancrerDepuisZone, positionMaintenant, PAS_MS } from '../positionsZones';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
/**
 * 🔴 Une garde de texte se fait piéger par le COMMENTAIRE qui explique le
 * correctif : ce fichier cherchait `min-width: 0` et le trouvait dans la phrase
 * « `min-width: 0` laissait cette colonne déborder ». Le témoin rougissait donc
 * sur le correctif lui-même. Les commentaires sont retirés avant toute mesure.
 */
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Une zone en lecture, telle que `GET /zones` la rend (relevé sur le .18). */
const zoneQuiJoue = (position_ms: number, titre = 'I Got The News', duree = 300_000) => ({
  id: 10,
  state: 'playing',
  position_ms,
  current_track: { track_id: 42, title: titre, duration_ms: duree, source: 'local' },
});

describe('🔴 #1711 — la position avance entre deux messages du serveur', () => {
  it('elle compte le temps écoulé depuis la dernière relève', () => {
    // C'EST le défaut : `zone.position_ms` ne bouge qu'au `zone.updated`, donc
    // en pratique au changement de piste. Entre deux, la carte affichait la
    // même valeur — 0:00 sur un morceau qui vient de commencer.
    const a = ancrerDepuisZone(undefined, zoneQuiJoue(0), 1_000);
    expect(positionMaintenant(a, 1_000), 'à la relève, la valeur du serveur').toBe(0);
    expect(positionMaintenant(a, 6_000), 'cinq secondes plus tard').toBe(5_000);
    expect(positionMaintenant(a, 61_000), 'une minute plus tard').toBe(60_000);
  });

  it('une zone à l’ARRÊT ne compte pas — et garde sa dernière position', () => {
    const arretee = { ...zoneQuiJoue(45_000), state: 'paused' };
    const a = ancrerDepuisZone(undefined, arretee, 1_000);
    expect(positionMaintenant(a, 1_000)).toBe(45_000);
    expect(positionMaintenant(a, 999_000), 'une zone en pause a avancé toute seule').toBe(45_000);
  });

  it('🔴 le CHANGEMENT DE PISTE remet à zéro — la règle de #954', () => {
    // « La barre montrait 68 s sur un titre qui venait de commencer. » Sans la
    // clé de piste, l'avance accumulée sur le morceau précédent se serait
    // reportée sur le suivant.
    const a1 = ancrerDepuisZone(undefined, zoneQuiJoue(0, 'Aja'), 0);
    expect(positionMaintenant(a1, 68_000)).toBe(68_000);
    const a2 = ancrerDepuisZone(a1, zoneQuiJoue(0, 'Peg'), 68_000);
    expect(positionMaintenant(a2, 68_000), 'la position de l’ancienne piste a survécu').toBe(0);
  });

  it('le serveur a le DERNIER MOT, y compris quand il fait reculer', () => {
    // Un déplacement fait depuis un autre client : la carte doit suivre, pas
    // rester en avance sur ce qu'elle avait compté toute seule.
    const a1 = ancrerDepuisZone(undefined, zoneQuiJoue(0), 0);
    expect(positionMaintenant(a1, 90_000)).toBe(90_000);
    const a2 = ancrerDepuisZone(a1, zoneQuiJoue(10_000), 90_000);
    expect(positionMaintenant(a2, 90_000), 'le recul annoncé par le serveur a été ignoré').toBe(10_000);
  });

  it('elle ne dépasse JAMAIS la fin de la piste', () => {
    // Sur un flux dont la durée annoncée est fausse — ou une piste qui
    // s'achève pendant que le serveur se tait — la barre déborderait.
    const a = ancrerDepuisZone(undefined, zoneQuiJoue(0, 'Aja', 10_000), 0);
    expect(positionMaintenant(a, 60_000)).toBe(10_000);
  });

  it('durée inconnue (radio) : elle compte quand même, sans borne', () => {
    const radio = { id: 3, state: 'playing', position_ms: 0, current_track: { title: 'FIP', source: 'radio' } };
    const a = ancrerDepuisZone(undefined, radio as any, 0);
    expect(positionMaintenant(a, 30_000)).toBe(30_000);
  });

  it('le pas est d’une seconde — la résolution de ce qui est écrit', () => {
    expect(PAS_MS).toBe(1000);
  });
});

describe('#1711 — le branchement dans la carte', () => {
  const src = lire('src/components/v2/ligne1/CarteZoneL1.svelte');

  it('🔴 la carte ne lit PLUS `zone.position_ms` pour afficher le temps', () => {
    // La garde qui compte : si quelqu'un rebranche l'objet de zone, le 0:00
    // revient sans bruit.
    expect(src).not.toContain('formatTime(zone?.position_ms');
    expect(src).not.toContain('(zone?.position_ms ?? 0) / d');
    expect(src).toContain('formatTime(positionMs)');
    expect(src).toContain('$positionsZones[');
  });

  it('le minuteur ne tourne QUE s’il a quelque chose à compter', () => {
    // Un minuteur oublié tourne pour la vie de la page, et l'Accueil est un
    // écran qu'on laisse ouvert.
    const store = lire('src/lib/positionsZones.ts');
    expect(store).toContain('clearInterval');
    expect(store).toContain('const ilFautCompter');
  });
});

describe('🔴 #1721 — la première ligne montre sa barre de défilement', () => {
  const brut = lire('src/components/v2/PageWidgets.svelte');
  const src = sansCommentaires(brut);
  const bloc = (sel: string) => {
    const i = src.indexOf(sel);
    expect(i, `${sel} introuvable`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('}', i));
  };

  it('elle ne masque plus sa barre, et s’accorde avec toutes les autres', () => {
    // FabienM : « il manque la barre horizontale de défilement ». La rangée la
    // masquait alors que son propre commentaire annonce « une bande qui
    // défile, comme toutes les autres ».
    expect(src, 'la règle webkit qui masquait la barre est revenue')
      .not.toContain('.l1::-webkit-scrollbar');
    expect(bloc('.l1{')).toContain('scrollbar-width:thin');
    expect(bloc('.bande{'), 'les deux rangées ont divergé').toContain('scrollbar-width:thin');
  });

  it('le geste de molette n’est PAS modifié — #1327 reste fermé', () => {
    // `defilementHorizontal` laisse délibérément la priorité à la page tant
    // qu'elle peut descendre (Didier, fil 1858 : « la zone permettant le
    // défilement vers le bas est très étroite »). Reprendre la molette ici
    // rouvrirait ce défaut.
    expect(brut).toContain('<div class="l1" use:defilementHorizontal');
    const geste = lire('src/lib/defilementHorizontal.ts');
    expect(geste, 'la priorité de la page a sauté').toContain('pagePeutDefiler');
  });
});

describe('🔴 #1722 — cliquer un genre OUVRE le genre', () => {
  const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
  const bloc = lib.slice(lib.indexOf('const surFacette'), lib.indexOf('window.addEventListener(\'tune:v2-facette\''));

  it('la facette est POSÉE, pas seulement l’onglet', () => {
    expect(bloc, 'surFacette ne pose toujours pas facetteOuverte').toContain('facetteOuverte = valeur');
  });

  it('🔴 elle est posée APRÈS le tick — sinon la remise à zéro l’efface', () => {
    // Le piège : `$effect(() => { void tab; void q; facetteOuverte = null })`
    // se déclenche sur le changement d'onglet et de recherche que surFacette
    // vient de faire. Poser la facette avant le tick la ferait effacer par cet
    // effet — le défaut survivrait à son correctif, sans rien dire.
    const iTick = bloc.indexOf('tick()');
    const iPose = bloc.indexOf('facetteOuverte = valeur');
    expect(iTick, 'plus de tick : la remise à zéro va gagner').toBeGreaterThan(-1);
    expect(iPose, 'la facette est posée AVANT le tick').toBeGreaterThan(iTick);
    // Et la remise à zéro est toujours là : c'est elle qu'on contourne, on ne
    // la supprime pas — elle protège du passage Genres → Labels.
    expect(lib).toContain('void tab; void q; facetteOuverte = null;');
  });

  it('elle est posée SANS condition d’existence', () => {
    // Sur une bibliothèque encore froide, `groups` est vide : exiger que le
    // genre existe perdrait le clic. `groupeOuvert` se résout tout seul quand
    // la donnée arrive.
    expect(bloc).not.toMatch(/groups\.(some|find)\([^)]*\)\s*(\?|&&)[^;]*facetteOuverte/);
  });
});

describe('🔴 #1712 — la rangée d’icônes ne déborde plus sur le cadran', () => {
  const src = sansCommentaires(lire('src/components/partages/TransportBar.svelte'));
  const pile = src.slice(src.indexOf('.transport-bar.vu .tb-pile'));

  it('la colonne garde sa largeur naturelle sous `.vu`', () => {
    const regle = pile.slice(0, pile.indexOf('}'));
    expect(regle, 'min-width:0 est revenu : la colonne peut déborder par la gauche')
      .not.toMatch(/min-width:\s*0/);
    expect(regle).toMatch(/min-width:\s*max-content/);
  });

  it('le cadran, lui, était déjà insécable — ce n’est pas lui qui glissait', () => {
    const vu = lire('src/components/partages/VuMetreCanal.svelte');
    expect(vu).toContain('flex: 0 0 auto');
  });
});
