/**
 * #1086 — les pistes de service que le serveur n'a pas su résoudre.
 *
 * Contrat, tune-server-rust#4261 (livré en v0.9.155) : la réponse de
 * `queue_add` porte un champ ADDITIF `unresolved`, absent ou vide quand tout
 * est résolu. La piste est enfilée quand même, sous « Unknown » — l'ajout a
 * réussi, mais le résultat n'est pas celui qu'on croit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resumerNonResolues,
  nommerLesServices,
  texteNonResolues,
} from '../pistesNonResolues';

const traduire = (cle: string) =>
  cle === 'queue.unresolvedWarning'
    ? "{count} piste(s) de {service} n'ont pas pu être résolues."
    : cle === 'queue.unresolvedUnknownService'
      ? 'ce service'
      : cle;

describe('#1086 — le résumé', () => {
  it('rien à dire quand le champ est absent, vide, ou pas un tableau', () => {
    expect(resumerNonResolues(undefined)).toBeNull();
    expect(resumerNonResolues(null)).toBeNull();
    expect(resumerNonResolues([])).toBeNull();
    expect(resumerNonResolues({ source: 'qobuz' })).toBeNull();
    expect(resumerNonResolues('qobuz')).toBeNull();
  });

  it('compte les pistes et dédoublonne services et motifs', () => {
    const r = resumerNonResolues([
      { source: 'qobuz', source_id: '1', error: 'service injoignable' },
      { source: 'qobuz', source_id: '2', error: 'service injoignable' },
      { source: 'tidal', source_id: '3', error: 'compte déconnecté' },
    ]);
    expect(r).toEqual({
      nombre: 3,
      services: ['qobuz', 'tidal'],
      motifs: ['service injoignable', 'compte déconnecté'],
    });
  });

  it('une entrée sans source ni motif compte quand même', () => {
    const r = resumerNonResolues([{ source_id: '9' }]);
    expect(r?.nombre).toBe(1);
    expect(r?.services).toEqual([]);
    expect(r?.motifs).toEqual([]);
  });
});

describe('#1086 — la phrase', () => {
  it('nomme le service, le nombre, et le motif du serveur', () => {
    const txt = texteNonResolues(
      [{ source: 'qobuz', source_id: '1', error: 'service injoignable' }],
      traduire,
    );
    expect(txt).toBe("1 piste(s) de Qobuz n'ont pas pu être résolues. — service injoignable");
  });

  it('plusieurs services sont joints, plusieurs motifs aussi', () => {
    const txt = texteNonResolues(
      [
        { source: 'qobuz', error: 'a' },
        { source: 'tidal', error: 'b' },
      ],
      traduire,
    );
    expect(txt).toContain('Qobuz, Tidal');
    expect(txt).toContain('a · b');
    expect(txt).toContain('2 piste(s)');
  });

  it('sans source, la phrase reste lisible — jamais « undefined »', () => {
    const txt = texteNonResolues([{ source_id: '1' }], traduire);
    expect(txt).toBe("1 piste(s) de ce service n'ont pas pu être résolues.");
    expect(txt).not.toContain('undefined');
  });

  it('sans motif, pas de tiret orphelin', () => {
    const txt = texteNonResolues([{ source: 'qobuz' }], traduire);
    expect(txt?.endsWith('résolues.')).toBe(true);
    expect(txt).not.toContain('—');
  });

  it('rien du tout quand tout est résolu', () => {
    expect(texteNonResolues(undefined, traduire)).toBeNull();
    expect(texteNonResolues([], traduire)).toBeNull();
  });

  it('majuscule au service, et un service inconnu reste tel quel', () => {
    expect(nommerLesServices(['qobuz'], 'ce service')).toBe('Qobuz');
    expect(nommerLesServices([], 'ce service')).toBe('ce service');
  });
});

describe('#1086 — le branchement, une seule fois pour trente appelants', () => {
  const api = readFileSync('src/lib/api.ts', 'utf8');

  it('🔴 `addToQueue` lit `unresolved` et avertit', () => {
    const i = api.indexOf('export async function addToQueue(');
    expect(i).toBeGreaterThan(0);
    const bloc = api.slice(i, api.indexOf('\n}', i));
    expect(bloc).toContain('unresolved');
    expect(bloc).toContain('texteNonResolues(');
    // Contre-épreuve : l'ajout a RÉUSSI — on n'a pas le droit de faire
    // reculer l'appelant.
    expect(bloc).not.toContain('throw');
    // Et la réponse reste celle que les appelants attendent.
    expect(bloc).toContain('return res;');
  });

  it('les deux clés existent en français', () => {
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    expect(fr).toContain('queue.unresolvedWarning');
    expect(fr).toContain('queue.unresolvedUnknownService');
    // Le gabarit porte bien les deux emplacements que la phrase remplace.
    const ligne = fr.split('\n').find((l) => l.includes('queue.unresolvedWarning')) ?? '';
    expect(ligne).toContain('{count}');
    expect(ligne).toContain('{service}');
  });
});
