/**
 * La restauration de configuration doit être POSSIBLE, et impossible par
 * accident.
 *
 * ## Pourquoi elle n'était pas là
 *
 * `api.importConfig()` existait, mais l'écran s'en tenait à distance, et son
 * commentaire disait pourquoi :
 *
 *   « un écran qui le propose sans le flux de confirmation complet inviterait
 *     à une fausse manœuvre. »
 *
 * La prudence était juste. La réponse n'était pas de renvoyer l'utilisateur
 * vers un autre client, c'était d'écrire le flux.
 *
 * ## Ce qui rend ce garde nécessaire
 *
 * Le client actuel importe **sans aucune confirmation** : fichier choisi,
 * fichier appliqué. Or la restauration ÉCRASE dossiers, zones et réglages
 * audio, et rien ne la défait. Reprendre ce geste tel quel aurait été porter
 * un défaut plutôt qu'une fonction.
 *
 * La confirmation se fait donc par SAISIE — un mot à taper ne se clique pas par
 * réflexe — sur le modèle du volume fixe de ce même écran. Ce test existe pour
 * qu'un futur remaniement ne la remplace pas par un simple bouton, ce qui
 * paraîtrait toujours plus simple et serait toujours pire.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fr from '../locales/fr';
import en from '../locales/en';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/SettingsV2.svelte', import.meta.url),
);

/** Le source sans ses commentaires : sinon la documentation satisfait le garde. */
function code(): string {
  return readFileSync(ECRAN, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Réglages — restauration de configuration', () => {
  it('la restauration se fait depuis cet écran', () => {
    const src = code();
    expect(src.includes('api.importConfig('), "la restauration n'est plus appelée").toBe(true);
    expect(
      src.includes("n'est pas reprise dans ce client"),
      'la note de renvoi vers le client actuel est revenue.',
    ).toBe(false);
  });

  it('elle exige une SAISIE, pas un simple clic', () => {
    const src = code();
    expect(
      src.includes("rstTyped.trim() !== $t('settings.restoreConfigWord' as any)"),
      'la confirmation par saisie a disparu : un clic suffirait à écraser dossiers, ' +
        'zones et réglages audio, sans retour possible.',
    ).toBe(true);
  });

  it('le mot à taper est celui qui est affiché, dans chaque langue', () => {
    // Le champ se compare à `settings.restoreConfigWord`, et le libellé affiché
    // vient de la MÊME clé. Si elle manquait dans une locale, `$t()` rendrait la
    // clé elle-même et l'utilisateur devrait taper « settings.restoreConfigWord ».
    for (const [nom, dict] of [['fr', fr], ['en', en]] as const) {
      const mot = (dict as Record<string, string>)['settings.restoreConfigWord'];
      expect(mot, `settings.restoreConfigWord absente de ${nom}.ts`).toBeTruthy();
      expect(
        mot.startsWith('settings.'),
        `en ${nom}, le mot à taper est la clé technique elle-même.`,
      ).toBe(false);
    }
  });

  it('le fichier est analysé AVANT de demander confirmation', () => {
    // Faire taper un mot pour un fichier illisible serait une perte de temps,
    // et l'échec arriverait après la confirmation — donc au pire moment.
    const src = code();
    const i = src.indexOf('JSON.parse(await f.text())');
    const j = src.indexOf('rstConfirmer');
    expect(i, "l'analyse du fichier a disparu").toBeGreaterThan(-1);
    expect(i, "le fichier n'est plus analysé avant la confirmation").toBeLessThan(j);
    expect(
      src.includes('settings.restoreConfigBadFile'),
      "un fichier illisible n'est plus signalé.",
    ).toBe(true);
  });

  it('la boîte de confirmation ne s’ouvre que si un fichier est chargé', () => {
    expect(
      code().includes('{#if rstData}'),
      "la boîte de confirmation n'est plus conditionnée au fichier chargé.",
    ).toBe(true);
  });
});

describe('Réglages — plus aucune note ne renvoie au client actuel', () => {
  it('les quatre notes de renvoi ont disparu', () => {
    // Ce garde n'était possible qu'une fois le DERNIER portage fait : tant
    // qu'une fonction manquait réellement, le dire était honnête. Maintenant
    // qu'elles sont toutes là, toute phrase de ce genre est une régression.
    //
    // Seul l'import Roon/Plex reste dehors, sur décision de Bertrand : il n'a
    // jamais fonctionné (client multipart contre serveur JSON), donc il n'y
    // avait rien à porter.
    // La section « import » (Roon/Plex) est EXCLUE, et c'est délibéré : son
    // portage est mis de côté sur décision de Bertrand du 01/09/2026. Sa note
    // reste donc, faute de mieux — mais elle est trompeuse et il le sait :
    // elle renvoie vers un assistant qui n'a JAMAIS fonctionné (le client
    // envoie du multipart, le serveur n'accepte que du JSON — 415). Le jour où
    // cette section est traitée, retirer l'exclusion ci-dessous.
    const tout = code();
    const dImport = tout.indexOf("s.id === 'import'");
    const fImport = tout.indexOf('{:else if s.id ===', dImport + 10);
    const src = dImport === -1 ? tout : tout.slice(0, dImport) + tout.slice(fImport);
    for (const motif of [
      'client actuel',
      'pas encore porté',
      'pas encore reprise',
      "n'est pas reprise",
      'déplacé depuis',
    ]) {
      expect(
        src.includes(motif),
        `« ${motif} » est réapparu dans les Réglages : l'écran renvoie de nouveau ` +
          "l'utilisateur vers l'ancien client.",
      ).toBe(false);
    }
  });
});
