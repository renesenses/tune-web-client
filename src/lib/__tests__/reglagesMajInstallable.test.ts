/**
 * Les Réglages doivent INSTALLER la mise à jour — et surtout, dire pourquoi le
 * serveur refuse quand il refuse.
 *
 * L'écran annonçait la version disponible puis renvoyait ailleurs pour
 * l'installer. Poser un bouton ne suffit pas : `POST /system/update/install`
 * répond **409 avec un motif** — drapeau `.no-auto-update`, zone en lecture,
 * scan en cours, installation déjà lancée — et `fetch` ne lève pas sur un 409.
 *
 * Ce qui arrive quand on ignore ce contrat est documenté dans le client actuel,
 * et ce n'est pas théorique :
 *
 *  - #412 : sans lecture du refus, l'interface entrait dans trois minutes
 *    d'attente d'un redémarrage qui n'arriverait jamais, et jetait
 *    l'explication que le serveur venait de donner. Vécu sur une machine
 *    portant le drapeau `.no-auto-update` ;
 *  - Docker : le serveur répond **200**, pas une erreur — mais `status:
 *    'docker'` signifie qu'aucune installation n'a démarré, le binaire vivant
 *    dans une couche d'image en lecture seule. Sans ce test, `ok === true`
 *    laissait passer et le bouton restait mort trois minutes (Alex Campbell,
 *    Tune en conteneur).
 *
 * Ce garde-fou tient donc les trois points qui font la différence entre un
 * bouton et un bouton honnête : le refus est traduit, le cas Docker est
 * intercepté, et l'avertissement de coupure ne s'affiche pas à tort.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/SettingsV2.svelte', import.meta.url),
);

/** Le source sans ses commentaires — sinon la documentation du garde satisfait
 *  le garde. */
function code(): string {
  return readFileSync(ECRAN, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Réglages — installation de la mise à jour', () => {
  it('installe depuis cet écran, sans renvoyer ailleurs', () => {
    const src = code();
    expect(src.includes('api.installUpdate('), "l'installation n'est plus appelée").toBe(true);
    expect(
      src.includes("L'installation se fait depuis le client actuel"),
      'la note de renvoi vers le client actuel est revenue.',
    ).toBe(false);
  });

  it('un refus 409 est LU, traduit, et arrête la séquence', () => {
    const src = code();
    expect(
      src.includes('res.ok === false'),
      "le refus du serveur n'est plus testé : l'écran enchaînerait sur trois minutes " +
        "d'attente d'un redémarrage qui n'arrivera jamais (#412).",
    ).toBe(true);

    // Chaque motif du contrat serveur doit avoir sa traduction.
    for (const cle of [
      'settings.updateBlockedFlag',
      'settings.updateAlreadyRunning',
      'settings.updateBlockedScan',
      'settings.updateBlockedPlaying',
      'settings.updateBlockedUnknown',
    ]) {
      expect(
        src.includes(cle),
        `le motif de refus « ${cle} » n'est plus traduit : le serveur explique, l'écran se tait.`,
      ).toBe(true);
    }
  });

  it('le cas Docker est intercepté, alors que le serveur répond 200', () => {
    expect(
      code().includes("res.status === 'docker'"),
      "le cas Docker n'est plus intercepté : `ok === true` laisserait passer, et le " +
        'bouton resterait mort trois minutes pour une installation qui ne démarre jamais.',
    ).toBe(true);
  });

  it("l'avertissement de coupure ne s'affiche que si une zone joue", () => {
    const src = code();
    // La phrase AFFIRME « De la musique joue en ce moment ». L'afficher hors
    // lecture serait une contrevérité, et l'utilisateur cesserait d'y croire.
    const i = src.indexOf('settings.updateStopsPlayback');
    expect(i, "l'avertissement de coupure a disparu").toBeGreaterThan(-1);
    const avant = src.slice(Math.max(0, i - 220), i);
    expect(
      avant.includes('zonesEnLecture'),
      "l'avertissement n'est plus conditionné à une zone en lecture : il affirmerait " +
        'que de la musique joue alors que rien ne joue.',
    ).toBe(true);
  });

  it('le forçage est délibéré, et documenté comme tel', () => {
    // `force=true` contourne les gardes serveur. C'est légitime ICI, parce que
    // le bouton est cliqué sous l'avertissement — mais jamais par défaut.
    expect(code().includes('api.installUpdate(true)'), 'le forçage a changé de forme').toBe(true);
  });
});
