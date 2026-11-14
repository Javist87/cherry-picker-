// Nettlesertest av CRM-tilleggene i den frittstående prototypen. Start serveren først med «npm start».
// Dekker aktivitetslogg, smarte lister, sortering, varsler, utfall ved avslutning og salgstrakt. Bare fiktive data.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const rows=()=>page.locator('tbody tr').count();
 const firstName=()=>page.locator('tbody tr').first().locator('.text-button').innerText();
 const chip=name=>page.locator('.chip',{hasText:name});
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:3000');await page.getByRole('heading',{name:'Min arbeidsdag',exact:true}).waitFor();

 // Smarte lister og varsler
 await page.getByRole('button',{name:'Saker og leads'}).click();assert.equal(await rows(),5);
 await chip('Uten aktivitet').click();assert.equal(await rows(),1);assert.equal(await firstName(),'Eksempelsak 004');assert.match(await page.locator('tbody .flag.stale').innerText(),/Ingen aktivitet på 16 dager/);
 assert.equal(await chip('Uten aktivitet').getAttribute('aria-pressed'),'true');
 await chip('Avsluttet').click();assert.equal(await rows(),1);assert.equal(await firstName(),'Eksempelsak 005');
 await chip('Mine aktive').click();assert.equal(await rows(),2);
 await chip('Alle').click();assert.equal(await rows(),5);

 // Sortering med tastaturtilgjengelige kolonneoverskrifter
 await page.locator('[data-sort=name]').click();assert.equal(await firstName(),'Eksempelsak 001');assert.equal(await page.locator('th[aria-sort]').getAttribute('aria-sort'),'ascending');
 await page.locator('[data-sort=name]').click();assert.equal(await firstName(),'Eksempelsak 005');assert.equal(await page.locator('th[aria-sort]').getAttribute('aria-sort'),'descending');

 // Aktivitetslogg: validering, logging, historikk og at stillstandsvarselet forsvinner
 await page.getByRole('button',{name:'Eksempelsak 004',exact:true}).click();
 await page.locator('#activity-type').selectOption('Notat');assert.ok(await page.locator('#activity-outcome').isDisabled());
 await page.getByRole('button',{name:'Logg aktivitet',exact:true}).click();assert.match(await page.locator('#form-errors').innerText(),/kort notat/);
 await page.locator('#activity-type').selectOption('Telefon');await page.locator('#activity-outcome').selectOption('Møte avtalt');await page.locator('#activity-note').fill('Fiktivt: møte avtalt neste uke');
 await page.getByRole('button',{name:'Logg aktivitet',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});assert.match(await page.locator('#message').innerText(),/Aktiviteten er logget/);
 await chip('Uten aktivitet').click();assert.equal(await rows(),0);await chip('Alle').click();
 await page.getByRole('button',{name:'Eksempelsak 004',exact:true}).click();
 assert.match(await page.locator('.activity .history').innerText(),/Telefon · Møte avtalt · Thomas/);assert.match(await page.locator('.activity .history').innerText(),/møte avtalt neste uke/);
 assert.match(await page.locator('#history').innerText(),/Aktivitet: Telefon · Møte avtalt/);
 assert.equal(await page.locator('.activity a[href^="mailto:"]').count(),1);

 // Utfall ved avslutning: bare på avsluttet sak
 await page.locator('[name=closeOutcome]').selectOption('Tapt – ingen respons');await page.locator('[name=status]').selectOption('Avsluttet');await page.locator('[name=reason]').fill('Fiktiv avslutning');
 await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Eksempelsak 004',exact:true}).click();assert.equal(await page.locator('[name=closeOutcome]').inputValue(),'Tapt – ingen respons');
 assert.equal(await page.locator('#log-activity').count(),0);await page.getByRole('button',{name:'Avbryt',exact:true}).click();

 // Gjenlasting bevarer aktivitet og utfall i fanen
 await page.reload();await page.getByRole('button',{name:'Saker og leads'}).click();await chip('Avsluttet').click();assert.equal(await rows(),2);

 // Salgstrakt i rapporten
 await page.getByRole('button',{name:'Rapport',exact:false}).click();await page.locator('#from').fill('2020-01-01');await page.getByRole('button',{name:'Vis rapport',exact:true}).click();
 const trakt=page.locator('.funnel div');assert.equal(await trakt.nth(0).locator('strong').innerText(),'5');assert.equal(await trakt.nth(1).locator('strong').innerText(),'2');assert.equal(await trakt.nth(2).locator('strong').innerText(),'1');
 assert.match(await trakt.nth(1).innerText(),/40 % av henvendelsene/);assert.match(await trakt.nth(2).innerText(),/50 % av avtalene/);
 const utfall=await page.locator('.outcomes').innerText();assert.match(utfall,/Vunnet – oppstart · 1/);assert.match(utfall,/Tapt – ingen respons · 1/);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/crm-report.png',fullPage:true});

 // Arbeidsdag og mobil
 await page.getByRole('button',{name:'Min arbeidsdag'}).click();assert.match(await page.locator('.compact').innerText(),/uten aktivitet/);
 await page.getByRole('button',{name:'Saker og leads'}).click();await chip('Alle').click();await page.screenshot({path:'artifacts/crm-leads.png',fullPage:true});
 await page.getByRole('button',{name:'Eksempelsak 001',exact:true}).click();await page.screenshot({path:'artifacts/crm-card.png'});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/crm-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
 assert.deepEqual(errors,[]);console.log('Browser CRM OK: smarte lister, sortering, varsler, aktivitetslogg, utfall, gjenlasting, salgstrakt og mobil.');
}finally{await browser.close();}
