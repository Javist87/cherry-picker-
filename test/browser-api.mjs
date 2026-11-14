// Nettlesertest av klienten i API-modus. Start serveren først med «npm run start:api».
// Tester at klienten bruker serveren, at tilgang følger testbrukeren, og at ingen data ligger i nettleserlagring.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const actAs=async name=>{await page.locator('#actor').selectOption({label:name});await page.waitForFunction(n=>{const a=document.querySelector('#actor');return a.selectedOptions[0]?.textContent===n&&document.querySelector('#content').dataset.actor===a.value;},name);};
 const go=async v=>{await page.locator(`[data-view=${v}]`).click();await page.locator(`#content[data-current=${v}]`).waitFor();};
 const open=async()=>{await page.getByRole('button',{name:'Nettlesertest API',exact:true}).click();await page.locator('#editor').waitFor();};
 const saved=()=>page.locator('#editor').waitFor({state:'hidden'});
 await page.goto(base);await page.locator('.stats').waitFor();
 assert.match(await page.locator('#demo-banner').innerText(),/Utviklingsmodus/);
 // Velgeren viser superbruker og leder først, deretter nedover. Superbruker ser alle visninger.
 assert.deepEqual((await page.locator('#actor option').allInnerTexts()).slice(0,3),['Test Superbruker (alle roller, kun demo)','Test Leder','Test Avdelingsleder Trøndelag']);
 for(const name of ['Tilgang','Revisjonslogg','Oppsett'])assert.ok(await page.getByRole('button',{name,exact:false}).first().isVisible(),name);
 assert.ok(await page.locator('[data-view=intake]').isHidden());
 await go('access');assert.match(await page.locator('#content').innerText(),/selger, teamleder, avdelingsleder, leder, teknisk_admin, revisor/);
 await actAs('Test Selger A');await go('day');await page.locator('.stats').waitFor();
 for(const v of ['audit','admin','intake'])assert.ok(await page.locator(`[data-view=${v}]`).isHidden(),v);
 await go('access');const tilgang=await page.locator('#content').innerText();assert.match(tilgang,/Eksportere saker[\s\S]*Ingen tilgang/);assert.match(tilgang,/Endre sak[\s\S]*saker du eier/);await go('day');

 // Registrering, servervalidering, søk
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).click();
 await page.locator('[name=name]').fill('Nettlesertest API');await page.locator('[name=municipality]').fill('Trondheim');await page.locator('[name=nextAction]').fill('Ring eksempelkontakt');await page.locator('[name=email]').fill('browser-api@example.invalid');
 await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await saved();
 assert.match(await page.locator('#message').innerText(),/lagret på serveren/);
 await page.getByRole('button',{name:'Saker og leads'}).click();await page.locator('#search').fill('Nettlesertest API');assert.equal(await page.locator('tbody tr').count(),1);
 await open();await page.locator('[name=nextAction]').fill('');await page.getByRole('button',{name:'Lagre sak',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#form-errors').textContent.length>0);assert.match(await page.locator('#form-errors').innerText(),/Aktive saker/);
 await page.locator('[name=nextAction]').fill('Ring på nytt');await page.locator('[name=agreementDate]').fill(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date()));await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await saved();
 // Dublett avvises av serveren
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).click();await page.locator('[name=name]').fill('Nettlesertest API');await page.locator('[name=municipality]').fill('Trondheim');await page.locator('[name=nextAction]').fill('Ring');await page.getByRole('button',{name:'Lagre sak',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#form-errors').textContent.length>0);assert.match(await page.locator('#form-errors').innerText(),/Mulig dublett: Nettlesertest API/);await page.getByRole('button',{name:'Avbryt',exact:true}).click();

 // Overlevering med mottaksbekreftelse fra en annen testbruker
 await open();await page.locator('#recipient').selectOption({label:'Test Selger B'});await page.getByRole('button',{name:'Be om overlevering',exact:true}).click();await saved();
 await actAs('Test Selger B');await open();await page.getByRole('button',{name:'Bekreft mottak',exact:true}).click();await saved();
 await open();assert.equal(await page.locator('[name=owner] option:checked').innerText(),'Test Selger B');assert.ok(await page.locator('[name=owner]').isDisabled());
 await page.locator('#followup-action').fill('Send avtalt oppsummering');await page.getByRole('button',{name:'Fullfør og avtal neste steg',exact:true}).click();await saved();
 await open();assert.equal(await page.locator('[name=nextAction]').inputValue(),'Send avtalt oppsummering');assert.match(await page.locator('#history').innerText(),/Oppfølging fullført/);assert.match(await page.locator('#history').innerText(),/Overlevering bekreftet · Test Selger B/);
 const caseId=await page.evaluate(()=>document.querySelector('tbody [data-open]').dataset.open);await page.getByRole('button',{name:'Avbryt',exact:true}).click();

 // Gjenlasting: data kommer fra server, og ingenting ligger i nettleserlagring
 await page.reload();await page.locator('.stats').waitFor();await page.getByRole('button',{name:'Saker og leads'}).click();await page.locator('#search').fill('Nettlesertest API');assert.equal(await page.locator('tbody tr').count(),1);
 assert.deepEqual(await page.evaluate(()=>[sessionStorage.length,localStorage.length]),[0,0]);
 assert.ok(!(await page.evaluate(()=>document.cookie)).includes('cp_dev_session'),'Sesjonen skal ikke være lesbar fra skript');

 // Tilgang avgjøres på server: tidligere eier, annen avdeling, leder og teknisk administrator
 const direct=()=>page.evaluate(async id=>(await fetch('./api/v1/cases/'+id)).status,caseId);
 assert.equal(await direct(),200);
 for(const name of ['Test Selger A','Test Selger V']){await actAs(name);await page.getByRole('button',{name:'Saker og leads'}).click();await page.locator('#search').fill('Nettlesertest API');assert.equal(await page.locator('tbody tr').count(),0,name);assert.equal(await direct(),404,name);}
 await actAs('Test Leder');assert.equal(await page.locator('#title').innerText(),'Rapport');assert.ok(await page.locator('#new-case').isHidden());
 await page.locator('#agg-data table').waitFor();const tall=await page.locator('#agg-data').innerText();assert.doesNotMatch(tall,/Eksempelsak|Nettlesertest|example\.invalid/);assert.match(tall,/Dialog|Ny|Skjult/);assert.equal(await direct(),403);
 await page.getByRole('button',{name:'Saker og leads'}).click();assert.match(await page.locator('#content').innerText(),/Ingen saksinnsyn/);
 await actAs('Test Teknisk administrator');await page.getByRole('button',{name:'Min arbeidsdag'}).click();assert.match(await page.locator('#content').innerText(),/Ingen saksinnsyn/);assert.equal(await direct(),403);
 await page.getByRole('button',{name:'Rapport',exact:false}).click();assert.match(await page.locator('#content').innerText(),/Ingen rapporttilgang/);

 // Samtidige endringer: en utdatert dialog kan ikke lagres, heller ikke ved nytt forsøk
 await actAs('Test Selger B');await go('leads');await page.locator('#search').fill('Nettlesertest API');await open();
 const annen=await page.evaluate(async id=>{const c=await (await fetch('./api/v1/cases/'+id)).json();return (await fetch('./api/v1/cases/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':'"'+c.revision+'"'},body:JSON.stringify({municipality:'Malvik'})})).status;},caseId);assert.equal(annen,200);
 await page.locator('[name=municipality]').fill('Overskrevet');
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await page.waitForFunction(()=>/endret av andre/.test(document.querySelector('#form-errors').textContent));await page.evaluate(()=>{document.querySelector('#form-errors').textContent='';});}
 assert.equal(await page.evaluate(async id=>(await (await fetch('./api/v1/cases/'+id)).json()).municipality,caseId),'Malvik');await page.getByRole('button',{name:'Avbryt',exact:true}).click();

 // Teamleder: eierskifte med begrunnelse og bekreftelse av «ikke dublett»
 await actAs('Test Teamleder T1');await go('leads');await page.locator('#search').fill('Nettlesertest API');await open();
 await page.locator('#reassign-to').selectOption({label:'Test Selger A'});await page.getByRole('button',{name:'Gjennomfør eierskifte',exact:true}).click();
 await page.waitForFunction(()=>/Begrunnelse|Årsak|må fylles ut/.test(document.querySelector('#form-errors').textContent));
 await page.locator('#reassign-reason').fill('Fravær (demo)');await page.getByRole('button',{name:'Gjennomfør eierskifte',exact:true}).click();await saved();
 await open();assert.equal(await page.locator('[name=owner] option:checked').innerText(),'Test Selger A');await page.getByRole('button',{name:'Avbryt',exact:true}).click();
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).click();await page.locator('[name=name]').fill('Nettlesertest API');await page.locator('[name=municipality]').fill('Malvik');await page.locator('[name=nextAction]').fill('Ring');await page.getByRole('button',{name:'Lagre sak',exact:true}).click();
 await page.locator('#dup-confirm').waitFor();await page.locator('#dup-confirm input').check();await page.getByRole('button',{name:'Lagre sak',exact:true}).click();await saved();
 assert.equal(await page.locator('tbody tr').count(),2);

 // Avdelingsleder: saksrapport, aggregater og eksport med formål
 await actAs('Test Avdelingsleder Trøndelag');await page.getByRole('button',{name:'Rapport',exact:false}).click();await page.locator('#agg-data table').waitFor();assert.ok(await page.locator('#report-data .stats').isVisible());
 await page.getByRole('button',{name:'Eksporter',exact:true}).click();await page.waitForFunction(()=>/Formål/.test(document.querySelector('#export-result').textContent));
 await page.locator('#export-purpose').fill('Avstemming (demo)');await page.getByRole('button',{name:'Eksporter',exact:true}).click();await page.locator('#export-link').waitFor();assert.match(await page.locator('#export-result').innerText(),/\d+ saker eksportert/);

 // Revisor: leser loggen, ser avslag, formål og begrunnelse, men ingen saker
 await actAs('Test Revisor');assert.equal(await page.locator('#title').innerText(),'Revisjonslogg');await page.locator('#audit-data table').waitFor();
 const logg=await page.locator('#audit-data').innerText();assert.match(logg,/Formål: Avstemming \(demo\)/);assert.match(logg,/Formål: Fravær \(demo\)/);assert.match(logg,/Avslått/);assert.doesNotMatch(logg,/example\.invalid|Eksempelkontakt|Overskrevet/);
 await page.locator('#audit-outcome').selectOption('denied');await page.waitForFunction(()=>!/Tillatt/.test(document.querySelector('#audit-data').textContent));assert.equal(await direct(),403);
 await go('leads');assert.match(await page.locator('#content').innerText(),/Ingen saksinnsyn/);

 // Inntakstjenesten: idempotent innsending. Teknisk administrator ser bare antall i køen
 await actAs('Tjenestekonto inntak (test)');assert.equal(await page.locator('#title').innerText(),'Nettskjema');
 await page.getByRole('button',{name:'Send inn',exact:true}).click();await page.waitForFunction(()=>/mottatt og lagt i kø/.test(document.querySelector('#intake-result').textContent));
 await page.getByRole('button',{name:'Send inn',exact:true}).click();await page.waitForFunction(()=>/gjenkjent/.test(document.querySelector('#intake-result').textContent));assert.equal(await direct(),403);
 await actAs('Test Teknisk administrator');await go('admin');await page.getByRole('heading',{name:'Inntakskø'}).waitFor();
 const oppsett=await page.locator('#content').innerText();assert.match(oppsett,/Mottatt\s+1/);assert.match(oppsett,/dev-memory/);assert.doesNotMatch(oppsett,/Eksempelperson|example\.invalid|Eksempelsak/);

 // Nullstilling av demodata
 await actAs('Test Superbruker (alle roller, kun demo)');await go('access');await page.getByRole('button',{name:'Nullstill demodata',exact:true}).click();await page.waitForFunction(()=>/nullstilt/.test(document.querySelector('#message').textContent));
 await go('leads');await page.locator('#search').fill('Nettlesertest API');assert.equal(await page.locator('tbody tr').count(),0);await page.locator('#search').fill('');assert.equal(await page.locator('tbody tr').count(),18);
 await page.screenshot({path:'artifacts/api-superbruker.png',fullPage:true});

 // Mobil, dialog og tastatur
 await actAs('Test Selger A');await page.getByRole('button',{name:'Min arbeidsdag'}).click();await page.locator('.stats').waitFor();await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/api-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/api-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
 await page.getByRole('button',{name:'+ Ny henvendelse',exact:true}).focus();await page.keyboard.press('Enter');await page.locator('#editor').waitFor();assert.equal(await page.locator('[name=team]').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#editor').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('Browser API OK: alle roller fra superbruker og leder til selger, revisor, teknisk administrator og inntak; registrering, validering, dublett, overlevering, fullføring, eierskifte, samtidige endringer, eksport, aggregater, revisjonslogg, oppsett, nettskjema, nullstilling, mobil og dialog.');
}finally{await browser.close();}
