import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lireOuAjouter, type PortesFile } from './playback';

/**
 * #528 — « Mood Mix » décidait de jouer ou d'ajouter d'après `$queueTracks`, un
 * cache client. Vu vide alors que la file du serveur ne l'était pas, le geste
 * partait sur `POST /play`, qui REMPLACE la file : perte de données silencieuse,
 * assortie d'un message « ajoutées ».
 *
 * Contre-épreuve (les deux moitiés rougissent séparément) :
 * - remettre `if ($queueTracks.length === 0)` dans l'un des deux `.svelte` ⇒ la
 *   garde « les deux écrans passent par lireOuAjouter » rougit ;
 * - faire retomber `lireOuAjouter` sur le cache — ou lui faire choisir `lire`
 *   quand la file est pleine ou quand sa lecture échoue ⇒ les cas ci-dessous
 *   rougissent, `lire` ayant été appelé.
 */

/** Portes espionnes : on observe LEQUEL des deux gestes est parti. */
function portes(file: unknown): { p: PortesFile; lire: any; ajouter: any; } {
  const lire = vi.fn(async () => ({}));
  const ajouter = vi.fn(async () => ({ queue_length: 0 }));
  const lireFile = vi.fn(async () =>
    file instanceof Error ? Promise.reject(file) : (file as any),
  );
  return { p: { lireFile: lireFile as any, lire, ajouter }, lire, ajouter };
}

const pleine = { tracks: [{ id: 1 }, { id: 2 }, { id: 3 }], position: 1, length: 3 };
const vide = { tracks: [], position: 0, length: 0 };

describe('#528 — Mood Mix ne peut plus écraser la file', () => {
  // LE cas du signalement : la file du serveur porte trois titres, le cache
  // client est vide (écran jamais ouvert, magasin non hydraté, zone changée,
  // reconnexion). Aucun `POST /play` ne doit partir.
  it('file serveur non vide, cache client vide : on ajoute, on n’écrase pas', async () => {
    const { p, lire, ajouter } = portes(pleine);
    const decision = await lireOuAjouter(4, [10, 11, 12], p);
    expect(lire, 'POST /play est parti : la file de l’auditeur est perdue').not.toHaveBeenCalled();
    expect(ajouter).toHaveBeenCalledWith(4, [10, 11, 12]);
    expect(decision).toBe('ajout');
  });

  it('le serveur seul décide : `length` non nul suffit, même sans `tracks`', async () => {
    const { p, lire, ajouter } = portes({ position: 0, length: 7 });
    expect(await lireOuAjouter(4, [1], p)).toBe('ajout');
    expect(lire).not.toHaveBeenCalled();
    expect(ajouter).toHaveBeenCalled();
  });

  it('`tracks` non vide suffit aussi, même si `length` annonce zéro', async () => {
    const { p, lire } = portes({ tracks: [{ id: 1 }], position: 0, length: 0 });
    expect(await lireOuAjouter(4, [1], p)).toBe('ajout');
    expect(lire).not.toHaveBeenCalled();
  });

  // Le doute penche du côté qui ne détruit rien.
  it('lecture de la file en échec : on ajoute, on ne remplace pas', async () => {
    const { p, lire, ajouter } = portes(new Error('réseau'));
    expect(await lireOuAjouter(4, [1, 2], p)).toBe('ajout');
    expect(lire).not.toHaveBeenCalled();
    expect(ajouter).toHaveBeenCalledWith(4, [1, 2]);
  });

  it('réponse illisible : doute, donc ajout', async () => {
    const { p, lire } = portes({});
    expect(await lireOuAjouter(4, [1], p)).toBe('ajout');
    expect(lire).not.toHaveBeenCalled();
  });

  // La contrepartie : quand la file est vraiment vide, le geste joue toujours.
  it('file serveur vraiment vide : on joue, comme avant', async () => {
    const { p, lire, ajouter } = portes(vide);
    expect(await lireOuAjouter(4, [10, 11], p)).toBe('lecture');
    expect(lire).toHaveBeenCalledWith(4, [10, 11]);
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('la file est lue AVANT toute décision, une seule fois', async () => {
    const { p } = portes(pleine);
    await lireOuAjouter(4, [1], p);
    expect(p.lireFile).toHaveBeenCalledTimes(1);
    expect(p.lireFile).toHaveBeenCalledWith(4);
  });
});

/**
 * « Écrit mais pas branché » : la fonction ci-dessus ne vaut que si les deux
 * écrans l'appellent. On lit leur source.
 */
const lireSource = (nom: string) =>
  readFileSync(
    fileURLToPath(new URL(`../components/${nom}`, import.meta.url)),
    'utf8',
  );

/** Le corps de la fonction `nom` dans une source Svelte, accolades comptées. */
function corpsDeFonction(source: string, nom: string): string {
  const debut = source.indexOf(`async function ${nom}(`);
  if (debut < 0) throw new Error(`fonction ${nom} introuvable`);
  const ouvrante = source.indexOf('{', source.indexOf(')', debut));
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}' && --profondeur === 0) return source.slice(ouvrante, i + 1);
  }
  throw new Error(`corps de ${nom} non refermé`);
}

describe('#528 — les deux écrans passent par lireOuAjouter', () => {
  const ecrans = [
    ['NowPlaying.svelte', 'handleNpMoodSelect'],
    ['QueueView.svelte', 'handleMoodSelect'],
  ] as const;

  for (const [fichier, fonction] of ecrans) {
    it(`${fichier} : ${fonction} ne tranche plus sur le cache client`, () => {
      const corps = corpsDeFonction(lireSource(fichier), fonction);
      expect(
        /\$queueTracks\s*\.\s*length\s*===\s*0/.test(corps),
        `${fichier} décide encore sur $queueTracks : une file non vide vue vide sera écrasée`,
      ).toBe(false);
      expect(
        corps.includes('lireOuAjouter('),
        `${fichier} n’appelle pas lireOuAjouter`,
      ).toBe(true);
      expect(
        /playAndSync\s*\(/.test(corps),
        `${fichier} appelle encore playAndSync : POST /play remplace la file`,
      ).toBe(false);
    });
  }
});
