// Frittstående prototype: serverer bare klienten med lokal datakilde (sessionStorage, fiktive data).
// Ingen API, ingen innlogging. API-serveren startes med «npm run start:api» (server/main.mjs).
import http from 'node:http';
import {createStaticHandler} from './server/static.mjs';
const serve=createStaticHandler({dataSource:'local'});
const port=Number(process.env.PORT || 3000);
http.createServer((req,res)=>serve(req,res,new URL(req.url,'http://localhost'))).listen(port,'127.0.0.1',()=>console.log('Cherry Picker: http://127.0.0.1:'+port));
