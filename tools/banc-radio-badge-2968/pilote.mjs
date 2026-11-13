// Vite depuis la racine : npx vite --config tools/banc-radio-badge-2968/vite.banc.config.ts --host 127.0.0.1
// BANC_URL=http://127.0.0.1:5173 node tools/banc-radio-badge-2968/pilote.mjs
// Playwright doit être installé dans l'environnement de test ; PLAYWRIGHT_MODULE peut désigner son module.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,args:['--mute-audio']});
try {
  for (const width of [1440,900,390]) for (const scale of [1,1.5]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    page.setDefaultTimeout(90000);
    const erreurs=[], suppressions=[];
    page.on('pageerror', e=>erreurs.push(e.message));
    await page.route('**/api/**', async route=>{
      const req=route.request(), path=new URL(req.url()).pathname;
      if (!path.startsWith('/api/')) return route.continue();
      if (req.method()==='DELETE' && path.endsWith('/radios/7')) {
        suppressions.push(path); return route.fulfill({status:204});
      }
      assert.equal(req.method(),'GET','Aucune commande de lecture dans ce banc');
      let body=[];
      if(path.includes('/radios/directory')) body={total:3,count:3,stations:3,offset:0,limit:120,countries:[],genres:[],items:Array.from({length:3},(_,i)=>({
        external_id:'S'+i,name:'Station témoin '+i,stream_url:'https://radio.invalid/flux',logo_url:null,
        my_radio_id:i<2?7+i:null,my_radio_favorite:i===1,codec:'AAC',bitrate:192,now_playing:true,
        radio_metadata_key:'temoin',genre:'jazz',country_code:'FR',
      }))};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${process.env.BANC_URL||'http://127.0.0.1:5173'}/tools/banc-radio-badge-2968/index.html`);
    await page.waitForSelector('.dedans');
    await page.locator('#app').evaluate((el,scale)=>el.style.setProperty('--v2-txt-echelle',String(scale)),scale);
    const cards=page.locator('.fiche');
    for(const i of [0,1]) {
      assert.match(await cards.nth(i).locator('.dedans').textContent(),/Dans mes radios/);
      assert.equal(await cards.nth(i).getByRole('button',{name:'Retirer de Mes radios',exact:true}).count(),1);
      const bounds=await cards.nth(i).evaluate(card=>{
        const c=card.getBoundingClientRect(), b=card.querySelector('.dedans').getBoundingClientRect();
        return {left:c.left,right:c.right,badgeLeft:b.left,badgeRight:b.right};
      });
      assert.ok(bounds.badgeLeft>=bounds.left-1 && bounds.badgeRight<=bounds.right+1,
        `La pastille Dans mes radios déborde de sa carte : ${JSON.stringify({width,scale,...bounds})}`);
    }
    assert.equal(await cards.nth(2).locator('.dedans').count(),0);
    await cards.nth(0).getByRole('button',{name:'Retirer de Mes radios',exact:true}).click({force:true});
    await page.evaluate(()=>window.banc.confirmer());
    await page.waitForFunction(()=>!document.querySelector('.fiche:first-child .dedans'));
    assert.equal(suppressions.length,1);
    assert.equal(await cards.nth(0).locator('.tl2').count(),1,'Ajouter revient après le retrait');
    assert.deepEqual(erreurs,[]);
    console.log(JSON.stringify({width,scale,badge:'dans la carte',retrait:'Ajouter rétabli'}));
    await page.close();
  }
} finally {await browser.close();}
