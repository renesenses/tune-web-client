import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de code : tout réglage DSP écrit doit DIRE s'il a atteint le son.
 *
 * Le serveur répond, sur chaque écriture, si le réglage a touché le flux en
 * cours — `applied_live` (POST /zones/{id}/eq), `eq_applied_live` et
 * `crossfeed_applied_live` (PUT /zones/{id}/dsp). Un appelant qui jette cette
 * réponse produit toujours le même défaut vécu : l'utilisateur pousse un
 * curseur, l'interface reste muette, et rien ne change dans le son. C'est ce
 * silence qui se raconte ensuite comme « l'égaliseur ne fonctionne pas »
 * (#1710, #1725, #1786).
 *
 * Le défaut est revenu trois fois, à trois endroits différents, parce que la
 * règle ne vivait nulle part — seulement dans la mémoire de qui avait corrigé
 * le précédent. Le crossfeed a été le dernier : son `setDsp` écrivait bien le
 * réglage et ignorait ce que le serveur en disait.
 *
 * Jumeau côté web du garde `REGLAGES_A_RAFRAICHIR` de `routes/mod.rs`, qui
 * tient la même règle côté serveur : là-bas, toute route qui ÉCRIT un réglage
 * DSP doit rafraîchir la sortie ; ici, tout appel qui l'écrit doit rapporter
 * la portée. Les deux moitiés d'une même promesse.
 */
describe('garde : un réglage DSP écrit rapporte sa portée', () => {
  const lire = (f: string) =>
    readFileSync(resolve(__dirname, '../../components', f), 'utf-8');

  /**
   * Les écrivains DSP de l'interface, avec le champ de portée que chacun rend
   * et la fonction qui le lit. La garde lisait `EqualizerView.svelte` ; cet
   * écran est parti avec l'ancienne interface (phase 5). La RÈGLE, elle, n'a
   * pas bougé : elle suit ses écrivains ici.
   */
  const ECRIVAINS = [
    { fichier: 'v2/EqualizerV2.svelte', appel: 'api.setEq(', champ: 'applied_live', lecteur: 'reportReach' },
    { fichier: 'v2/CrossfeedV2.svelte', appel: 'api.setDsp(', champ: 'crossfeed_applied_live', lecteur: 'reportReach' },
    { fichier: 'v2/ProfilerV2.svelte', appel: 'api.setDsp(', champ: 'eq_applied_live', lecteur: 'signalerPortee' },
  ];

  for (const { fichier, appel, champ, lecteur } of ECRIVAINS) {
    it(`${fichier} capture la réponse au lieu de la jeter`, () => {
      const source = lire(fichier);
      expect(source.split(appel).length - 1, `${appel} devrait exister dans ${fichier}`).toBeGreaterThan(0);

      // `await api.setDsp(...)` en tête d'instruction = réponse jetée. C'était
      // exactement la forme de `saveCrossfeed()` avant #1710 lot 4.
      const jetes = source.split('\n').filter((l) => {
        const t = l.trim();
        return t.startsWith('await ' + appel) || t.startsWith('void ' + appel);
      });
      expect(
        jetes,
        `${fichier} : réponse jetée — le serveur dit si le réglage a atteint le ` +
          `son, il faut la capturer et la passer à ${lecteur}()`,
      ).toEqual([]);
    });

    it(`${fichier} signale la portée que le serveur lui rend`, () => {
      const source = lire(fichier);
      expect(
        // `atteintLeSon(res?.champ, res?.portee)` compte aussi : il lit le
        // même champ, et d'abord la portée que le serveur dit (#4680).
        new RegExp(`${lecteur}\\((?:atteintLeSon\\()?res\\?\\.${champ}[,)]`).test(source),
        `${champ} n'est lu par aucun ${lecteur}() dans ${fichier}`,
      ).toBe(true);
    });

    it(`${fichier} distingue « faux » de « absent »`, () => {
      const source = lire(fichier);
      // `=== false` et non `!valeur` : un serveur antérieur omet le champ, et
      // on n'affirme rien de ce qu'il ne dit pas. Relâcher ce test ferait
      // annoncer « prendra effet à la piste suivante » à tous les serveurs
      // anciens.
      const corps = source.slice(source.indexOf(`function ${lecteur}(`));
      expect(corps.slice(0, 400)).toContain('=== false');
    });
  }
});

/**
 * La bascule PURE relève de la même règle, et pour une raison plus forte.
 *
 * L'égaliseur et le crossfeed ne promettaient qu'un réglage tardif. PURE
 * promet que RIEN ne touche le signal — et jusqu'à ce que le serveur repousse
 * l'état vers la sortie, le badge s'allume pendant que l'`EqProcessor` filtre
 * encore (#1986). Sur une zone réseau, où le traitement est gravé dans le
 * fichier transcodé, le délai subsiste même après le correctif serveur : le
 * flux doit redémarrer. C'est exactement ce que `applied_live` sert à dire.
 */
describe('garde : la bascule PURE rapporte sa portée', () => {
  const source = readFileSync(
    resolve(__dirname, '../../components/partages/TransportBar.svelte'),
    'utf-8',
  );

  it('la réponse de setAudiophileMode est capturée, pas jetée', () => {
    expect(source).toContain('api.setAudiophileMode(');
    const jetes = source
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return t.startsWith('await api.setAudiophileMode(') || t.startsWith('void api.setAudiophileMode(');
      });
    expect(
      jetes,
      'réponse jetée : le serveur dit si la bascule a atteint le son',
    ).toEqual([]);
  });

  it('applied_live est lu, et « faux » distingué de « absent »', () => {
    expect(
      source.includes('res.applied_live === false'),
      'applied_live n’est lu nulle part : le testeur ne saura pas que PURE ' +
        'n’a pas encore atteint le son',
    ).toBe(true);
    // Un serveur < 0.9.91 n'envoie pas le champ. Le raccourci booléen
    // annoncerait « prendra effet à la piste suivante » à tout le parc.
    expect(source).not.toContain('!res.applied_live');
  });
});
