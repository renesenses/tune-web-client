/**
 * Retirer un dossier de musique : le testeur peut enfin purger (#2149, #1943).
 *
 * `handleRemoveMusicDir` faisait `await api.removeMusicDir(path)` et JETAIT la
 * réponse. Le serveur y annonce pourtant `orphan_tracks` et
 * `confirm_purge_required` depuis v0.9.127 ; le client n'envoyait jamais
 * `confirm_purge` et ne lisait jamais `purge_refused`. Ces pistes restaient
 * donc dans la base pour toujours : plus sous aucune racine, donc jamais
 * revisitées par le scan, donc jamais purgées.
 *
 * Les phrases sont assertées MOT POUR MOT : c'est ce que lit le testeur, et
 * c'est le seul niveau où la régression se voit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  purgeAProposer,
  questionDePurge,
  verdictDePurge,
  verdictDeRefus,
  type RetraitDossier,
} from '../purgeOrphelines';
import { en as enBrut, fr as frBrut } from '../locales';

const fr = frBrut as Record<string, string>;
const en = enBrut as Record<string, string>;
/** Même contrat que `$t()` : lecture de clé, SANS interpolation. */
const traduire = (dict: Record<string, string>) => (key: string) => dict[key] ?? fr[key] ?? key;
const trFr = traduire(fr);
const trEn = traduire(en);

/** La réponse réelle de `POST /system/music-dirs/remove` sans confirmation. */
const ANNONCE: RetraitDossier = {
  dirs: ['/media/musique'],
  orphan_tracks: 1240,
  confirm_purge_required: 1240,
  impact: {
    tracks: 1240,
    playlists: 3,
    playlist_entries: 87,
    favorites: 12,
    history_entries: 430,
    queue_entries: 0,
  },
};

describe('proposer la purge', () => {
  it('le nombre à confirmer vient du serveur, jamais du client', () => {
    expect(purgeAProposer(ANNONCE)).toBe(1240);
  });

  it('rien d’orphelin : aucune question posée', () => {
    expect(purgeAProposer({ dirs: [], orphan_tracks: 0, impact: { tracks: 0 } })).toBe(0);
  });

  it('serveur antérieur à #2149 : le retrait se comporte comme avant', () => {
    // Ni `orphan_tracks` ni `confirm_purge_required` : on n'invente pas un
    // nombre, et on ne propose pas une purge que le serveur ne sait pas faire.
    expect(purgeAProposer({ dirs: ['/media/musique'] })).toBe(0);
    expect(purgeAProposer(null)).toBe(0);
    expect(purgeAProposer(undefined)).toBe(0);
  });

  it('un compte annoncé sans nombre à confirmer ne déclenche rien', () => {
    expect(purgeAProposer({ orphan_tracks: 1240 })).toBe(0);
  });
});

describe('la question posée', () => {
  it('dit le nombre, ce qui tombe avec, et que les fichiers sont saufs', () => {
    expect(questionDePurge(ANNONCE, trFr)).toBe(
      'Le dossier a été retiré. 1240 pistes ne sont plus sous aucun dossier de musique : ' +
        'le scan ne les visitera plus. Les retirer aussi de la bibliothèque ? ' +
        'Seraient également retirés — playlists : 3, favoris : 12, file d’attente : 0. ' +
        'Les fichiers sur le disque ne sont pas touchés.',
    );
    expect(questionDePurge(ANNONCE, trEn)).toBe(
      'The folder was removed. 1240 tracks are no longer under any music folder, ' +
        'so scanning will never visit them again. Remove them from the library too? ' +
        'Also removed — playlists: 3, favourites: 12, queue: 0. ' +
        'The files on disk are left untouched.',
    );
  });

  it('sans dégât collatéral, on n’écrit pas « 0 playlist, 0 favori »', () => {
    const sec: RetraitDossier = { orphan_tracks: 5, confirm_purge_required: 5, impact: { tracks: 5 } };
    const q = questionDePurge(sec, trFr);

    expect(q).toContain('5 pistes');
    expect(q).not.toContain('playlists');
    expect(q).toContain('Les fichiers sur le disque ne sont pas touchés.');
  });

  it('la phrase « les fichiers sont saufs » n’est jamais omise', () => {
    // « retirer 1240 pistes » se lit comme « effacer 1240 fichiers ».
    for (const tr of [trFr, trEn]) {
      expect(questionDePurge(ANNONCE, tr)).toContain(tr('settings.orphanTracksFilesSafe'));
    }
  });

  it('aucun {marqueur} ne survit dans la phrase affichée', () => {
    // `$t()` ne sait pas interpoler : le module doit le faire lui-même.
    expect(questionDePurge(ANNONCE, trFr)).not.toMatch(/\{[a-z]+\}/);
    expect(questionDePurge(ANNONCE, trEn)).not.toMatch(/\{[a-z]+\}/);
  });
});

