export const STATUSES = ['Ny','Dialog','Avventer','Oppstartsoverlevering','Avsluttet'];
export const BPA = ['Uavklart','Søknad','Venter på vedtak','Vedtak foreligger','Leverandørbytte'];
export const SOURCES = ['Nettside','E-post','Telefon','Messe','Anbefaling'];
export const OWNERS = ['Thomas','Selger A','Selger B'];
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date());}
export function offset(days,base=today()){const d=new Date(base+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function isActive(c){return c.status!=='Avsluttet';}
export function needsAction(c,date=today()){return isActive(c) && (!c.owner || !c.nextAction || !c.due || c.due<=date);}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'') && !isNaN(Date.parse(value)) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function validate(c){
 const errors=[];
 for(const [key,label] of [['name','Saksnavn'],['municipality','Kommune'],['department','Avdeling']]) if(!c[key]?.trim()) errors.push(label+' må fylles ut.');
 if(!STATUSES.includes(c.status)) errors.push('Velg gyldig kontaktstatus.');
 if(!BPA.includes(c.bpa)) errors.push('Velg gyldig BPA-prosess.');
 if(!SOURCES.includes(c.source)) errors.push('Velg gyldig kilde.');
 if(isActive(c) && (!OWNERS.includes(c.owner) || !c.nextAction?.trim() || !validDate(c.due))) errors.push('Aktive saker må ha ansvarlig, neste handling og gyldig frist.');
 if(c.status==='Avventer' && !c.reason?.trim()) errors.push('Oppgi årsak til pause. Fristen er dato for ny vurdering.');
 if(c.status==='Avsluttet' && !c.reason?.trim()) errors.push('Oppgi årsak til avslutning.');
 for(const key of ['agreementDate','startDate']) if(c[key] && !validDate(c[key])) errors.push('Ugyldig milepældato.');
 if(c.startDate && !c.agreementDate) errors.push('Registrer avtaledato før faktisk oppstart.');
 if(c.startDate && c.agreementDate && c.startDate<c.agreementDate) errors.push('Oppstart kan ikke være før avtalen.');
 if(c.startDate && c.startDate>today()) errors.push('Faktisk oppstart kan ikke ligge i fremtiden.');
 if(c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('Ugyldig e-postadresse.');
 return errors;
}
export function duplicates(c,cases){const norm=s=>(s||'').trim().toLowerCase();const phone=s=>(s||'').replace(/\D/g,'');return cases.filter(x=>x.id!==c.id && ((norm(c.email)&&norm(c.email)===norm(x.email)) || (phone(c.phone)&&phone(c.phone)===phone(x.phone)) || (norm(c.name)===norm(x.name)&&norm(c.municipality)===norm(x.municipality))));}
export function saveCase(c,cases,stamp=new Date().toISOString()){
 const errors=validate(c);if(errors.length) throw new Error(errors.join(' '));
 const old=cases.find(x=>x.id===c.id);
 const event={at:stamp,text:old?'Sak oppdatert · '+c.status:'Henvendelse registrert'};
 const saved={...old,...c,id:old?.id||crypto.randomUUID(),createdAt:old?.createdAt||today(),history:[...(old?.history||[]),event],handoff:old?.handoff||null};
 return old?cases.map(x=>x.id===old.id?saved:x):[saved,...cases];
}
export function completeFollowup(c,{nextAction,due,actor},stamp=new Date().toISOString()){
 if(!isActive(c)) throw new Error('Avsluttede saker kan ikke få fullført oppfølging.');
 if(actor!==c.owner) throw new Error('Bare ansvarlig kan fullføre oppfølgingen.');
 if(!c.nextAction?.trim()) throw new Error('Saken mangler en handling å fullføre.');
 if(!nextAction?.trim()||!validDate(due)||due<today()) throw new Error('Avtal neste handling og en frist fra i dag eller senere.');
 const completed={action:c.nextAction,due:c.due,by:actor,completedAt:stamp};
 return {...c,nextAction:nextAction.trim(),due,lastContact:stamp.slice(0,10),completedActions:[...(c.completedActions||[]),completed],history:[...c.history,{at:stamp,text:'Fullført: '+c.nextAction+' · Neste: '+nextAction.trim()+' ('+due+')'}]};
}
export function requestHandoff(c,recipient){if(!isActive(c))throw new Error('Avsluttede saker kan ikke overleveres.');if(c.handoff?.state==='Venter på bekreftelse')throw new Error('Saken har allerede en ventende overlevering.');if(!OWNERS.includes(recipient)||recipient===c.owner)throw new Error('Velg en annen mottaker.');if(!c.agreementDate)throw new Error('Registrer avtale før oppstartsoverlevering.');return {...c,status:'Oppstartsoverlevering',handoff:{from:c.owner,to:recipient,state:'Venter på bekreftelse'},history:[...c.history,{at:new Date().toISOString(),text:'Overlevering forespurt til '+recipient}]};}
export function acceptHandoff(c,actor){if(!c.handoff||c.handoff.to!==actor||c.handoff.state!=='Venter på bekreftelse')throw new Error('Bare mottaker kan bekrefte ventende overlevering.');return {...c,owner:actor,handoff:{...c.handoff,state:'Bekreftet'},history:[...c.history,{at:new Date().toISOString(),text:'Overlevering bekreftet av '+actor}]};}
export function report(cases,from,to){const inPeriod=d=>d&&d>=from&&d<=to;return {new:cases.filter(c=>inPeriod(c.createdAt)),agreements:cases.filter(c=>inPeriod(c.agreementDate)),starts:cases.filter(c=>inPeriod(c.startDate)),followup:cases.filter(c=>needsAction(c,to))};}
export function seed(){return [
 ['Eksempelsak 001','Trondheim','Thomas','Dialog','Søknad','Nettside','Avtal en innledende samtale',-1,'',''],
 ['Eksempelsak 002','Stjørdal','Selger A','Avventer','Venter på vedtak','Messe','Sjekk status på søknad',7,'',''],
 ['Eksempelsak 003','Malvik','Thomas','Oppstartsoverlevering','Vedtak foreligger','Anbefaling','Avklar oppstart med koordinator',0,offset(-3),''],
 ['Eksempelsak 004','Orkland','Selger B','Ny','Uavklart','Telefon','Svar på henvendelsen',1,'',''],
 ['Eksempelsak 005','Trondheim','Thomas','Avsluttet','Leverandørbytte','E-post','',2,offset(-10),offset(-2)]
 ].map((r,i)=>({id:'demo-'+i,name:r[0],municipality:r[1],owner:r[2],status:r[3],bpa:r[4],source:r[5],nextAction:r[6],due:offset(r[7]),agreementDate:r[8],startDate:r[9],department:'Trøndelag',contact:'Eksempelkontakt '+(i+1),email:'demo'+i+'@example.invalid',phone:'',reason:r[3]==='Avventer'?'Venter på kommunen':r[3]==='Avsluttet'?'Overlevert til drift':'',createdAt:offset(-i*2),handoff:null,history:[{at:new Date().toISOString(),text:'Fiktiv eksempelsak opprettet'}]}));}
