import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de code pour le bug des catégories éditoriales Qobuz (Dimitri,
 * 0.9.68, fil forum 1372 — issue serveur #2451).
 *
 * « The newly added categories for Qobuz (editor's picks, etc.) do not at
 * first appear when clicking on Sources-->Qobuz. »
 *
 * Le mécanisme : `loadFeatured` affectait `featuredSections` dès le retour de
 * la liste des sections (une liste statique, immédiate côté serveur), puis
 * seulement APRÈS le `Promise.all` — lent à froid sur Qobuz — affectait
 * `featuredData`. Or le gabarit n'affiche les squelettes de chargement que si
 * `featuredSections` est vide, et n'affiche une section que si sa donnée est
 * là. Entre les deux affectations : ni squelettes, ni sections — une page qui
 * a l'air finie et vide. Les catégories « surgissaient » ensuite, par exemple
 * au retour d'un aller-retour par Genres.
 *
 * L'invariant protégé ici : les intitulés et leurs données sont publiés
 * ENSEMBLE, dans la garde `service === s` — jamais l'un sans l'autre, jamais
 * pour un service qui n'est plus affiché. Et le drapeau de chargement ne
 * retombe que pour le service encore affiché, sinon un changement rapide de
 * service rouvrirait la même fenêtre vide.
 *
 * Reste en environnement `node` : il ne lit que du texte.
 */
describe('StreamingView publie sections et données éditoriales ensemble', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  // Bornes du corps de loadFeatured. Sans ces vérifications, une tranche vide
  // rendrait toutes les assertions vertes sans rien avoir examiné.
  const start = source.indexOf('async function loadFeatured');
  const end = source.indexOf('\n  }', start);

  it('loadFeatured existe et son corps est délimitable', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  const body = source.slice(start, end);

  it('les intitulés ne sont pas publiés avant les données', () => {
    // Le bug : `featuredSections = sections;` avant le `Promise.all`,
    // éteignant les squelettes alors que rien n'est encore affichable.
    const beforeAll = body.slice(0, body.indexOf('await Promise.all'));
    expect(body).toContain('await Promise.all');
    expect(beforeAll).not.toMatch(/featuredSections\s*=/);
  });

  it('intitulés et données sont affectés ensemble, sous la garde service === s', () => {
    const guard = body.indexOf('if (service === s)');
    expect(guard).toBeGreaterThan(-1);
    const guardBlock = body.slice(guard, body.indexOf('\n      }', guard));
    expect(guardBlock).toMatch(/featuredSections\s*=/);
    expect(guardBlock).toMatch(/featuredData\s*=/);
  });

  it('le drapeau de chargement ne retombe que pour le service affiché', () => {
    // Sans cette garde, l'appel périmé d'un service quitté éteindrait les
    // squelettes du service courant en plein chargement — même fenêtre vide,
    // par une autre porte.
    expect(body).toMatch(/if \(service === s\)\s*featuredLoading = false/);
  });
});
