const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(process.env.SCANNER_FILE || path.join(__dirname, '../adapters/instagram.js'), 'utf8');
function rect(left, top, width, height) { return {left, top, width, height, right:left+width, bottom:top+height}; }
function scenario(specs, options={}) {
  let now=0, current=options.start||0, from=current, transitionAt=-10000;
  let clicks=0;
  const requests=[];
  const nativeMetadata = options.metadata === undefined ? metadata(specs.map(spec => spec.type === 'video' ?
    item(spec.id, `https://cdn.example/${spec.id}.mp4`) : {media_type:1})) : options.metadata;
  const duration=options.transitionMs??700;
  const dialogRect=rect(0,24,1425,652);
  const mediaRect=rect(218,24,489,652);
  class Element {
    constructor(tag, bounds, attrs={}) {this.tagName=tag.toUpperCase();this.bounds=bounds;this.attrs=attrs;
      this.children=[];this.style={transform:'none'};this.css={display:'block',visibility:'visible',overflowX:'visible',overflowY:'visible'};}
    append(el){el.parentElement=this;this.children.push(el);return el;}
    getBoundingClientRect(){return typeof this.bounds==='function'?this.bounds():this.bounds;}
    getAttribute(key){return this.attrs[key]??null;}
    closest(selector){for(let n=this;n;n=n.parentElement)if(n.tagName.toLowerCase()===selector)return n;return null;}
    querySelectorAll(selector){const terms=selector.split(',').map(s=>s.trim());const matches=n=>terms.some(s=>s===n.tagName.toLowerCase() || s==='a[href]'&&n.tagName==='A');
      const out=[];function walk(node){for(const n of node.children){if(n.enabled===false)continue;if(matches(n))out.push(n);walk(n);}}walk(this);return out;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  }
  const dialog=new Element('div',dialogRect), header=dialog.append(new Element('header',rect(707,24,500,50)));
  header.append(Object.assign(new Element('a',rect(710,25,100,30)),{href:'https://www.instagram.com/maissoumx/'}));
  const pane=dialog.append(new Element('div',mediaRect));
  const clip=pane.append(new Element('div',mediaRect));clip.css.overflowX='auto';clip.css.overflowY='hidden';
  const ul=clip.append(new Element('ul',rect(218,24,1,652)));
  const resources=[];
  const offset=()=>from+(current-from)*Math.min(1,Math.max(0,(now-transitionAt)/duration));
  specs.forEach((spec,i)=>{
    const bounds=()=>rect(218+(i-offset())*489,24,489,652);
    const li=ul.append(new Element('li',bounds));li.style.transform=`translateX(${i*489}px)`;
    const el=li.append(new Element(spec.type==='video'?'video':'img',bounds));
    const url=`https://cdn.example/${spec.id||i}.${spec.type==='video'?'mp4':'jpg'}`;
    Object.assign(el,{src:spec.type==='video'?(spec.direct||`blob:${i}`):url,currentSrc:spec.type==='video'?(spec.direct||`blob:${i}`):url,poster:'',
      naturalWidth:spec.type==='image'?(spec.width||489):0,naturalHeight:spec.type==='image'?(spec.height||651):0,
      videoWidth:spec.type==='video'?720:0,videoHeight:spec.type==='video'?960:0,duration:spec.duration||0});
    if(spec.type==='video' && !spec.direct) {
      const metadata={xpv_asset_id:spec.id||String(i),duration_s:spec.duration,vencode_tag:'dash_carousel_item_720p',bitrate:2000};
      resources.push({name:`${url}?efg=${encodeURIComponent(Buffer.from(JSON.stringify(metadata)).toString('base64'))}`,startTime:i});
    }
  });
  function button(label,delta){const b=pane.append(new Element('button',rect(660,300,30,30),{'aria-label':label}));b.click=()=>{clicks++;from=offset();if(!options.stuck)current+=delta;transitionAt=now;};Object.defineProperty(b,'enabled',{get:()=>delta>0?current<specs.length-1:current>0});return b;}
  button('Next',1);button('Go back',-1);
  // The outer publication arrow must never be clicked by the scanner.
  const outer=dialog.append(new Element('button',rect(1350,300,30,30),options.outerArrow?{'aria-label':'Next'}:{}));
  outer.click=()=>{throw Error('Navigated to another publication');};
  const context=vm.createContext({URL, Map, Set, console, atob:s=>Buffer.from(s,'base64').toString(),
    getComputedStyle:e=>e.css,
    document:{querySelector:()=>dialog, querySelectorAll:()=>[],
      documentElement:{appendChild(){}},
      createElement:()=>({setAttribute(){},remove(){},textContent:'',dispatchEvent(){
        if(options.bridgeMissing)return;
        this.textContent=JSON.stringify({ready:true,post:now < (options.metadataDelay || 0) ? null : nativeMetadata});
      }})}, Event:class {},
    AbortController, URLSearchParams, clearTimeout:()=>{},
    fetch:async (url, init)=>{requests.push({url, init}); if(!options.metadata) throw Error("Metadata unavailable in fixture"); return {ok:true,json:async()=>options.metadata};},window:{innerWidth:1440,innerHeight:700,location:{href:'https://www.instagram.com/p/TEST/' }},
    performance:{getEntriesByType:()=>resources}});
  context.setTimeout=(fn,ms)=>{if(ms===12000)return 1;now+=ms;fn();};
  return {scan:(expected)=>vm.runInContext(`${code}\nscanInstagramPost(${JSON.stringify(expected??null)})`,context), clicks:()=>clicks, requests};
}
const image=id=>({type:'image',id});
const video=(id,duration)=>({type:'video',id,duration});
const mixed=[image('first'),video('a',6.966666),video('b',4.866666),video('c',3.433333),video('d',13.266666),image('last'),video('e',24.933333)];
test('DXm0XJGCpt4 observed desktop geometry: 2 images and 5 videos in order',async()=>{
  const result=await scenario(mixed).scan();
  assert.deepEqual(Array.from(result.media,m=>m.type),mixed.map(m=>m.type));
  assert.deepEqual(Array.from(result.media,m=>m.index),[0,1,2,3,4,5,6]);
  assert.equal(result.diagnostics.unresolvedSlides.length,0);
});
test('rewind from a middle slide before scanning the whole carousel',async()=>{
  const result=await scenario(mixed,{start:4}).scan();assert.equal(result.media.length,7);assert.equal(result.media[0].type,'image');
});
test('slow transition does not recollect the old slide',async()=>{
  const result=await scenario([image('first'),video('a',9.166637),image('last')],{transitionMs:1800}).scan();
  assert.deepEqual(Array.from(result.media,m=>m.type),['image','video','image']);assert.equal(result.diagnostics.unresolvedSlides.length,0);
});
test('stalled next stops with a diagnostic instead of appending another video',async()=>{
  const run=scenario([video('a',9.166637),image('last')],{stuck:true});const result=await run.scan();
  assert.equal(result.media.length,1);assert.equal(result.diagnostics.unresolvedSlides[0].reason,'Next slide timeout');assert.equal(run.clicks(),1);
});
test('two genuine image slots with the same URL are both preserved',async()=>{
  const result=await scenario([image('same'),image('same')]).scan();assert.equal(result.media.length,2);
});
test('ambiguous video identity is reported, never resolved by removing used assets',async()=>{
  const result=await scenario([video('a',10),video('b',10)],{metadata:null}).scan();assert.equal(result.media.length,0);
  assert.equal(result.diagnostics.unresolvedSlides.length,2);assert.match(result.diagnostics.unresolvedSlides[0].reason,/No video identity/);
});
test('landscape image with a natural height under 300 is retained',async()=>{
  const result=await scenario([{type:'image',width:489,height:240}]).scan();assert.equal(result.media.length,1);
});
test('foreign owner is rejected before moving the carousel',async()=>{
  const run=scenario(mixed);const result=await run.scan('someone_else');assert.equal(result.success,false);assert.equal(run.clicks(),0);
});

test('outer Next publication arrow is never used as a carousel control',async()=>{
  const result=await scenario(mixed,{outerArrow:true}).scan();assert.equal(result.media.length,7);
});

test('progressive MP4 without DASH metadata is collected from its player',async()=>{
  const result=await scenario([{type:'video',duration:12,direct:'https://cdn.example/direct.mp4?token=signed&bytestart=0&byteend=999'}]).scan();
  assert.equal(result.media.length,1);
  assert.equal(result.media[0].url,'https://cdn.example/direct.mp4?token=signed');
  assert.equal(result.diagnostics.unresolvedSlides.length,0);
});

function metadata(children, owner='maissoumx', code='TEST') {
  return {data:{xdt_api__v1__media__shortcode__web_info:{items:[{
    code,user:{username:owner},carousel_media:children
  }]}}};
}
const item=(id,url)=>({pk:id,media_type:2,video_duration:10,
  video_versions:[{url,width:720,height:960}],image_versions2:{candidates:[{url:'https://cdn.example/poster.jpg'}]}});
test('equal-duration videos resolve to their own ordered media IDs, no extra metadata request',async()=>{
  const run=scenario([video('a',10),video('b',10)],{metadata:metadata([
    item('child-a','https://cdn.example/real-a.mp4'),item('child-b','https://cdn.example/real-b.mp4')])});
  const result=await run.scan();
  assert.deepEqual(Array.from(result.media,m=>m.assetId),['child-a','child-b']);
  assert.deepEqual(Array.from(result.media,m=>m.url),['https://cdn.example/real-a.mp4','https://cdn.example/real-b.mp4']);
  assert.equal(result.diagnostics.unresolvedSlides.length,0);assert.equal(run.requests.length,0);
});
test('mixed carousel metadata uses original slide index, not video ordinal',async()=>{
  const run=scenario([image('first'),video('a',10),video('b',10)],{metadata:metadata([
    {pk:'photo',media_type:1},item('child-a','https://cdn.example/a.mp4'),item('child-b','https://cdn.example/b.mp4')])});
  const result=await run.scan();assert.equal(result.media.length,3);
  assert.equal(result.media[1].assetId,'child-a');assert.equal(result.media[2].assetId,'child-b');
});
test('metadata from a different owner cannot resolve ambiguity',async()=>{
  const result=await scenario([video('a',10),video('b',10)],{metadata:metadata([
    item('foreign','https://cdn.example/foreign.mp4')],'other')}).scan();
  assert.equal(result.media.length,0);assert.equal(result.diagnostics.unresolvedSlides.length,2);
});
test('metadata from a different publication cannot resolve ambiguity',async()=>{
  const result=await scenario([video('a',10),video('b',10)],{metadata:metadata([
    item('foreign','https://cdn.example/foreign.mp4')],'maissoumx','OTHER')}).scan();
  assert.equal(result.media.length,0);
});

test('missing document-start bridge tells the user to reload',async()=>{
  const result=await scenario([video('a',10)],{bridgeMissing:true}).scan();
  assert.equal(result.media.length,0);
  assert.match(result.diagnostics.unresolvedSlides[0].reason,/Reload Media Collector/);
});
test('a unique duration candidate is not evidence of post ownership',async()=>{
  const result=await scenario([video('unrelated',10)],{metadata:null}).scan();
  assert.equal(result.media.length,0);
});

test('metadata arriving after the player is retried',async()=>{
  const result=await scenario([video('a',10)],{metadataDelay:1000}).scan();
  assert.equal(result.media.length,1);assert.equal(result.diagnostics.unresolvedSlides.length,0);
});
test('video cover is resolved even when the player never mounts',async()=>{
  const efg=Buffer.from(JSON.stringify({vencode_tag:'video_cover'})).toString('base64');
  const result=await scenario([image('cover.jpg?efg='+efg+'&unused=')],{metadata:metadata([item('video','https://cdn.example/real.mp4')])}).scan();
  assert.equal(result.media[0].type,'video');assert.equal(result.media[0].url,'https://cdn.example/real.mp4');
});
