import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe("Un identifiant de PISTE n'ouvre pas un album (Bertrand, 05/09/2026)", () => {
  const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));

  it('les deux signaux sont testés', () => {
    // La ligne d'historique dit tout : `source_id` désigne la PISTE,
    // `context_type` vaut `track`, et l'album n'a AUCUN identifiant. La fiche
    // demandait `/streaming/qobuz/albums/<id de piste>/tracks` → 502.
    expect(src).toContain("o?.context_type === 'track'");
    expect(src).toContain('!!titreAlbum && !!titre && titreAlbum !== titre');
    expect(src).toContain('if (estUnePiste) return {};');
  });

  it("le garde ne s'applique QU'aux objets de service", () => {
    // Un album LOCAL porte un vrai identifiant d'album : le neutraliser
    // priverait d'ouverture des tuiles qui marchent.
    const i = src.indexOf('const estUnePiste');
    expect(src.slice(0, i)).toContain('if (idLocal == null) {');
  });

  it('la LECTURE, elle, reste offerte', () => {
    // Elle passe la paire service + identifiant de piste, que le serveur sait
    // apparier. Mieux vaut un geste absent qu'un écran vide — pas deux gestes
    // absents.
    expect(src).toContain("jouer: geste(o, service, opts.genre ?? 'album')");
  });
});
