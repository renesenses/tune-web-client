import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { ficheAlbumService } from '../stores/streaming';

describe('#1114 — la pochette suit l’album ouvert depuis Lecture en cours', () => {
  beforeEach(() => ficheAlbumService.set(null));

  it('le magasin retient la pochette, et son absence reste licite', () => {
    ficheAlbumService.set({ service: 'qobuz' as never, id: '42', titre: 'Half-Told Tales', pochette: '/art/x.jpg' });
    expect(get(ficheAlbumService)?.pochette).toBe('/art/x.jpg');
    // Un appelant qui n'en a pas ouvre quand même : le champ est optionnel.
    ficheAlbumService.set({ service: 'qobuz' as never, id: '42', titre: 'Sans image' });
    expect(get(ficheAlbumService)?.pochette ?? null).toBeNull();
  });

  it('« Lecture en cours » la transmet — elle l’a déjà sous la main', () => {
    const src = readFileSync('src/components/partages/NowPlaying.svelte', 'utf8');
    // Le geste vers un album de SERVICE doit porter la pochette : on lit le
    // bloc de l'appel jusqu'à son accolade fermante, pas un nombre de
    // caractères au jugé — un commentaire de plus l'aurait fait mentir.
    const debut = src.indexOf('gestesService.ouvrirAlbum({');
    expect(debut, "l'appel a disparu de « Lecture en cours »").toBeGreaterThan(-1);
    const bloc = src.slice(debut, src.indexOf('});', debut));
    expect(bloc).toContain('pochette:');
  });

  it('la coquille la range puis la passe à la fiche, sous le nom qu’elle lit', () => {
    const src = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');
    expect(src).toContain('pochette: c.pochette ?? null');
    // `AlbumDetailV2` lit `cover_path` : c'est CE nom qui doit arriver.
    expect(src).toContain('cover_path: $ficheAlbumService.pochette ?? null');
  });

  it('le contrat de navigation déclare le champ comme optionnel', () => {
    const src = readFileSync('src/lib/stores/navigation.ts', 'utf8');
    expect(src).toMatch(/ouvrirAlbum: \(cible: \{[^}]*pochette\?: string \| null[^}]*\}\) => void/);
  });
});
