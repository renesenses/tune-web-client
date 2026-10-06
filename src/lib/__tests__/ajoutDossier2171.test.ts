/**
 * Fil forum 2171 — « il faut saisir un chemin exact […] une petite erreur m'a
 * généré le chargement non désiré d'un disque SSD en entier (1 To) ».
 *
 * Trois défauts, trois gardes :
 *
 * 1. le sélecteur de dossier (`FolderBrowser`) n'était plus monté par aucun
 *    écran d'ajout d'emplacement depuis le retrait de l'ancienne interface ;
 * 2. l'ajout d'une racine de disque partait sans un mot ;
 * 3. le retrait ne retirait que le dossier des réglages, jamais ses pistes :
 *    `purgeOrphelines` (#2149) n'avait plus d'appelant.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ajouterUnDossier,
  estUneRacineDeVolume,
  faitConfirmer,
  questionAvantAjout,
  retirerUnDossier,
  SEUIL_FICHIERS_AUDIO,
} from '../ajoutDossier';
import { ONZE_LANGUES, fr as frBrut } from './onzeDictionnaires';
import * as dicos from './onzeDictionnaires';

const fr = frBrut as Record<string, string>;
const trFr = (k: string) => fr[k] ?? k;

describe('racine de volume', () => {
  it.each(['/', 'C:\\', 'D:', 'e:/', '\\\\nas\\musique', '/Volumes/SSD', '/mnt/ssd', '/media/ssd', '/media/moi/ssd', '/run/media/moi/ssd'])(
    '%s est un disque entier',
    (c) => expect(estUneRacineDeVolume(c)).toBe(true),
  );
  it.each(['/Volumes/SSD/Musique', 'D:\\Musique', '/home/moi/Musique', '/mnt/ssd/Jazz', '\\\\nas\\musique\\Jazz', '', 'Musique'])(
    "%s n'en est pas un",
    (c) => expect(estUneRacineDeVolume(c)).toBe(false),
  );
});

describe('quand confirmer', () => {
  it('une racine de disque, même sans comptage', () => {
    expect(faitConfirmer('D:\\', null)).toBe(true);
  });
  it('un très gros dossier, ou un comptage inachevé', () => {
    expect(faitConfirmer('/data/a', { audio_files: SEUIL_FICHIERS_AUDIO, complete: true })).toBe(true);
    expect(faitConfirmer('/data/a', { audio_files: 10, complete: false })).toBe(true);
  });
  it('un dossier ordinaire passe sans question', () => {
    expect(faitConfirmer('/data/a', { audio_files: 1200, complete: true })).toBe(false);
    expect(faitConfirmer('/data/a', null)).toBe(false);
  });
});

describe('la question dit ce qui va être analysé', () => {
  it('racine, nombre exact', () => {
    expect(questionAvantAjout('D:\\', { audio_files: 48210, folders: 3120, complete: true }, trFr)).toBe(
      '« D:\\ » est la racine d’un disque entier : tout son contenu sera analysé et ajouté à la bibliothèque. '
        + 'Tune y a trouvé 48210 fichiers audio dans 3120 dossiers. '
        + 'Ajouter ce dossier ? Vous pourrez le retirer ensuite sans toucher aux fichiers.',
    );
  });
  it('comptage inachevé : un minimum', () => {
    expect(questionAvantAjout('/data/a', { audio_files: 90000, folders: 4000, complete: false }, trFr)).toContain(
      'au moins 90000 fichiers audio',
    );
  });
  it('sans comptage, la phrase tient debout', () => {
    const q = questionAvantAjout('/', { error: 'path is outside the browsable perimeter' }, trFr);
    expect(q).not.toMatch(/\{[a-z]+\}/);
    expect(q).not.toContain('Tune y a trouvé');
  });
});

describe('ajouterUnDossier', () => {
  it("n'ajoute rien si l'utilisateur renonce", async () => {
    const ajouter = vi.fn();
    const r = await ajouterUnDossier('E:\\', {
      estimer: async () => ({ audio_files: 120000, folders: 9000, complete: false, drive_root: true }),
      ajouter,
      confirmer: async () => false,
      tr: trFr,
    });
    expect(r).toBeNull();
    expect(ajouter).not.toHaveBeenCalled();
  });
  it('un serveur sans route de comptage ne bloque pas un dossier ordinaire', async () => {
    const confirmer = vi.fn();
    const r = await ajouterUnDossier('/data/musique', {
      estimer: async () => { throw new Error('404'); },
      ajouter: async () => ({ music_dirs: ['/data/musique'] }),
      confirmer,
      tr: trFr,
    });
    expect(r?.music_dirs).toEqual(['/data/musique']);
    expect(confirmer).not.toHaveBeenCalled();
  });
});

describe('retirerUnDossier propose de retirer aussi les pistes', () => {
  it('oui : second appel avec le nombre exact', async () => {
    const retirer = vi.fn()
      .mockResolvedValueOnce({ music_dirs: [], orphan_tracks: 41000, confirm_purge_required: 41000 })
      .mockResolvedValueOnce({ music_dirs: [], orphan_tracks: 41000, purged: 41000, purge_refused: false });
    const annoncer = vi.fn();
    await retirerUnDossier('E:\\', { retirer, confirmer: async () => true, annoncer, tr: trFr });
    expect(retirer).toHaveBeenNthCalledWith(2, 'E:\\', 41000);
    expect(annoncer).toHaveBeenCalledWith({ ton: 'success', message: '41000 pistes retirées de la bibliothèque.' });
  });
  it('non : les pistes restent, et on le dit', async () => {
    const retirer = vi.fn().mockResolvedValue({ music_dirs: [], orphan_tracks: 5, confirm_purge_required: 5 });
    const annoncer = vi.fn();
    await retirerUnDossier('/x', { retirer, confirmer: async () => false, annoncer, tr: trFr });
    expect(retirer).toHaveBeenCalledTimes(1);
    expect(annoncer.mock.calls[0][0].ton).toBe('info');
  });
});

describe('les écrans branchent les gestes', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
  it.each(['../../components/v2/SettingsV2.svelte', '../../components/partages/OnboardingWizard.svelte'])('%s', (p) => {
    const src = lire(p);
    expect(src).toContain('<FolderBrowser');
    expect(src).toContain('ajouterUnDossier(');
    expect(src).toContain('retirerUnDossier(');
  });
  it("le sélecteur passe par l'API authentifiée", () => {
    const src = lire('../../components/partages/FolderBrowser.svelte');
    expect(src).toContain('api.browseServerDirs(');
    expect(src).not.toMatch(/fetch\(`\/api\/v1\/system\/browse-dirs/);
  });
});

describe('i18n dans les onze langues', () => {
  const cles = [
    'folderBrowser.drives', 'folderBrowser.loading', 'folderBrowser.empty', 'folderBrowser.error',
    'folderBrowser.select', 'folderBrowser.parent', 'folderBrowser.open', 'folderBrowser.hint',
    'settings.addFolderDriveRoot', 'settings.addFolderLarge', 'settings.addFolderCount',
    'settings.addFolderCountAtLeast', 'settings.addFolderConfirm', 'settings.removeFolderButton',
  ];
  it.each([...ONZE_LANGUES])('%s', (l) => {
    const d = (dicos as Record<string, unknown>)[l] as Record<string, string>;
    for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy();
    expect(d['settings.addFolderCount']).toContain('{count}');
    expect(d['settings.addFolderDriveRoot']).toContain('{path}');
  });
});
