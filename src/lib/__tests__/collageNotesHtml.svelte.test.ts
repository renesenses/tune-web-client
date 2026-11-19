// @vitest-environment jsdom
//
// « Mes notes » : coller un extrait de page web (`text/html`) le convertit en
// Markdown (demande de Ralph_Cramden sur ASR, validée le 19/11/2026).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import MesNotes from '../../components/partages/MesNotes.svelte';
import { adresseCollee, htmlVersMarkdown } from '../htmlVersMarkdown';
import { rendreMarkdownSur } from '../markdownSur';
import { oublierSondageNotes } from '../api';

/** Un extrait tel que Wikipédia le met dans le presse-papiers. */
const WIKIPEDIA = `<meta charset="utf-8"><p><b>Kind of Blue</b> est un album de <a href="/wiki/Jazz" title="Jazz">jazz</a>
de <a href="/wiki/Miles_Davis" title="Miles Davis">Miles Davis</a>, sorti en <a href="/wiki/1959_en_musique">1959</a>
chez <i>Columbia Records</i> au <abbr>XX</abbr><sup>e</sup> siècle<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup>.</p>
<h2><span class="mw-headline">Musiciens</span><span class="mw-editsection">[<a href="/w/index.php?action=edit">modifier</a>]</span></h2>
<ul><li><a href="/wiki/Miles_Davis">Miles Davis</a> : trompette</li><li>John Coltrane : saxophone ténor</li></ul>
<style>.x{color:red}</style><script>pirate(1)</script><img src="https://exemple.test/x.png" onerror="pirate(2)">`;

describe('htmlVersMarkdown — conversion', () => {
  it('Wikipédia avec source connue : liens relatifs rendus absolus, gras, italique, titre, liste', () => {
    const md = htmlVersMarkdown(`<base href="https://fr.wikipedia.org/wiki/Kind_of_Blue">${WIKIPEDIA}`);
    expect(md).toBe(
      '**Kind of Blue** est un album de [jazz](https://fr.wikipedia.org/wiki/Jazz) de '
      + '[Miles Davis](https://fr.wikipedia.org/wiki/Miles_Davis), sorti en '
      + '[1959](https://fr.wikipedia.org/wiki/1959_en_musique) chez *Columbia Records* au XXe siècle.\n\n'
      + '## Musiciens\n\n'
      + '- [Miles Davis](https://fr.wikipedia.org/wiki/Miles_Davis) : trompette\n'
      + '- John Coltrane : saxophone ténor',
    );
  });

  it('source donnée par l’en-tête Windows `SourceURL:` ou par l’option', () => {
    const cf = 'Version:0.9\r\nSourceURL:https://fr.wikipedia.org/wiki/X\r\n<html><body><a href="/wiki/Jazz">jazz</a></body></html>';
    expect(htmlVersMarkdown(cf)).toBe('[jazz](https://fr.wikipedia.org/wiki/Jazz)');
    expect(htmlVersMarkdown('<a href="/wiki/Jazz">jazz</a>', { adresseSource: 'https://en.wikipedia.org/' }))
      .toBe('[jazz](https://en.wikipedia.org/wiki/Jazz)');
  });

  it('source inconnue : liens relatifs ignorés (libellé seul), absolus gardés', () => {
    const md = htmlVersMarkdown(WIKIPEDIA)!;
    expect(md).toContain('**Kind of Blue** est un album de jazz de Miles Davis, sorti en 1959 chez *Columbia Records* au XXe siècle.');
    expect(md).not.toContain('](');
    expect(htmlVersMarkdown('<p>Voir <a href="https://www.discogs.com/fr/release/1">Discogs</a></p>'))
      .toBe('Voir [Discogs](https://www.discogs.com/fr/release/1)');
    expect(htmlVersMarkdown('<a href="http://exemple.test/a b(c)">x</a>')).toBe('[x](http://exemple.test/a%20b%28c%29)');
  });

  it('liens `javascript:`, `data:`, `vbscript:` neutralisés, même avec une source', () => {
    for (const href of ['javascript:pirate(1)', ' JaVaScRiPt:pirate(1)', 'java\tscript:pirate(1)',
      'data:text/html,<script>pirate(1)</script>', 'vbscript:pirate(1)', '//evil.test/x']) {
      const md = htmlVersMarkdown(`<p><b>Clic</b> <a href="${href.replace(/"/g, '&quot;')}">ici</a></p>`)!;
      expect(md).toBe('**Clic** ici');
      expect(adresseCollee(href, null)).toBeNull();
    }
    expect(adresseCollee('javascript:pirate(1)', 'https://fr.wikipedia.org/')).toBeNull();
    expect(adresseCollee('/x', 'javascript:pirate(1)')).toBeNull();
  });

  it('listes numérotées (avec `start`), imbriquées, citations, paragraphes', () => {
    expect(htmlVersMarkdown('<ol start="3"><li>So What</li><li><i>Freddie</i> Freeloader<ul><li>prise 2</li></ul></li></ol>'))
      .toBe('3. So What\n4. *Freddie* Freeloader\n   - prise 2');
    expect(htmlVersMarkdown('<blockquote><p>Une <b>œuvre</b> majeure.</p><p>Deuxième.</p></blockquote><p>Après.</p>'))
      .toBe('> Une **œuvre** majeure.\n>\n> Deuxième.\n\nAprès.');
  });

  it('aucun HTML brut : balises en texte échappées, scripts, styles, images et attributs ignorés', () => {
    const md = htmlVersMarkdown('<p onclick="x()"><b>Gras</b> &lt;script&gt;pirate(1)&lt;/script&gt; <img src=x onerror=pirate(1)> [lien](javascript:pirate(1))</p><script>pirate(2)</script><style>p{}</style><iframe src="https://x"></iframe>')!;
    expect(md).toBe('**Gras** \\<script\\>pirate(1)\\</script\\> \\[lien\\](javascript:pirate(1))');
    const html = rendreMarkdownSur(md);
    expect(html).not.toMatch(/<script|<img|<iframe|onerror|onclick|href="javascript/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('débuts de ligne et caractères Markdown du texte collé protégés', () => {
    expect(htmlVersMarkdown('<p><b>a</b></p><p># pas un titre</p><p>- pas une liste</p><p>1. pas numéroté</p><p>> pas cité</p><p>snake_case *x* `c`</p>'))
      .toBe('**a**\n\n\\# pas un titre\n\n\\- pas une liste\n\n1\\. pas numéroté\n\n\\> pas cité\n\nsnake_case \\*x\\* \\`c\\`');
  });

  it('tableau simple en lignes, tableau complexe ignoré, bloc de code gardé tel quel', () => {
    expect(htmlVersMarkdown('<b>T</b><table><tr><th>Titre</th><th>Durée</th></tr><tr><td>So What</td><td>9:22</td></tr></table>'))
      .toBe('**T**\n\nTitre · Durée\n\nSo What · 9:22');
    expect(htmlVersMarkdown('<b>T</b><table><tr><td colspan="2">fusion</td></tr></table>')).toBe('**T**');
    expect(htmlVersMarkdown('<b>T</b><pre>- a\n  # b</pre>')).toBe('**T**\n\n```\n- a\n  # b\n```');
  });

  it('sans mise en forme utile : null, le navigateur colle le texte brut', () => {
    expect(htmlVersMarkdown('<meta charset="utf-8"><span style="font-weight:bold">du texte</span>')).toBeNull();
    expect(htmlVersMarkdown('<p>un</p><p>deux</p>')).toBeNull();
    expect(htmlVersMarkdown('')).toBeNull();
  });
});

// ── Le composant ────────────────────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  oublierSondageNotes();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = new URL(String(url), 'http://tune.test').pathname.replace(/^\/api\/v1/, '');
    if (/^\/library\/notes\/artist\/7$/.test(p)) {
      return new Response(JSON.stringify({ item_type: 'artist', item_id: 7, texte_md: 'Avant. Après.', maj_le: 'x' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ count: 0, notes: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function saisieOuverte(): Promise<HTMLTextAreaElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MesNotes, { target: hote, props: { type: 'artist', id: 7 } });
  flushSync();
  await attendre();
  hote.querySelector<HTMLButtonElement>('[data-mes-notes-modifier]')!.click();
  flushSync();
  return hote.querySelector<HTMLTextAreaElement>('[data-mes-notes-saisie]')!;
}

function coller(zone: HTMLTextAreaElement, donnees: Record<string, string>): Event {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => donnees[t] ?? '' } });
  zone.dispatchEvent(e);
  flushSync();
  return e;
}

