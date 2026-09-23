import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Demande de Bertrand (22/09/2026) : d'abord « adapte la représentation des
 * playlists avec 4 covers », puis « harmonise la présentation des smart
 * playlists idem smart collections ».
 *
 * La carte d'une playlist intelligente est donc désormais CELLE d'une
 * collection intelligente (`v2/CollectionsV2`, onglet « smart ») : liseré de
 * teinte dérivée du nom, grande vignette enveloppée de `PochetteActions`, bloc
 * `.meta`, rail A-Z et tri mémorisé.
 *
 * Une playlist intelligente n'a pas de pochette à elle : son contenu est
 * calculé. Les images viennent de ses PISTES, comme dans `PlaylistsV2` et le
 * gestionnaire de playlists — et le compte affiché se MESURE sur la même
 * réponse, faute d'un champ que le serveur rendrait.
 */
describe('Smart playlists : la carte est celle des smart collections', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');
  const vue = lire('components/v2-heritage/SmartPlaylistsView.svelte');
  const collections = lire('components/v2/CollectionsV2.svelte');
  const fr = lire('lib/locales/fr.ts');

  /** Le balisage de la LISTE seul : la fiche d'une playlist ouverte porte ses
   *  propres boutons, et les confondre validerait la mauvaise moitié. */
  const liste = vue.slice(vue.indexOf('<!-- List view -->'));

  it('la vignette porte la mosaïque, ou la pochette unique selon la préférence', () => {
    expect(vue).toContain("import MosaiquePochettes from '../v2/MosaiquePochettes.svelte'");
    // Le MÊME interrupteur que les collections (Réglages → Affichage) : sinon
    // deux écrans harmonisés se sépareraient au premier réglage.
    expect(liste).toContain('{#if $preferences.v2CollectionsMosaique}');
    expect(collections).toContain('{#if $preferences.v2CollectionsMosaique}');
    expect(liste).toContain('<MosaiquePochettes pochettes={mosaiques[sp.id] ?? []}');
    expect(liste).toMatch(/<AlbumArt coverPath=\{mosaiques\[sp\.id\]\?\.\[0\] \?\? null\}/);
  });

  it('les pochettes viennent des PISTES, dédoublonnées par le même utilitaire', () => {
    expect(vue).toContain("import { quatreDistinctes } from '../../lib/mosaique'");
    expect(vue).toContain('api.getSmartPlaylistTracks(id)');
    expect(vue).toContain('quatreDistinctes(');
  });

  it('elles se chargent APRÈS la liste, et une seule fois par playlist', () => {
    // Chaque vignette recalcule la sélection côté serveur : la grille ne doit
    // rien attendre, et une playlist ne doit pas être redemandée à chaque
    // re-rendu.
    expect(vue).toContain('void chargerMosaiques(smartPlaylists)');
    expect(vue).toContain('mosaiquesDemandees');
    expect(vue).toContain('Promise.allSettled');
    const charge = vue.indexOf('smartPlaylists = await api.getSmartPlaylists()');
    const mosaique = vue.indexOf('void chargerMosaiques(smartPlaylists)');
    expect(charge).toBeGreaterThan(-1);
    expect(mosaique).toBeGreaterThan(charge);
  });

  it('le compte affiché est MESURÉ sur les pistes rendues, jamais 0 par défaut', () => {
    // Aucun champ ne le porte : `/library/smart-playlists` ne rend pas de
    // `track_count`. On compte donc ce que le serveur a rendu.
    expect(vue).toMatch(/comptes = \{ \.\.\.comptes, \[id\]: \(pistes \?\? \[\]\)\.length \}/);
    // « … » tant que la mesure n'est pas faite : « 0 » ferait passer une
    // playlist pleine pour une playlist vide.
    expect(liste).toContain("comptes[sp.id] != null ? `${comptes[sp.id]} ${$tr('common.tracks')}` : '…'");
    // Changer les règles change le contenu : la mesure et la mosaïque sont
    // oubliées, sinon la carte garderait les anciennes.
    expect(vue).toContain('function oublierContenu(');
    expect(vue).toMatch(/oublierContenu\(editingSp\.id\)/);
  });

  it('les CINQ gestes sont sur la pochette, pas sur la bande', () => {
    expect(vue).toContain("import PochetteActions from '../v2/PochetteActions.svelte'");
    expect(liste).toContain('onEditer={() => startEdit(sp)}');
    expect(liste).toContain('onLire={() => lireSmartPlaylist(sp)}');
    expect(liste).toContain('onOuvrir={() => selectSp(sp)}');
    expect(liste).toContain('faire: () => void handleDelete(sp),');
    // 🔄 RENVERSÉE le 23/09/2026 (#4798). Cette garde exigeait l'ABSENCE du
    // cœur et des étiquettes : le serveur ne connaissait pas ce type d'objet,
    // et un bouton qui mène à un refus vaut moins qu'un bouton absent. Depuis
    // renesenses/tune-server-rust#4798, `smart_playlist` est étiquetable et
    // favorisable — Bertrand veut les cinq gestes, comme sur les smart
    // collections. La garde exige donc désormais leur PRÉSENCE, et sous leur
    // propre type : `smartPlaylistId` et `smart_playlist`, jamais
    // `playlistId`/`playlist`, dont l'espace d'identifiants recouvre le leur.
    expect(liste).toContain('favori={{ smartPlaylistId: sp.id }}');
    expect(liste).toContain('etiquettes={cibleSmartPlaylist(sp.id)}');
    expect(liste).not.toContain('playlistId: sp.id');
    expect(lire('lib/favorisLocaux.ts')).toContain('smartPlaylistId');
    expect(lire('lib/cibleEtiquette.ts')).toContain("itemType: 'smart_playlist'");
    // L'ancienne croix « × », qui supprimait sans rien demander à portée de
    // pouce d'une carte entièrement cliquable, a disparu.
    expect(liste).not.toContain('class="del"');
    expect(vue).toContain("dialogs.confirm(question, { danger: true })");
  });

  it('la carte porte le liseré de teinte et le bloc meta des collections', () => {
    // La teinte est DÉRIVÉE du nom, par la même formule que CollectionsV2 :
    // une playlist garde sa couleur d'une session à l'autre sans rien stocker.
    const formule = 'h = (h * 31 + nom.charCodeAt(i)) % 360';
    expect(vue).toContain(formule);
    expect(collections).toContain(formule);
    expect(liste).toContain('<div class="card" data-lettre={initiale(sp.name)} style="--teinte:{teinte(sp.name)}">');
    expect(liste).toContain('<span class="cv teintee">');
    // Ancré sur le bouton, pas sur sa ligne entière : l'infobulle qui porte
    // désormais le résumé des règles ne doit pas faire échouer la garde.
    expect(liste).toContain('<button class="meta" onclick={() => selectSp(sp)}');
    // Le résumé des règles ne disparaît pas : c'est ce qui dit POURQUOI ces
    // pistes-là sont dedans.
    // Le résumé des règles a quitté la carte (Bertrand : « cache la ») : il ne
    // vit plus que dans l'infobulle du bloc meta, gardée par le test dédié.
    expect(liste).toContain('ruleSummary(sp)');
  });

  it('le rail A-Z et le tri sont ceux des collections, et le tri est mémorisé', () => {
    expect(vue).toContain("import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran'");
    expect(vue).toContain("lireChoix<Tri>('v2.smartplaylists.tri', TRIS, 'nom')");
    expect(vue).toContain("lireChoix<Sens>('v2.smartplaylists.sens', SENS, 'asc')");
    expect(vue).toContain("ecrireChoix('v2.smartplaylists.tri', tri)");
    expect(vue).toContain("ecrireChoix('v2.smartplaylists.sens', sens)");
    expect(vue).toContain("const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')");
    expect(liste).toContain('onclick={() => sauterAListe(L)}');
    // ⚠️ Le rail ne paraît QUE sur le tri par nom : rangée par nombre de
    // pistes, une lettre ne désigne aucune position.
    expect(vue).toContain("const railListe = $derived(tri === 'nom')");
    expect(liste).toContain('{#if railListe && smartPlaylists.length > 0}');
  });

  it('les clés ajoutées existent dans les 11 langues', () => {
    const langues = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const cle of ['smartPlaylists.deleteAsk', 'smartPlaylists.sortName', 'smartPlaylists.sortTracks']) {
      for (const l of langues) {
        expect(lire(`lib/locales/${l}.ts`), `${cle} absente de ${l}`).toContain(`"${cle}"`);
      }
    }
    // La question de suppression NOMME la playlist visée.
    expect(fr).toMatch(/"smartPlaylists\.deleteAsk": "[^"]*\{nom\}/);
    expect(vue).toContain("$tr('smartPlaylists.deleteAsk').replace('{nom}', sp.name ?? '')");
  });

  it('une playlist SANS règle dit son critère, pas « aucune règle »', () => {
    // Trois des six playlists du .18 n'ont aucune règle (« 50 Random Tracks »,
    // « Most Played », « Recently Added ») : leur sélection tient dans leur
    // tri et leur plafond, que le serveur porte (`sort_by`, `max_tracks`).
    expect(vue).toContain('function critereSansRegle(');
    expect(vue).toMatch(/if \(!rules\.length\) return critereSansRegle\(sp\);/);
    expect(vue).toContain("play_count: 'smartPlaylists.sortPlayCount'");
    expect(vue).toContain("smartPlaylists.sortAdded");
    // Un tri que la table ne connaît pas se montre tel quel, il ne disparaît pas.
    expect(vue).toContain('LIBELLE_TRI[tri] ? $tr(LIBELLE_TRI[tri] as any) : tri');
  });

  it('la carte ne MONTRE pas la règle : elle vit dans l’infobulle', () => {
    // Bertrand, 22/09/2026 : « Ne display pas la règle !! cache la ».
    expect(vue).not.toContain('class="cr"');
    expect(vue).toContain('title={`${sp.name} — ${ruleSummary(sp)}`}');
  });
});
