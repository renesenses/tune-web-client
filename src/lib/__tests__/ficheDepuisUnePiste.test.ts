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

describe("« Reprendre l'écoute » : identifiant distant et id zéro", () => {
  const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));

  it("l'identifiant est cherché dans `context_id`, pas seulement `source_id`", () => {
    // Mesuré sur le .42 : l'entrée vaut {"id":0,"album_id":null,
    // "context_id":"58698608","context_type":"playlist","source":"qobuz"}.
    // Aucun `source_id` : l'identifiant est dans `context_id`, et ce qu'il
    // désigne dans `context_type`. Les deux étaient ignorés.
    expect(src).toContain("const ctx = champ(o, 'context_id')");
    expect(src).toContain("genre: String(o?.context_type ?? 'album')");
  });

  it('`0` n’est PAS un identifiant local', () => {
    // `0 != null` est vrai : la lecture partait sur `{album_id: 0}`, et la
    // fiche prenait ce zéro pour un album de la bibliothèque — d'où le crayon
    // et les étiquettes sur certains albums Qobuz et pas sur d'autres.
    expect(src).toContain("return typeof v === 'number' && v > 0 ? v : null;");
    expect(src).toContain('idLocalValide(o?.album_id)');
    expect(src, 'le test laxiste est revenu').not.toContain('o?.album_id ?? (sid ? null : o?.id)');
  });

  it('ce que l’identifiant DÉSIGNE prime sur le genre du widget', () => {
    // Une entrée dont le contexte est une playlist ne se joue pas comme un
    // album, et n'ouvre pas une fiche d'album.
    expect(src).toContain("dist.genre === 'playlist' || genre === 'playlist' ? 'playlist'");
    expect(src).toContain("if (idLocal == null && dist && dist.genre !== 'album') return {};");
  });

  it('une piste distante se joue par la PAIRE service + identifiant', () => {
    expect(src).toContain("api.play(z, { source: service as any, source_id: dist.id })");
  });
});
