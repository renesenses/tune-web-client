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
  const source = readFileSync(
    resolve(__dirname, '../../components/EqualizerView.svelte'),
    'utf-8',
  );

  /** Les appels d'écriture DSP, avec le champ de portée que chacun rend. */
  const ECRITURES = [
    { appel: 'api.setEq(', champ: 'applied_live' },
    { appel: 'api.setDsp(', champ: 'applied_live' },
  ];

  it('chaque appel d’écriture capture la réponse du serveur', () => {
    for (const { appel } of ECRITURES) {
      const occurrences = source.split(appel).length - 1;
      expect(occurrences, `${appel} devrait exister dans EqualizerView`).toBeGreaterThan(0);

      // `await api.setDsp(...)` sans affectation = réponse jetée. C'était
      // exactement la forme de `saveCrossfeed()` avant #1710 lot 4.
      const jetes = source.split('\n').filter((l) => {
        const t = l.trim();
        return t.startsWith('await ' + appel) || t.startsWith('void ' + appel);
      });
      expect(
        jetes,
        `${appel} : réponse jetée — le serveur dit si le réglage a atteint le son, ` +
          `il faut la capturer et appeler signalerPortee()`,
      ).toEqual([]);
    }
  });

  it('la portée est effectivement signalée pour chaque champ rendu', () => {
    // Les trois champs que le serveur peut rendre. Aucun ne doit rester sans
    // lecteur : un champ ajouté côté serveur et jamais lu ici, c'est le même
    // silence qui recommence.
    for (const champ of ['applied_live', 'eq_applied_live', 'crossfeed_applied_live']) {
      expect(
        source.includes(`signalerPortee(res?.${champ})`),
        `${champ} n'est lu par aucun signalerPortee() dans EqualizerView`,
      ).toBe(true);
    }
  });

  it('signalerPortee distingue « faux » de « absent »', () => {
    // `=== false` et non `!valeur` : un serveur antérieur omet le champ, et on
    // n'affirme rien de ce qu'il ne dit pas. Relâcher ce test ferait annoncer
    // « prendra effet à la piste suivante » à tous les serveurs anciens.
    expect(source).toContain('appliqueAChaud === false');
    expect(source).not.toContain('if (!appliqueAChaud');
  });
});