describe('le verdict après confirmation', () => {
  it('purge faite : on annonce le nombre RÉELLEMENT retiré', () => {
    const fait: RetraitDossier = {
      dirs: ['/media/musique'],
      orphan_tracks: 1240,
      purged: 1240,
      purge_refused: false,
      orphan_albums_removed: 92,
    };

    expect(verdictDePurge(fait, trFr)).toEqual({
      ton: 'success',
      message: '1240 pistes retirées de la bibliothèque.',
    });
  });

  it('purge refusée : 200 côté HTTP, mais le dossier EST retiré — on le dit', () => {
    // Le refus se lit dans le CORPS. Le traiter en erreur de transport ferait
    // croire que le dossier est encore là.
    const refus: RetraitDossier = {
      dirs: ['/media/musique'],
      orphan_tracks: 1240,
      purged: 0,
      purge_refused: true,
      purge_refused_reason: 'confirmation_insuffisante',
      confirm_purge_required: 1240,
      message: 'Le dossier a bien été retiré des réglages. En revanche…',
    };

    expect(verdictDePurge(refus, trFr)).toEqual({
      ton: 'error',
      message:
        'Le dossier a bien été retiré, mais les 1240 pistes n’ont pas été supprimées : ' +
        'la confirmation ne couvrait plus leur nombre. Recommencez pour les retirer.',
    });
  });

  it('le message français du serveur n’est JAMAIS affiché tel quel', () => {
    const refus: RetraitDossier = {
      orphan_tracks: 7,
      purge_refused: true,
      message: 'Le dossier a bien été retiré des réglages. En revanche la confirmation…',
    };
    // Il n'existe qu'en français : un utilisateur anglophone lirait du français.
    expect(verdictDePurge(refus, trEn).message).not.toContain('En revanche');
    expect(verdictDePurge(refus, trEn).message).toBe(
      'The folder was removed, but the 7 tracks were not deleted: the confirmation no longer ' +
        'covered their number. Start over to remove them.',
    );
  });

  it('plus rien à retirer entre les deux appels : ce n’est pas un échec', () => {
    expect(verdictDePurge({ purged: 0, purge_refused: false }, trFr)).toEqual({
      ton: 'info',
      message: 'Il n’y avait plus de piste orpheline à retirer.',
    });
  });
});

describe('quand l’utilisateur refuse', () => {
  it('le nombre ne disparaît pas avec la boîte de dialogue', () => {
    expect(verdictDeRefus(ANNONCE, trFr)).toEqual({
      ton: 'info',
      message:
        '1240 pistes conservées. Le scan ne les visitera plus : ce geste est le seul qui ' +
        'puisse les retirer.',
    });
  });
});

// ---------------------------------------------------------------------------
// La contre-épreuve : le client doit VRAIMENT envoyer et lire ces champs.
// Ce bloc est ROUGE sur `main` avant le correctif.
// ---------------------------------------------------------------------------

const lire = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');
const apiTs = lire('lib/api.ts');
const settings = lire('components/SettingsView.svelte');

describe('le client envoie confirm_purge et lit la réponse', () => {
  it('`removeMusicDir` sait porter une confirmation chiffrée', () => {
    expect(apiTs).toContain('removeMusicDir(path: string, confirmPurge?: number)');
    expect(apiTs).toContain('body.confirm_purge = confirmPurge');
  });

  it('le type de retour ne ment plus : le serveur rend `dirs`, pas `music_dirs`', () => {
    expect(apiTs).not.toContain(
      "fetchJSON<{ music_dirs: string[] }>(`${BASE}/system/music-dirs/remove`",
    );
  });

  it('la réponse du retrait n’est plus jetée', () => {
    const debut = settings.indexOf('async function handleRemoveMusicDir');
    expect(debut).toBeGreaterThanOrEqual(0);
    const handler = settings.slice(debut, debut + 2200);

    // La forme QUI JETTE : un `await` nu, sans affectation. `const retrait =
    // await …` contient la même sous-chaîne, d'où le saut de ligne en tête.
    expect(handler).not.toContain('\n      await api.removeMusicDir(path);');
    expect(handler).toContain('const retrait = await api.removeMusicDir(path);');
    expect(handler).toContain('purgeAProposer(retrait)');
    expect(handler).toContain('api.removeMusicDir(path, aPurger)');
    expect(handler).toContain('verdictDePurge');
    expect(handler).toContain('verdictDeRefus');
  });

  it('l’échec du retrait ne meurt plus dans la console', () => {
    const debut = settings.indexOf('async function handleRemoveMusicDir');
    const handler = settings.slice(debut, debut + 2200);
    expect(handler).toContain("notifications.error(`${get(t)('settings.removeMusicDirError')}");
  });
});
