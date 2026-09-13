// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#906` — Levente Toth, fil 1436, 15/08/2026 :
//
//   « the What's New section also displays in FR — Tune's language setting
//     is EN. »
//
// Signalé il y a presque un mois. Le fil portait DEUX sujets ; le premier — le
// site mozaiklabs.fr servi en français — a été corrigé et déployé le jour même,
// avec une note disant explicitement du second : « c'est dans Tune, pas sur le
// site. Autre surface, autre correctif ». Aucun ticket ne l'avait repris.
//
// 🔴 LE SERVEUR HONORE DÉJÀ LA LANGUE — le client ne la lui demandait pas
// ------------------------------------------------------------------------
// MESURÉ le 12/09/2026 sur la .18 en v0.9.147 :
//
//   GET /system/changelog                     → lang:"fr", fallback:false
//   GET /system/changelog  (Accept-Language: en) → lang:"fr", fallback:TRUE
//   GET /system/changelog?lang=en             → lang:"fr", fallback:TRUE
//
// La route accepte les deux formes, et chaque entrée porte `lang` plus un
// booléen `fallback` — « je te donne le français faute de mieux ». Le client
// appelait `?limit=10` tout court, et ne lisait ni l'un ni l'autre.
//
// C'est le même motif que #892 : le serveur publie ce qu'il faut, le client
// l'ignore et devine à sa place.
//
// CE QUE CE FICHIER TIENT
// -----------------------
// L'appel porte la langue COURANTE — pas une constante — et le repli est DIT.
// Une note en français chez un anglophone se lit comme un défaut tant que rien
// ne l'explique : c'est littéralement le message de Levente.
//
// CONTRE-ÉPREUVE : le dernier bloc rejoue l'appel d'avant et montre qu'il ne
// portait aucune langue.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = () =>
  readFileSync(resolve(__dirname, '../../components/WhatsNew.svelte'), 'utf8');

describe('#906 — le panneau demande ses notes DANS LA LANGUE DE L’INTERFACE', () => {
  it('🔴 l’appel porte `lang`', () => {
    expect(src()).toContain('lang=${encodeURIComponent(get(locale))}');
  });

  it('la langue vient du MAGASIN, pas d’une constante', () => {
    const s = src();
    expect(s).toContain("import { locale, t } from '../lib/i18n'");
    // ⚠️ Viser l'URL, pas n'importe quel `lang=` : mon premier prédicat
    // matchait `<script lang="ts">` en tête de fichier et sortait rouge sur
    // du code correct. Une garde qui se trompe finit désarmée.
    const url = /changelog\?[^`]*/.exec(s)?.[0] ?? '';
    expect(url, 'l’appel au changelog a disparu').not.toBe('');
    expect(
      /lang=(fr|en|de|es|it|ro|sv|hu|ja|ko|zh)\b/.test(url),
      'une langue est écrite en dur dans l’URL : elle ne suivrait pas le réglage',
    ).toBe(false);
  });

  it('la valeur est ÉCHAPPÉE — une locale ne se concatène pas crue dans une URL', () => {
    expect(src()).toContain('encodeURIComponent(get(locale))');
  });
});

describe('#906 — quand le serveur retombe sur le français, on le DIT', () => {
  it('🔴 `fallback` est lu, entrée par entrée', () => {
    const s = src();
    expect(s).toContain("entries.some((e: any) => e?.fallback === true)");
  });

  it('et il a un site de rendu — sans quoi il ne servirait à rien', () => {
    const s = src();
    expect(s).toContain('{#if notesNonTraduites}');
    expect(s).toContain("$t('whatsnew.notTranslated')");
  });

  it('le bandeau est distinct de l’erreur hors ligne', () => {
    // Ce n'est pas une panne : c'est une absence de traduction. Les confondre
    // ferait croire que les notes n'ont pas pu être chargées.
    const s = src();
    expect(s).toContain('whatsnew-fallback');
    expect(s).toContain('whatsnew-offline');
    expect(s.indexOf('whatsnew-fallback')).toBeLessThan(s.lastIndexOf('whatsnew-offline'));
  });

  it('le message existe dans les onze langues', () => {
    const langues = ['fr','en','de','es','it','ro','sv','hu','ja','ko','zh'];
    for (const l of langues) {
      const loc = readFileSync(resolve(__dirname, '../locales', `${l}.ts`), 'utf8');
      expect(loc.includes('whatsnew.notTranslated'), `${l} n’a pas la clé`).toBe(true);
    }
  });
});

describe('#906 — CONTRE-ÉPREUVE', () => {
  it('l’appel d’avant ne portait aucune langue', () => {
    const avant = '/api/v1/system/changelog?limit=10';
    expect(/lang=/.test(avant), 'le témoin ne reproduit pas l’appel muet').toBe(false);
    // Et le serveur retombait donc sur sa langue par défaut, quelle que soit
    // celle de l'interface — ce que Levente a vu.
    expect(src()).toContain('changelog?limit=10&lang=');
  });
});
