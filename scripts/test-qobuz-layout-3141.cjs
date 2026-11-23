// Mesure Chromium du CSS réel de SettingsV2 sur une carte synthétique.
// Prérequis : Playwright et son Chromium (NODE_PATH possible hors dépôt).
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const source = fs.readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  const css = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  const browser = await chromium.launch({headless:true});
  let count=0; const failures=[];
  try {
    const page = await browser.newPage();
    for (const width of [320,480,600,640,720,800,1280]) {
      for (const scale of [1,1.4]) {
        for (const [status,active] of [['NON CONNECTÉ','Actif'],['DISABLED','Active'],['CONNECTÉ · DÉSACTIVÉ','Actif']]) {
          await page.setViewportSize({width,height:480});
          await page.setContent(`<style>:root{--v2-txt-echelle:${scale};--v2-sans:Arial;--v2-mono:monospace;--v2-line2:#555;--v2-txt2:#aaa;--v2-txt3:#aaa;--v2-danger:#f66}*{box-sizing:border-box}body{margin:8px;background:#171717;color:#eee;font-family:Arial}${css}</style>
            <div class="svclist"><div class="svc"><div class="sname">qobuz<span class="sst">${status}</span></div><label class="svcon"><input type="checkbox"><span>${active}</span></label><div class="inline"><input class="txt" placeholder="Identifiant"><input class="txt" placeholder="Mot de passe"><button class="lnk">Connexion</button></div></div></div>`);
          const measurement = await page.evaluate(() => {
            const badge=document.querySelector('.sst'), toggle=document.querySelector('.svcon'), name=document.querySelector('.sname');
            const b=badge.getBoundingClientRect(), t=toggle.getBoundingClientRect();
            const range=document.createRange();range.selectNodeContents(badge);
            const lines=new Set(Array.from(range.getClientRects()).map(r=>Math.round(r.top))).size;
            return {overlap: b.left<t.right && t.left<b.right && b.top<t.bottom && t.top<b.bottom, lines, badgeWidth:b.width, insideName:b.right<=name.getBoundingClientRect().right+1};
          });
          if(measurement.overlap || measurement.lines!==1 || !measurement.insideName)
            failures.push(`${width}px ×${scale} ${status}: ${JSON.stringify(measurement)}`);
          if(process.env.QOBUZ_CAPTURE && width===640 && scale===1 && status==='NON CONNECTÉ')
            await page.screenshot({path:process.env.QOBUZ_CAPTURE});
          count++;
        }
      }
    }
    assert.deepEqual(failures, [], `badge/case : chevauchement, retour à la ligne ou débordement\n${failures.join("\n")}`);
    console.log(`${count} mises en page mesurées : badge sur une ligne, contenu dans son en-tête, sans chevauchement.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
