import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const policy="default-src 'self'; object-src 'none'; upgrade-insecure-requests";

test('plaintext observer keeps CSP restrictions without forcing unavailable HTTPS',async()=>{
  const {adaptObserverHttpResponse}=require('../../server/observer-transport');
  const server=http.createServer((req,res)=>{
    adaptObserverHttpResponse(res);
    res.setHeader('Strict-Transport-Security','max-age=31536000');
    if(req.url==='/late')res.writeHead(200,{'Content-Security-Policy':policy});
    else if(req.url==='/raw')res.writeHead(200,['Content-Security-Policy',policy]);
    else res.setHeader('Content-Security-Policy',policy);
    res.end('ok');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for(const path of ['/early','/late','/raw']) {
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-security-policy'),"default-src 'self'; object-src 'none'");
      assert.equal(response.headers.get('strict-transport-security'),null);
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
