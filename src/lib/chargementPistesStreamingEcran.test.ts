import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 #1154 — l'ANCIENNE interface applique-t-elle vraiment la décision ?
 *
 * `chargementPistesStreaming.test.ts` prouve le module. Ce témoin-ci garde
 * l'autre moitié, celle qui manque le plus souvent dans ce projet : que
 * `StreamingView.svelte` — l'écran `#streaming` de l'ancienne interface, celui
 * de la capture de Tades — l'appelle, et que les DEUX sorties existent à
 * l'écran. Un module juste et jamais branché laisserait le spinner tourner.
 *
 * Ce fichier lit la SOURCE et n'importe rien de l'écran : monter la vue
 * demanderait tout le graphe de magasins. Chaque assertion découpe le corps de
 * la fonction qu'elle vise, pour qu'un ajout fait ailleurs ne la satisfasse
 * pas à sa place.
 */
const ecran = readFileSync(
  resolve(__dirname, '../components/StreamingView.svelte'),
  'utf-8',
);

/** Le corps d'une fonction de l'écran, du `function` à sa fermeture. */
function corps(nom: string): string {
  // `<T>` sur une fonction générique : l'ancrer sur `(` seul la manquait.
  const d = ecran.search(new RegExp(`function ${nom}\\s*[(<]`));
  expect(d, `${nom} introuvable`).toBeGreaterThanOrEqual(0);
  const f = ecran.indexOf('\n  }', d);
  expect(f).toBeGreaterThan(d);
  return ecran.slice(d, f);
}

describe('StreamingView — le chargement d’une fiche ne peut plus rester muet', () => {
  it('selectAlbum passe par le chargeur borné, et n’attend plus l’API à nu', () => {
    const c = corps('selectAlbum');
    expect(c).toContain('contenuDeLaFiche');
    expect(c).toContain('api.getStreamingAlbumTracks');
    // C'est l'`await` NU qui était le défaut : rien ne le bornait.
    expect(c).not.toMatch(/await\s+api\.getStreamingAlbumTracks/);
  });

  it('le catch muet a disparu des quatre chargeurs de fiche', () => {
    // « Get streaming album tracks error » n'allait qu'à la console. Les trois
    // fiches voisines partageaient le même silence.
    for (const muet of [
      "console.error('Get streaming album tracks error:'",
      "console.error('Get streaming artist albums error:'",
      "console.error('Get streaming playlist tracks error:'",
      "console.error('Get YouTube playlist tracks error:'",
    ]) {
      expect(ecran).not.toContain(muet);
    }
  });

  it('l’échec vide la liste au lieu de garder les pistes de la fiche d’avant', () => {
    expect(corps('selectAlbum')).toMatch(/albumTracks = \[\]/);
    expect(corps('selectArtist')).toMatch(/artistAlbums = \[\]/);
    expect(corps('selectStreamingPlaylist')).toMatch(/playlistTracks = \[\]/);
  });

  it('l’échec est DIT : motif à l’écran et bandeau', () => {
    const c = corps('contenuDeLaFiche');
    expect(c).toContain('erreurPistes = issue.motif');
    expect(c).toContain('notifications.error(issue.motif)');
    // Et le témoin s'éteint sur ce chemin-là aussi, sinon dire l'erreur
    // laisserait quand même le spinner par-dessus.
    expect(c).toContain('loading = false');
  });

  it('la borne est finie, et passée au chargeur', () => {
    expect(ecran).toMatch(/const DELAI_FICHE_MS = [0-9_]+;/);
    expect(corps('contenuDeLaFiche')).toContain('delaiMs: DELAI_FICHE_MS');
  });

  it('une réponse périmée ne touche ni aux pistes ni au témoin', () => {
    const c = corps('contenuDeLaFiche');
    const perimee = c.indexOf("issue.etat === 'perimee'");
    const eteint = c.indexOf('loading = false');
    expect(perimee).toBeGreaterThanOrEqual(0);
    // L'ordre EST la garde : éteindre avant de tester la péremption rendrait
    // le test décoratif.
    expect(eteint).toBeGreaterThan(perimee);
  });

  it('quitter une fiche en cours de chargement annule sa demande', () => {
    // Sans ça, `loading` restait allumé et l'écran du dessous héritait du
    // « Chargement... » d'une fiche déjà fermée.
    expect(corps('goBack')).toContain('annulerDemandeFiche()');
    expect(corps('resetForService')).toContain('annulerDemandeFiche()');
    const c = corps('annulerDemandeFiche');
    expect(c).toContain('demandeFiche++');
    expect(c).toContain('loading = false');
  });

  it('les trois fiches ont bien DEUX sorties dans le gabarit', () => {
    // Autant de branches d'erreur que de branches « Chargement... » : album,
    // playlist de service, discographie.
    const spinners = ecran.split("{#if loading}").length - 1;
    const erreurs = ecran.split('{:else if erreurPistes}').length - 1;
    expect(spinners).toBe(3);
    expect(erreurs).toBe(3);
    expect(ecran).toContain('{@render ficheEnErreur(erreurPistes)}');
    expect(ecran).toContain("{#snippet ficheEnErreur(");
  });

  it('le bloc d’erreur propose de relancer la fiche affichée', () => {
    expect(ecran).toContain('onclick={rechargerFiche}');
    const c = corps('rechargerFiche');
    expect(c).toContain('selectAlbum(selectedAlbum');
  });
});
