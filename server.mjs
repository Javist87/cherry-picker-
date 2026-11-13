import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('./', import.meta.url);
const allowed = new Map([['/', 'index.html'], ['/index.html','index.html'], ['/app.mjs','app.mjs'], ['/domain.mjs','domain.mjs'], ['/style.css','style.css']]);
const types = {html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
http.createServer(async(req,res)=>{
 const path = allowed.get(new URL(req.url,'http://localhost').pathname);
 if(!path){res.writeHead(404);return res.end('Ikke funnet');}
 try{const data=await readFile(new URL(path,root));res.writeHead(200,{'Content-Type':types[path.split('.').pop()], 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Referrer-Policy':'no-referrer'});res.end(data);}catch{res.writeHead(500);res.end('Kunne ikke laste arbeidsflaten');}
}).listen(Number(process.env.PORT || 3000),'127.0.0.1',()=>console.log('Cherry Picker: http://127.0.0.1:'+ (process.env.PORT || 3000)));