describe('« Mes notes » — collage d’une page web', () => {
  it('le HTML collé arrive en Markdown, à la position du curseur', async () => {
    const zone = await saisieOuverte();
    expect(zone.value).toBe('Avant. Après.');
    zone.setSelectionRange(7, 7);
    const e = coller(zone, {
      'text/plain': 'Miles Davis trompette',
      'text/html': '<base href="https://fr.wikipedia.org/wiki/A"><a href="/wiki/Miles_Davis">Miles Davis</a> <b>trompette</b> <a href="javascript:pirate(1)">piège</a>',
    });
    expect(e.defaultPrevented).toBe(true);
    expect(zone.value).toBe('Avant. [Miles Davis](https://fr.wikipedia.org/wiki/Miles_Davis) **trompette** piègeAprès.');
    expect(zone.selectionStart).toBe(zone.value.indexOf('Après.'));
    // Enregistré tel quel : le brouillon lié suit la zone.
    hote!.querySelector<HTMLButtonElement>('[data-mes-notes-enregistrer]')!.click();
    await attendre();
    const put = (fetch as any).mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
    expect(JSON.parse(put[1].body).texte_md).toContain('[Miles Davis](https://fr.wikipedia.org/wiki/Miles_Davis) **trompette**');
  });

  it('contre-épreuve : texte simple ou Markdown collé = collage natif, rien d’intercepté', async () => {
    const zone = await saisieOuverte();
    zone.setSelectionRange(7, 7);
    const simple = coller(zone, { 'text/plain': '**déjà** du [Markdown](https://x.test)' });
    expect(simple.defaultPrevented).toBe(false);
    const sansForme = coller(zone, { 'text/plain': 'brut', 'text/html': '<span>brut</span>' });
    expect(sansForme.defaultPrevented).toBe(false);
    expect(zone.value).toBe('Avant. Après.');
  });
});
