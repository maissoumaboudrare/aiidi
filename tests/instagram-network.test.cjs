const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../adapters/instagram-network.js'),'utf8');
const url='https://scontent.cdninstagram.com/video.mp4';
const child=(id='17940030573187025')=>({pk:id,video_versions:[{url,width:720,height:960}]});
const post=(media=[child()],code='DXm0XJGCpt4',username='maissoumx')=>({code,user:{username},carousel_media:media});
function setup(embedded=[]) {
  let listener, next, calls=0;
  class Element {
    constructor(code,owner){this.attrs={'data-aiidi-post':code,'data-owner':owner};this.textContent='';}
    matches(){return true;} getAttribute(name){return this.attrs[name];}
  }
  class XHR {
    addEventListener(type,fn){this.listener=fn;}
    send(){return 'native-send';}
    complete(response,url,type='text'){Object.assign(this,{responseURL:url,responseType:type,responseText:response,response});this.listener();}
  }
  const window={fetch(){calls++;return next;}};
  const context=vm.createContext({window,XMLHttpRequest:XHR,Element,URL,Reflect,Map,location:{href:'https://www.instagram.com/maissoumx/',origin:'https://www.instagram.com'},document:{
    addEventListener(type,fn){listener=fn;},querySelectorAll(){return embedded.map(textContent=>({textContent,hasAttribute:()=>false}));}
  }});
  vm.runInContext(code,context);
  return {window,XHR,calls:()=>calls,
    request(code='DXm0XJGCpt4',owner='maissoumx'){const target=new Element(code,owner);listener({target});return JSON.parse(target.textContent);},
    async receive(body,responseUrl='https://www.instagram.com/graphql/query',fail=false){
      const response={url:responseUrl,clone(){return {text:async()=>{if(fail)throw Error('unreadable');return body;}};}};
      next=Promise.resolve(response);
      const returned=window.fetch('/graphql/query');assert.equal(returned,next);assert.equal(await returned,response);
      await new Promise(resolve=>setImmediate(resolve));
    }
  };
}
test('fetch: ordered carousel identity survives rounded-duration collisions and unsafe numeric IDs',async()=>{
  const app=setup();
  await app.receive('{"data":{"items":[{"code":"DXm0XJGCpt4","user":{"username":"maissoumx"},"carousel_media":[{"pk":17940030573187025,"video_versions":[{"url":"'+url+'"}]},{"pk":17940030591187025,"video_versions":[{"url":"'+url+'?other=1"}]}]}]}}');
  assert.deepEqual(app.request().post.carousel_media.map(c=>c.id),['17940030573187025','17940030591187025']);
  assert.equal(app.calls(),1);
});
test('XHR, initial HTML and newline JSON are supported',async()=>{
  const app=setup([JSON.stringify({data:post()})]);
  assert.equal(app.request().post.carousel_media.length,1);
  const xhr=new app.XHR();assert.equal(xhr.send(),'native-send');
  xhr.complete('for (;;);'+JSON.stringify({items:[post([child()],'DXA0COsCppM')]}),'https://www.instagram.com/api/v1/feed/user/123/');
  assert.equal(app.request('DXA0COsCppM').post.code,'DXA0COsCppM');
  await app.receive('{}\n'+JSON.stringify({data:post([child()],'DSA6vqSEU5v')}));
  assert.equal(app.request('DSA6vqSEU5v').post.code,'DSA6vqSEU5v');
});
test('HTML and failed cloning do not affect Instagram or invent metadata',async()=>{
  const app=setup();await app.receive('<!DOCTYPE html><html>Login</html>');await app.receive('',undefined,true);
  assert.equal(app.request().post,null);
});
test('request is scoped to exact post and owner; unrelated endpoints are ignored',async()=>{
  const app=setup();await app.receive(JSON.stringify({data:post()}),'https://www.instagram.com/accounts/');
  assert.equal(app.request().post,null);
  await app.receive(JSON.stringify({data:post()}));
  assert.equal(app.request('OTHER').post,null);assert.equal(app.request('DXm0XJGCpt4','other').post,null);
});
test('partial responses cannot replace a full carousel or lose its video URLs',async()=>{
  const app=setup();await app.receive(JSON.stringify({data:post([child(),child('2')])}));
  await app.receive(JSON.stringify({data:post([{pk:'1'}])}));
  assert.equal(app.request().post.carousel_media.length,2);
  assert.equal(app.request().post.carousel_media[0].video_versions.length,1);
});
test('bridge exports only media data and disallows non-Instagram media origins',async()=>{
  const app=setup();const value=post([{pk:'1',video_versions:[{url:'https://evil.example/video.mp4'},{url}]}]);
  value.secret='not exported';await app.receive(JSON.stringify({data:value}));
  const result=app.request().post;
  assert.equal(result.secret,undefined);assert.equal(result.carousel_media[0].video_versions.length,1);
});
test('GraphQL edge children and standalone reels preserve order and URLs',async()=>{
  const app=setup();await app.receive(JSON.stringify({data:{shortcode_media:{shortcode:'DXA0COsCppM',owner:{username:'maissoumx'},edge_sidecar_to_children:{edges:[{node:{id:'photo'}},{node:{id:'video',is_video:true,video_url:url}}]}}}}));
  assert.deepEqual(app.request('DXA0COsCppM').post.carousel_media.map(c=>c.id),['photo','video']);
  await app.receive(JSON.stringify({data:{...child(),code:'DSA6vqSEU5v',user:{username:'maissoumx'},media_type:2}}));
  assert.equal(app.request('DSA6vqSEU5v').post.carousel_media[0].video_versions[0].url,url);
});

test('api/graphql without trailing slash is observed',async()=>{
  const app=setup();await app.receive(JSON.stringify({data:post()}),'https://www.instagram.com/api/graphql');
  assert.equal(app.request().post.code,'DXm0XJGCpt4');
});
