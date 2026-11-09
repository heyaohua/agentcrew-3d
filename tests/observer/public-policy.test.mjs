import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {isPublicObserverRead}=createRequire(import.meta.url)('../../server/observer-public-policy');
test('public observation exposes display reads only',()=>{
  for(const url of ['/observe','/observe?_rsc=abc','/api/observer/state','/_next/static/chunks/app.js','/office-assets/models/desk.glb']) {
    assert.equal(isPublicObserverRead({method:'GET',url}),true,url);
    assert.equal(isPublicObserverRead({method:'POST',url}),false,url);
  }
  for(const url of ['/office','/api/gateway/ws','/api/studio','/api/observer/events','/_next/image','/office-assets/../api/studio','/office-assets/%2e%2e%2fapi/studio','/office-assets/%5c..%5capi/studio','/%broken']) {
    assert.equal(isPublicObserverRead({method:'GET',url}),false,url);
  }
});
