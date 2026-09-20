/**
 * #987 — « Widgets du menu accueil : il manque les playlists Qobuz (alors que
 * le widget playlist Qobuz est bien présent dans le menu streaming) »
 * (FabienM, fil 1774, point 6).
 *
 * Le catalogue de l'accueil était une CONSTANTE ; celui du Streaming se
 * construit depuis les données (une rangée par catégorie, #3827). L'accueil
 * apprend désormais ces rangées après son montage, et une disposition
 * enregistrée qui les citait les retrouve.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getStreamingFeaturedPlaylistsByTag: vi.fn(),
}));
import * as api from '../api';
import { widgetsCategoriesPlaylists, categoriesPlaylistsPourAccueil } from '../widgetsService';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const GROUPES = [
  { id: 'hi-res', name: 'Hi-Res', playlists: [{ source_id: '1', name: 'A' }] },
  { id: 'vide', name: 'Vide', playlists: [] },
  { id: 'humeurs', name: 'Humeurs', playlists: [{ source_id: '2', name: 'B' }] },
];

describe('#987 — les catégories, partagées entre le Streaming et l’accueil', () => {
  it('une rangée par catégorie non vide, identifiée `<service>-tag-<id>`', () => {
    const w = widgetsCategoriesPlaylists('qobuz', GROUPES);
    expect(w.map((x) => x.id)).toEqual(['qobuz-tag-hi-res', 'qobuz-tag-humeurs']);
    expect(w.every((x) => x.categorie === 'playlists-editoriales')).toBe(true);
  });
  it('l’accueil les demande en UN appel, et un service muet ne rend rien', async () => {
    (api.getStreamingFeaturedPlaylistsByTag as any).mockResolvedValueOnce(GROUPES);
    expect((await categoriesPlaylistsPourAccueil('qobuz')).map((x) => x.id)).toEqual(['qobuz-tag-hi-res', 'qobuz-tag-humeurs']);
    (api.getStreamingFeaturedPlaylistsByTag as any).mockRejectedValueOnce(new Error('401'));
    expect(await categoriesPlaylistsPourAccueil('qobuz')).toEqual([]);
  });
  it('le Streaming passe par la MÊME fonction — pas deux boucles', () => {
    const src = sansCommentaires(lire('src/lib/widgetsService.ts'));
    expect(src).toContain('w.push(...widgetsCategoriesPlaylists(service, groupesPlaylists));');
    expect(src.split('categorie: \'playlists-editoriales\'').length - 1).toBe(1);
  });
});

describe('#987 — branchement : l’accueil apprend, PageWidgets retient', () => {
  it('🔴 HomeV2 demande les catégories et les APPREND à la page — un geste, pas une prop', () => {
    const src = sansCommentaires(lire('src/components/v2/HomeV2.svelte'));
    expect(src).toContain("categoriesPlaylistsPourAccueil('qobuz')");
    expect(src).toContain('page?.apprendreCatalogue(w)');
    expect(src).toMatch(/<PageWidgets salut bind:this=\{page\} \/>/);
  });
  it('🔴 PageWidgets apprend sans EFFET (la boucle de #accueilConfigurable), et restaure la disposition enregistrée', () => {
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    expect(src).toContain('export function apprendreCatalogue(nouveaux: Widget[])');
    expect(src).toContain("dispositionEnregistree = d.filter((id: any) => typeof id === 'string');");
    expect(src).toContain('disposition = dispositionEnregistree.filter((id) => parId(id));');
    const fn = src.slice(src.indexOf('export function apprendreCatalogue'), src.indexOf('for (const id of revenus) chargerWidget(id);'));
    expect(fn).toContain('appris = nouveaux.filter((w) => !catalogue.some((c) => c.id === w.id));');
    expect(fn).toContain('memo.filter((id) => !disposition.includes(id) && parId(id))');
    // `parId` et `disponibles` lisent le catalogue COMPLET, appris compris.
    expect(src).toContain('const catalogueComplet = $derived([...catalogue, ...appris]);');
    expect(src).toContain('const parId = (id: string) => catalogueComplet.find((w) => w.id === id);');
    // #1059 — la répartition a remplacé le filtre en place (déjà posés et
    // identifiants inconnus du catalogue sont désormais nommés, pas tus).
    // Ce qui compte ici est INCHANGÉ : elle lit le catalogue COMPLET.
    expect(src).toContain('const reparti = $derived(repartirWidgets(catalogueComplet, disposition));');
    expect(src).toContain('const disponibles = $derived(reparti.disponibles);');
    // Et aucun effet n'appelle `chargerWidget` — la règle de la page tient.
    expect(/\$effect\(\(\) => \{[^}]*chargerWidget/.test(src)).toBe(false);
  });
});
