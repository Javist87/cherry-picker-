import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:3000');await page.getByRole('heading',{name:'Min arbeidsdag',exact:true}).waitFor();
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).click();
 await page.locator('[name=name]').fill('Nettlesertest');await page.locator('[name=municipality]').fill('Trondheim');await page.locator('[name=nextAction]').fill('Ring eksempelkontakt');await page.locator('[name=email]').fill('browser@example.invalid');
 await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Saker og leads'}).click();await page.locator('#search').fill('Nettlesertest');assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Nettlesertest',exact:true}).click();await page.locator('[name=nextAction]').fill('');await page.getByRole('button',{name:'Lagre sak',exact:true}).click();assert.match(await page.locator('#form-errors').innerText(),/Aktive saker/);
 await page.locator('[name=nextAction]').fill('Ring på nytt');await page.locator('[name=agreementDate]').fill(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date()));await page.getByRole('button',{name:'Lagre sak',exact:true}).click();
 await page.getByRole('button',{name:'Nettlesertest',exact:true}).click();await page.locator('#recipient').selectOption('Selger A');await page.getByRole('button',{name:'Be om overlevering',exact:true}).click();await page.locator('#actor').selectOption('Selger A');
 await page.getByRole('button',{name:'Nettlesertest',exact:true}).click();await page.getByRole('button',{name:'Bekreft mottak',exact:true}).click();
 await page.getByRole('button',{name:'Nettlesertest',exact:true}).click();assert.equal(await page.locator('[name=owner]').inputValue(),'Selger A');await page.locator('#followup-action').fill('Send avtalt oppsummering');await page.getByRole('button',{name:'Fullfør og avtal neste steg',exact:true}).click();await page.getByRole('button',{name:'Nettlesertest',exact:true}).click();assert.equal(await page.locator('[name=nextAction]').inputValue(),'Send avtalt oppsummering');assert.match(await page.locator('#history').innerText(),/Fullført: Ring på nytt/);await page.getByRole('button',{name:'Avbryt',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Saker og leads'}).click();await page.locator('#search').fill('Nettlesertest');assert.equal(await page.locator('tbody tr').count(),1);
 await page.locator('#search').fill('ingen slike saker');assert.equal(await page.locator('tbody tr').count(),0);await page.locator('#search').fill('');
 await page.getByRole('button',{name:'Rapport',exact:false}).click();await page.locator('#from').fill('2020-01-01');await page.getByRole('button',{name:'Vis rapport',exact:true}).click();assert.equal(await page.locator('#report-data .stats article').nth(0).locator('strong').innerText(),'6');
 await page.getByRole('button',{name:'Min arbeidsdag'}).click();await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).click();assert.ok(await page.locator('#editor').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#editor').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('Browser OK: registrering, validering, søk, overlevering, gjenlasting, rapport, mobil og dialog.');
}finally{await browser.close();}
