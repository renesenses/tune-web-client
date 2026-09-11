/**
 * #2778 — « v0.9.121 Bandcamp Ma collection : divers bugs ».
 *
 * FabienM, fil forum 1606, 29/08/2026 : « Je lie mon compte et ça affiche bien
 * mes contenus mais quand je quitte le menu Bandcamp et quand je reviens mon
 * compte n'est plus actif, je suis obligé de ressaisir mon identifiant » —
 * puis, à la question posée sur le fil : « La perte de l'identifiant survient
 * dans la même session. »
 *
 * La liaison n'a JAMAIS été perdue. Le greffon écrit `bandcamp_username` et
 * `bandcamp_fan_id` dans la table `settings` ; elle survit au redémarrage du
 * serveur. C'est l'AFFICHAGE qui la perdait : le formulaire s'affiche sur
 * `analyse`, une variable de composant, et `App.svelte` démonte l'écran dès
 * qu'on le quitte — y revenir en construit un neuf, donc `analyse = false`.
 *
 * L'état est lisible par une route depuis la v0.9.132 —
 * `GET /api/v1/streaming/bandcamp/status`, ouverte par l'inscription de
 * Bandcamp au registre des services. Mesure aux tags :
 *
 *     v0.9.132 : status route=1  bandcamp_registre=1
 *     v0.9.144 : status route=1  bandcamp_registre=1
 *     v0.9.145 : status route=1  bandcamp_registre=1
 *
 * Le client ne l'appelait pas. Second volet du même fil, requalifié par
 * Bertrand le 29/08 : « ce qui manque, ce n'est pas la lecture pour Bandcamp,
 * c'est la lecture depuis Ma collection » — l'écran n'y offrait qu'un lien
 * `target="_blank"` vers bandcamp.com.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RACINE = resolve(__dirname, '../..');
const ECRAN = readFileSync(resolve(RACINE, 'components/BandcampView.svelte'), 'utf8');
const CODE = ECRAN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Le marquage seul : ce que l'auditeur voit vraiment. */
const MARQUAGE = CODE.slice(CODE.indexOf('</script>'), CODE.indexOf('<style>'));

describe('#2778 — l’identifiant lié vient du SERVEUR, pas de la mémoire de l’écran', () => {
  it('🔴 l’écran interroge la route d’état de liaison', () => {
    // Aiguille assemblée : jamais en clair dans un fichier qui s'inspecte.
    const route = ['getStreamingService', 'Status'].join('');
    expect(CODE).toContain(route);
    expect(CODE).toContain("'bandcamp'");
  });

  it('🔴 le formulaire de saisie ne réapparaît plus quand un compte est lié', () => {
    // C'est la condition d'affichage du bloc « lier mon compte ».
    const bloc = /\{#if mode === 'collection' && !analyse([^}]*)\}/.exec(MARQUAGE);
    expect(bloc, 'le bloc de liaison doit exister').not.toBeNull();
    expect(bloc![1]).toContain('!pseudoLie');
  });

  it('le compte lié est NOMMÉ à l’écran, et se change à la demande', () => {
    expect(MARQUAGE).toContain('bandcamp.linkedAs');
    expect(MARQUAGE).toContain('bandcamp.changeAccount');
    expect(CODE).toContain('function changer_de_compte');
  });
});

describe('#2778 — « Ma collection » se joue au lieu de renvoyer sur bandcamp.com', () => {
  it('🔴 chaque album de la collection porte un vrai bouton de lecture', () => {
    // Avant : `<li>` + deux `<span>` + un `<a target="_blank">`. Aucun
    // `<button>`, aucun gestionnaire de clic — le geste n'existait pas.
    expect(MARQUAGE).toContain('jouer_collection(r.article)');
    expect(MARQUAGE).toContain('bandcamp.playAlbum');
  });

  it('la pochette résolue par le serveur est affichée', () => {
    // `collection_mise_en_forme` la sert depuis la v0.9.145 (champ `pochette`).
    expect(MARQUAGE).toContain('r.article.pochette');
  });

  it('le lien « Ouvrir sur Bandcamp » reste — on ajoute, on ne retire pas', () => {
    expect(MARQUAGE).toContain('bandcamp.openOnBandcamp');
  });
});

describe('#2702 / #2778 — les trois clefs neuves existent dans les onze locales', () => {
  const CLEFS = ['bandcamp.playAlbum', 'bandcamp.linkedAs', 'bandcamp.changeAccount'];
  const LOCALES = readdirSync(resolve(RACINE, 'lib/locales'))
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''));

  it('le client parle bien onze langues — le hongrois n’existe que côté client', () => {
    expect(LOCALES.length, `locales trouvées : ${LOCALES.join(', ')}`).toBe(11);
    expect(LOCALES).toContain('hu');
  });

  for (const cle of CLEFS) {
    it(`« ${cle} » est traduite dans les onze`, () => {
      const manquantes = LOCALES.filter((langue) => {
        const source = readFileSync(resolve(RACINE, `lib/locales/${langue}.ts`), 'utf8');
        return !source.includes(`'${cle}'`);
      });
      // Une clef absente retombe silencieusement sur autre chose : l'auditeur
      // verrait la clef brute, ou un texte d'une autre langue.
      expect(manquantes, `clef absente de : ${manquantes.join(', ')}`).toEqual([]);
    });
  }

  it('« linkedAs » porte bien le gabarit {pseudo} partout', () => {
    for (const langue of LOCALES) {
      const source = readFileSync(resolve(RACINE, `lib/locales/${langue}.ts`), 'utf8');
      const ligne = source.split('\n').find((l) => l.includes("'bandcamp.linkedAs'")) ?? '';
      expect(ligne, `${langue} : ${ligne}`).toContain('{pseudo}');
    }
  });
});
