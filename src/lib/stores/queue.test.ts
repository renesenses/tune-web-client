import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { queueTracks, queuePosition, upNextCount, upNextMs, jumpAndSync, nextQueueSheetState } from './queue';
import type { QueueSheetState } from './queue';
import type { Track, Zone } from '../types';

const t = (duration_ms?: number): Track => ({ id: 1, title: 'x', duration_ms }) as Track;

function setQueue(tracks: Track[], position: number) {
  queueTracks.set(tracks);
  queuePosition.set(position);
}

/**
 * Suggestion de Dominique COMET (fil forum « File d'attente, le nombre de
 * pistes reste figé ») : savoir ce qu'il reste à entendre, en titres et en
 * temps, plutôt qu'un total qui ne bouge jamais.
 *
 * Le calcul vivait en double exemplaire potentiel — inline dans QueueView, et
 * à écrire pour l'écran Lecture en cours. Ces tests couvrent l'unique version.
 */
describe('résumé « à suivre »', () => {
  const queue = [t(200_000), t(180_000), t(120_000)];

  it('ne compte que les titres APRÈS celui qui joue', () => {
    setQueue(queue, 0);
    expect(get(upNextCount)).toBe(2);
    expect(get(upNextMs)).toBe(180_000 + 120_000);
  });

  it('tombe à zéro sur le dernier titre', () => {
    setQueue(queue, 2);
    expect(get(upNextCount)).toBe(0);
    expect(get(upNextMs)).toBe(0);
  });

  it('ne descend jamais sous zéro sur une position hors bornes', () => {
    // Position non initialisée ou file remplacée sous les pieds du composant.
    setQueue(queue, 9);
    expect(get(upNextCount)).toBe(0);
    setQueue(queue, -1);
    expect(get(upNextCount)).toBe(3);
  });

  it('compte une piste sans durée connue pour zéro plutôt que d’inventer', () => {
    // Radio / flux : mieux vaut un temps un peu court qu'une durée fabriquée.
    setQueue([t(60_000), t(undefined), t(30_000)], 0);
    expect(get(upNextMs)).toBe(30_000);
  });

  it('rend zéro sur une file vide', () => {
    setQueue([], 0);
    expect(get(upNextCount)).toBe(0);
    expect(get(upNextMs)).toBe(0);
  });
});

/**
 * #1589 — Levente Toth, 0.9.70 Linux : « after clicking on any other song, it
 * starts playing but doesn't change the highlight in the list or in the bottom
 * left ». La vue jetait la réponse de `POST /queue/jump` et s'en remettait à
 * `playback.started`. Quand cet événement n'arrive pas — perdu, ou client passé
 * en sondage de repli, qui ne relit que `/zones` — on entend un morceau et on
 * en voit un autre, définitivement.
 */
describe('jumpAndSync', () => {
  const zoneFactice = { id: 7, name: 'Salon' } as unknown as Zone;

  it('déplace la surbrillance sans attendre la réponse du serveur', async () => {
    queuePosition.set(0);
    let resoudre: (z: Zone) => void = () => {};
    const enAttente = new Promise<Zone>((r) => { resoudre = r; });

    const promesse = jumpAndSync(7, 4, () => enAttente, () => {});
    // La réponse n'est pas encore arrivée : la surbrillance a déjà bougé.
    expect(get(queuePosition)).toBe(4);

    resoudre(zoneFactice);
    await promesse;
    expect(get(queuePosition)).toBe(4);
  });

  it('applique la zone renvoyée — le lecteur en bas suit aussi', async () => {
    queuePosition.set(0);
    let appliquee: Zone | null = null;
    await jumpAndSync(7, 2, async () => zoneFactice, (z) => { appliquee = z; });
    expect(appliquee).toBe(zoneFactice);
  });

  it('revient en arrière si le saut échoue', async () => {
    queuePosition.set(3);
    await expect(
      jumpAndSync(7, 9, async () => { throw new Error('zone hors ligne'); }, () => {}),
    ).rejects.toThrow('zone hors ligne');
    // Sans ce retour en arrière, la file désignerait un morceau jamais lancé.
    expect(get(queuePosition)).toBe(3);
  });
});

/**
 * #2191 — Alex Campbell, 0.9.98 Linux : « When you click the Queue button, you
 * are still required to press it 3 times before the Queue will disappear. »
 *
 * Le fait de base mesuré ici est un DÉCOMPTE D'APPUIS, pas un état isolé :
 * combien de fois faut-il presser le bouton, en partant du panneau fermé, pour
 * le retrouver fermé. Trois sur un écran large — dont un appui du milieu qui
 * ne change que quarante pixels de largeur, et rien du tout dès que
 * l'utilisateur a mémorisé une largeur en tirant le bord.
 */
function appuisPourRefermer(isWide: boolean): QueueSheetState[] {
  const parcours: QueueSheetState[] = [];
  let etat: QueueSheetState = 'collapsed';
  for (let i = 0; i < 6; i++) {
    etat = nextQueueSheetState(etat, isWide);
    parcours.push(etat);
    if (etat === 'collapsed') break;
  }
  return parcours;
}

describe('#2191 — cycle du bouton « File »', () => {
  it('sur écran large, deux appuis suffisent à faire disparaître la file', () => {
    // Le décompte d'Alex : il en fallait trois, dont un invisible.
    expect(appuisPourRefermer(true)).toEqual(['expanded', 'collapsed']);
  });

  it('sur écran large, le bouton ne s’arrête jamais sur « peek »', () => {
    // `.wide-layout.peek` (380px) et `.wide-layout.expanded` (420px) sont
    // pleine hauteur toutes les deux ; une largeur mémorisée les rend
    // identiques au pixel près.
    expect(nextQueueSheetState('collapsed', true)).toBe('expanded');
    expect(nextQueueSheetState('peek', true)).toBe('collapsed');
    expect(nextQueueSheetState('expanded', true)).toBe('collapsed');
  });

  it('referme depuis « peek » hérité d’un élargissement de fenêtre', () => {
    // La molette et le geste tactile posent `peek` ; si la fenêtre s'élargit
    // ensuite, le bouton doit refermer, pas déplier.
    expect(nextQueueSheetState('peek', true)).toBe('collapsed');
  });

  // ── Témoins : la colonne étroite garde ses trois crans ──────────────────
  it('TÉMOIN — en colonne étroite, les trois crans sont conservés', () => {
    // `peek` y a une hauteur propre (240px contre 70vh), et les gestes
    // tactiles les traversent un par un : les retirer serait la régression.
    expect(appuisPourRefermer(false)).toEqual(['peek', 'expanded', 'collapsed']);
  });

  it('TÉMOIN — en colonne étroite, chaque cran est atteint dans l’ordre', () => {
    expect(nextQueueSheetState('collapsed', false)).toBe('peek');
    expect(nextQueueSheetState('peek', false)).toBe('expanded');
    expect(nextQueueSheetState('expanded', false)).toBe('collapsed');
  });
});
