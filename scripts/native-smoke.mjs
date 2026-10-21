import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { mockBackend } from './mock-backend.mjs';
import { websiteFixture } from './website-fixture.mjs';

if (process.platform !== 'win32') throw new Error('This driver verifies Windows WebView2 only. Use the manual checklist on other engines.');
const existingApp=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','if (Get-Process omnia-tauri -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }'],{windowsHide:true,stdio:'ignore'});
if(existingApp.status!==0) throw new Error('Close the running Omnia Tauri app before native smoke testing; its single-instance handler must not receive fixture commands.');
const evidence = { scope: process.argv.includes('--window-only') ? 'window persistence' : 'full native suite', platform: process.platform, started: new Date().toISOString(), checks: [] };
const check = (name, details = {}) => { evidence.checks.push({ name, ...details }); console.log('PASS', name); };
const backend=mockBackend('http://127.0.0.1:7890');
backend.state.routes[0].icon='telegram';
const fixture = createServer(async (req,res) => {
  if(await backend.handle(req,res)) return;
  websiteFixture(req, res);
});
await new Promise(r => fixture.listen(7890,'127.0.0.1',r));
let app, shellBrowser, routeBrowsers=[];
async function connect(port) {
  let error;
  for(let i=0;i<80;i++){try{return await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1500});}catch(e){error=e;await delay(250);}}
  throw error;
}
async function launch(args=[]) {
  app=spawn('src-tauri/target/debug/omnia-tauri.exe',args,{env:{...process.env,OMNIA_SMOKE:'1',OMNIA_API_BASE_URL:'http://127.0.0.1:7890',AUTHENTIK_DISCOVERY_URL:'http://127.0.0.1:7890/discovery',AUTHENTIK_CLIENT_ID:'native-fixture'},windowsHide:true,stdio:'pipe'});
  app.stderr.on('data',b=>process.stderr.write(b));
  shellBrowser=await connect(9222);
  const page=shellBrowser.contexts()[0].pages()[0];
  page.on('pageerror',error=>console.error('SHELL ERROR',String(error)));
  page.on('console',message=>{if(message.type()==='error')console.error('SHELL CONSOLE',message.text());});
  console.log('Shell URL',page.url());
  await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
  await page.getByRole('button',{name:'Sign in',exact:true}).or(page.getByRole('button',{name:'Manage routes',exact:true})).first().waitFor({timeout:25000});
  return page;
}
let revision=0, portA=9223;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const bounds=(x,y,width,height)=>({x,y,width,height});
const spread=[{routeId:'fixture-a',bounds:bounds(108,120,500,600)},{routeId:'fixture-b',bounds:bounds(608,120,500,600)}];
const layout=(page,placements=spread,drawer=false)=>invoke(page,'layout_views',{revision:++revision,placements,drawer});
const action=(page,id,action)=>invoke(page,'route_action',{id,action});
async function waitUnread(page,id,count,source){
  let snapshot;
  for(let i=0;i<80;i++){
    snapshot=await invoke(page,'unread_snapshot');
    const entry=snapshot.unreadCounts.find(entry=>entry.routeId===id);
    if(entry?.count===count&&(!source||entry.source===source))return snapshot;
    await delay(100);
  }
  assert.fail(`Unread count for ${id} did not reach ${count}: ${JSON.stringify(snapshot)}`);
}
async function routes(){routeBrowsers=await Promise.all([connect(portA),connect(9224)]);return Promise.all(routeBrowsers.map(async b=>{const p=b.contexts()[0].pages().find(p=>p.url().includes(':7890'))||b.contexts()[0].pages()[0];await p.waitForSelector('#identity');return p;}));}
async function stop(){for(const b of routeBrowsers)await b.close().catch(()=>{});routeBrowsers=[];await shellBrowser?.close().catch(()=>{});if(app){app.kill();await delay(1500);}}
async function closeForRestart(page) {
  const closing = app;
  const exited = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Native window did not close')), 15000);
    closing.once('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  await invoke(page, 'smoke_inspect', { windowAction: 'close' }).catch(() => {});
  assert.equal(await exited, 0, 'Normal window close must exit cleanly');
  app = undefined;
  await stop();
}
async function windowState(page, predicate) {
  for (let i = 0; i < 80; i++) {
    const state = await invoke(page, 'smoke_inspect');
    if (predicate(state)) return state;
    await delay(100);
  }
  assert.fail('Native window did not reach expected state');
}
function normalSize(state, width, height) {
  return !state.maximized && !state.minimized &&
    Math.abs(state.windowSize.width / state.scale - width) <= 1 &&
    Math.abs(state.windowSize.height / state.scale - height) <= 1;
}
function shellFillsWindow(state) {
  assert.deepEqual(state.shellSize, state.windowSize, 'Trusted shell must fill restored native window');
}

try {
  let shell=await launch();
  await invoke(shell, 'smoke_inspect', { windowAction: 'unmaximize' });
  await windowState(shell, state => !state.maximized);
  await invoke(shell, 'smoke_inspect', { size: [1000, 700] });
  await windowState(shell, state => normalSize(state, 1000, 700));
  await closeForRestart(shell);
  shell = await launch();
  const normal = await windowState(shell, state => normalSize(state, 1000, 700));
  shellFillsWindow(normal);
  check('Normal window dimensions survive native close and restart', normal);
  await invoke(shell, 'smoke_inspect', { windowAction: 'maximize' });
  await windowState(shell, state => state.maximized);
  await closeForRestart(shell);
  shell = await launch();
  const maximized = await windowState(shell, state => state.maximized);
  shellFillsWindow(maximized);
  check('Maximized window and full-size trusted shell survive native close and restart', maximized);
  await invoke(shell, 'smoke_inspect', { windowAction: 'minimize' });
  await windowState(shell, state => state.minimized);
  await closeForRestart(shell);
  shell = await launch();
  const afterMinimize = await windowState(shell, state => state.maximized && !state.minimized);
  shellFillsWindow(afterMinimize);
  await invoke(shell, 'smoke_inspect', { windowAction: 'unmaximize' });
  const restored = await windowState(shell, state => normalSize(state, 1000, 700));
  shellFillsWindow(restored);
  await closeForRestart(shell);
  shell = await launch();
  await windowState(shell, state => normalSize(state, 1000, 700));
  check('Minimizing preserves maximized preference; unmaximize restores original bounds and persists', { afterMinimize, restored });
  await invoke(shell, 'smoke_inspect', { size: [1200, 800] });
  await windowState(shell, state => normalSize(state, 1200, 800));
  await closeForRestart(shell);
  if (!process.argv.includes('--window-only')) {
  shell = await launch();
  await invoke(shell,'auth_logout');await shell.reload();await shell.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  await invoke(shell,'spike_seed');await layout(shell);
  let [a,b]=await routes();
  for(const [p,value] of [[a,'Alice'],[b,'Bob']]){await p.getByRole('textbox').fill(value);await p.locator('#save').click();}
  assert.equal(await a.locator('#identity').textContent(),'Alice');assert.equal(await b.locator('#identity').textContent(),'Bob');
  check('Two same-origin native profiles have independent localStorage and cookies');
  assert.equal(await a.evaluate(()=>document.cookie.includes('identity=Alice')),true);assert.equal(await b.evaluate(()=>document.cookie.includes('identity=Bob')),true);
  const measured=await invoke(shell,'smoke_inspect');
  for(const p of spread){const v=measured.views.find(v=>v.id===p.routeId);assert.ok(Math.abs(v.width-p.bounds.width*measured.scale)<=1);assert.ok(Math.abs(v.x-p.bounds.x*measured.scale)<=1);assert.equal(v.visible,true);}
  check('Measured native bounds follow logical-to-physical DPI conversion',measured);
  const drm=await a.evaluate(async()=>{
    const results={};for(const key of ['com.widevine.alpha','com.microsoft.playready.recommendation']){
      try{await navigator.requestMediaKeySystemAccess(key,[{initDataTypes:['cenc'],videoCapabilities:[{contentType:'video/mp4; codecs="avc1.42E01E"'}],audioCapabilities:[{contentType:'audio/mp4; codecs="mp4a.40.2"'}]}]);results[key]='API accepted configuration';}
      catch(error){results[key]=error.name;}
    }return results;
  });evidence.drmCapabilityProbe=drm;console.log('DRM capability probe (not playback)',drm);
  const denial=await a.evaluate(()=>window.__TAURI_INTERNALS__.invoke('route_action',{id:'fixture-b',action:'clear_session'}).then(()=>false,()=>true));assert.equal(denial,true);check('Untrusted route denied privileged route action');
  await delay(250);await a.evaluate(()=>window.__TAURI_INTERNALS__.invoke('page_signal',{count:0,source:'title'}));
  assert.equal(await a.evaluate(()=>window.__TAURI_INTERNALS__.invoke('page_signal',{count:-1,source:'title'}).then(()=>false,()=>true)),true);
  assert.equal(await a.evaluate(()=>window.__TAURI_INTERNALS__.invoke('page_favicon',{url:'file:///secret'}).then(()=>false,()=>true)),true);
  const discovered=await action(shell,'fixture-a','focus');assert.equal(discovered.faviconUrl,'http://127.0.0.1:7890/favicon.png');check('Native favicon discovery and malformed hint rejection');
  await a.evaluate(()=>document.title='(7) Fixture');await delay(500);const unread=await invoke(shell,'unread_snapshot');assert.equal(unread.total,7);check('Native title unread signal',unread);
  for(const placements of [[spread[0]],spread,[{routeId:'fixture-a',bounds:bounds(108,120,1000,290)},{routeId:'fixture-b',bounds:bounds(108,410,1000,290)}]]){await layout(shell,placements);}
  await layout(shell,spread,true);assert.ok((await invoke(shell,'smoke_inspect')).views.every(v=>v.visible===true));await layout(shell);await action(shell,'fixture-a','focus');
  check('Single/spread/matrix positioning, hide/show, live views during drawer overlay, focus commands');
  const zoom=await action(shell,'fixture-a','zoom_in');assert.equal(zoom.zoomLevel,0.5);await action(shell,'fixture-a','refresh');await a.waitForSelector('#identity');assert.equal(await a.locator('#identity').textContent(),'Alice');check('Refresh and Electron-equivalent zoom scale');
  await a.locator('#popup').click();await delay(1000);
  const popupBrowser=await connect(9223);routeBrowsers.push(popupBrowser);
  const popup=popupBrowser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/popup'));
  assert.ok(popup,'Popup target must exist');await popup.waitForSelector('#identity');assert.equal(await popup.locator('#identity').textContent(),'Alice');
  assert.equal(await popup.evaluate(()=>window.__TAURI_INTERNALS__.invoke('spike_seed').then(()=>false,()=>true)),true);
  assert.equal(await popup.evaluate(()=>sessionStorage.getItem('auth_nonce')),'fixture-nonce');
  assert.equal(await popup.evaluate(()=>!!window.opener),true);await popup.evaluate(()=>window.opener.postMessage('auth-complete',location.origin));
  await a.waitForFunction(()=>document.body.dataset.auth==='complete');assert.ok(!a.url().includes('/popup'));assert.equal(await b.evaluate(()=>localStorage.getItem('identity')),'Bob');
  await popup.close();check('Auth popup preserves opener/postMessage and profile without replacing the waiting route; privileged commands denied');
  await action(shell,'fixture-a','hibernate');await action(shell,'fixture-a','restore');await layout(shell);
  [a,b]=await routes();assert.equal(await a.locator('#identity').textContent(),'Alice');check('Hibernate destroys view; restore retains session');
  await stop();shell=await launch();await invoke(shell,'spike_seed');await layout(shell);[a,b]=await routes();assert.equal(await a.locator('#identity').textContent(),'Alice');assert.equal(await b.locator('#identity').textContent(),'Bob');check('Full application restart retains both isolated identities');
  const cleared=await action(shell,'fixture-a','clear_session');portA=9223+cleared.epoch*2;await layout(shell);[a,b]=await routes();assert.equal(await a.locator('#identity').textContent(),'empty');assert.equal(await b.locator('#identity').textContent(),'Bob');check('Targeted clear resets only profile A');
  await a.evaluate(()=>location.href='/redirect');await delay(700);assert.ok(!a.url().includes('/forbidden'));check('Redirect to disallowed hostname intercepted');
  const trace=await readFile(join(process.env.LOCALAPPDATA,'com.strielok.omnia.tauri','development','smoke','diagnostics','navigation.jsonl'),'utf8');
  const navigationEvents=trace.trim().split('\n').map(line=>JSON.parse(line)).filter(event=>event.timeMs>=Date.parse(evidence.started));
  assert.ok(navigationEvents.some(event=>event.event==='popup_created'));
  assert.ok(navigationEvents.some(event=>event.event==='external_target'&&event.destination.host==='localhost'));
  assert.ok(navigationEvents.every(event=>!('query' in event.destination)&&!('fragment' in event.destination)));
  check('Native callbacks record popup creation and external handoff in redacted local trace');
  // Intercept HTTPS fixture responses in the real WebView2 views. No Google
  // requests leave these synthetic profiles; native navigation policy still runs.
  const inbox='https://mail.google.com/mail/u/0/';
  const regionalHosts=['accounts.google.pl','accounts.google.co.uk','accounts.google.de'];
  const regionalHops=[];
  for(const host of [...regionalHosts].reverse()) regionalHops.unshift('https://'+host+'/accounts/SetSID?continue='+encodeURIComponent(regionalHops[0]||inbox));
  const sessionHop='https://accounts.youtube.com/accounts/SetSID?continue='+encodeURIComponent(regionalHops[0]);
  const login='https://mail.google.com/mail/?continue='+encodeURIComponent(sessionHop);
  const googleFixture=async route=>{
    const url=new URL(route.request().url());
    if(url.href===login) return route.fulfill({status:200,contentType:'text/html',headers:{'set-cookie':'native_fixture_auth=Alice; Secure; SameSite=Lax; Path=/'},body:`<!doctype html><script>location.replace(${JSON.stringify(sessionHop)})</script>`});
    const hopIndex=[sessionHop,...regionalHops].indexOf(url.href);
    if(hopIndex>=0) return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><script>location.replace(${JSON.stringify([...regionalHops,inbox][hopIndex])})</script>`});
    if(url.href===inbox) return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Odebrane (12)</title><nav><div><a href="#inbox">Odebrane</a><span id="fixture-count">23</span></div></nav><p id="auth-result"></p><script>document.querySelector("#auth-result").textContent=document.cookie.includes("native_fixture_auth=Alice")?"Alice":"empty";</script>'});
    return route.abort();
  };
  await a.route('https://**/*',googleFixture);await b.route('https://**/*',googleFixture);
  const handoffStarted=Date.now();
  await a.goto(login,{timeout:10000});await a.waitForURL(inbox,{timeout:10000});
  assert.equal(await a.locator('#auth-result').textContent(),'Alice');
  await b.goto(inbox,{timeout:10000});assert.equal(await b.locator('#auth-result').textContent(),'empty');
  const handoffTrace=(await readFile(join(process.env.LOCALAPPDATA,'com.strielok.omnia.tauri','development','smoke','diagnostics','navigation.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line)).filter(event=>event.timeMs>=handoffStarted);
  assert.ok(handoffTrace.some(event=>event.event==='navigation_allowed'&&event.destination.host==='accounts.youtube.com'));
  for(const host of regionalHosts) assert.ok(handoffTrace.some(event=>event.event==='navigation_allowed'&&event.destination.host===host));
  assert.ok(!handoffTrace.some(event=>event.event==='external_target'||event.event==='popup_requested'));
  check('Gmail continuation through YouTube and Polish, UK and German account hosts completes in the originating native profile without browser handoff; duplicate profile stays signed out');
  await waitUnread(shell,'fixture-a',23);await waitUnread(shell,'fixture-b',23);
  await a.locator('#fixture-count').evaluate(node=>{node.textContent='0';});
  await waitUnread(shell,'fixture-a',0);
  check('Injected Gmail DOM signals cross the HTTPS native boundary and clear unread counts');
  await b.locator('#fixture-count').evaluate(node=>{node.textContent='0';});
  await waitUnread(shell,'fixture-b',0);
  await a.evaluate(()=>{document.title='Inbox - Gmail';document.querySelector('#fixture-count').remove();});
  await waitUnread(shell,'fixture-a',0,'gmail-title');
  for(let cycle=0;cycle<2;cycle++){
    await a.evaluate(()=>{const badge=document.createElement('span');badge.id='fixture-count';badge.textContent='1';document.querySelector('nav div').append(badge);});
    await waitUnread(shell,'fixture-a',1,'gmail-dom');
    assert.equal((await invoke(shell,'smoke_inspect')).title,'(1) Omnia');
    await a.locator('#fixture-count').evaluate(node=>node.remove());
    await waitUnread(shell,'fixture-a',0,'gmail-title');
    assert.equal((await invoke(shell,'smoke_inspect')).title,'Omnia');
  }
  check('Gmail last-unread badge removal clears the native total across repeated title-zero -> DOM-one -> title-zero transitions');
  await mkdir('reports',{recursive:true});await shell.screenshot({path:'reports/native-shell.png'});
  await stop();portA=9223;shell=await launch();
  await invoke(shell,'auth_logout');await shell.reload();
  backend.state.discoveryDelay=3000;
  const pendingLogin=invoke(shell,'auth_login').then(()=>false,()=>true);
  await delay(250);const cancelledAt=Date.now();await invoke(shell,'auth_cancel');
  assert.equal(await pendingLogin,true);assert.ok(Date.now()-cancelledAt<2000);
  backend.state.discoveryDelay=0;check('Sign-in cancellation interrupts in-flight discovery without waiting for its timeout');
  await shell.getByRole('button',{name:'Sign in',exact:true}).click();
  await shell.getByRole('button',{name:'Manage routes',exact:true}).waitFor({timeout:25000});
  check('Native OIDC PKCE exchange, OS credential storage and production route-list contract against local fixture');
  const workspaceRoutes=(await invoke(shell,'workspace_bootstrap')).routes;
  const workspaceEpoch=workspaceRoutes.find(route=>route.id==='fixture-a').epoch;
  const workspaceBrowser=await connect(9323+workspaceEpoch*2);routeBrowsers.push(workspaceBrowser);
  const workspacePage=workspaceBrowser.contexts()[0].pages().find(page=>page.url().includes(':7890'));
  assert.ok(workspacePage);
  const routeOrder=()=>shell.locator('nav a').allTextContents();
  const initialViews=(await invoke(shell,'smoke_inspect')).views.map(v=>v.label).sort();
  const firstLink=shell.getByRole('link',{name:'Fixture A',exact:true});
  const secondLink=shell.getByRole('link',{name:'Fixture B',exact:true});
  await firstLink.dragTo(secondLink,{targetPosition:{x:30,y:70}});
  for(let attempt=0;attempt<80&&backend.state.routes.find(r=>r.id==='fixture-a').order!==1;attempt++)await delay(100);
  assert.equal(backend.state.routes.find(r=>r.id==='fixture-a').order,1);
  assert.deepEqual((await routeOrder()).map(v=>v.trim()),['Fixture B','Fixture A']);
  assert.equal((await invoke(shell,'workspace_bootstrap')).activeTab,'fixture-a');
  assert.deepEqual((await invoke(shell,'smoke_inspect')).views.map(v=>v.label).sort(),initialViews);
  await shell.getByRole('button',{name:'Manage routes',exact:true}).click();
  const firstHandle=shell.getByRole('button',{name:'Reorder Fixture A',exact:true});
  const secondCard=shell.getByRole('button',{name:'Reorder Fixture B',exact:true}).locator('xpath=ancestor::*[contains(@class,"route-reorder-item")]');
  await firstHandle.dragTo(secondCard,{targetPosition:{x:30,y:5}});
  for(let attempt=0;attempt<80&&backend.state.routes.find(r=>r.id==='fixture-a').order!==0;attempt++)await delay(100);
  assert.equal(backend.state.routes.find(r=>r.id==='fixture-a').order,0);
  assert.deepEqual((await routeOrder()).map(v=>v.trim()),['Fixture A','Fixture B']);
  await shell.getByRole('button',{name:'Close manage routes',exact:true}).click();
  check('Real HTML drag gestures reorder sidebar and management cards, persist API order, preserve selection and native view generations');
  await workspacePage.evaluate(()=>{document.title='Inbox (17)';});
  await waitUnread(shell,'fixture-a',17);
  await shell.getByLabel('17 unread',{exact:true}).waitFor();
  assert.equal((await invoke(shell,'smoke_inspect')).title,'(17) Omnia');
  await workspacePage.evaluate(()=>{document.title='Inbox';});
  await waitUnread(shell,'fixture-a',0);
  await shell.getByLabel('17 unread',{exact:true}).waitFor({state:'detached'});
  assert.equal((await invoke(shell,'smoke_inspect')).title,'Omnia');
  check('Injected unread updates render a visible sidebar badge and native window total, then clear both');
  await workspacePage.route('https://**/*',route=>new URL(route.request().url()).hostname==='web.telegram.org'
    ? route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><title>Telegram</title>
      <div id="LeftColumn"><div class="chat-list"><div class="Chat"><a class="ListItem-button" href="#101">
        <div class="subtitle">Fixture preview<div class="chat-badge-transition shown open"><div class="hashed-wrapper">
          <div class="hashed-badge"><span id="telegram-count">1</span></div>
        </div></div></div></a></div>
        <div class="Chat"><div class="subtitle"><div class="chat-badge-transition shown open"><button>Open</button></div></div></div>
      </div></div>`}) : route.abort());
  await workspacePage.goto('https://web.telegram.org/a/');
  for(const count of [1,4,0]) {
    if(count===4) await workspacePage.locator('#telegram-count').evaluate(node=>{node.innerHTML='<div><div>4</div><div>1</div><div>4</div></div>';});
    if(count===0) await workspacePage.locator('#telegram-count').evaluate(node=>node.remove());
    await waitUnread(shell,'fixture-a',count);
    if(count) await shell.getByLabel(`${count} unread`,{exact:true}).waitFor();
    else await shell.getByLabel('4 unread',{exact:true}).waitFor({state:'detached'});
    assert.equal((await invoke(shell,'smoke_inspect')).title,count?`(${count}) Omnia`:'Omnia');
  }
  check('Telegram Web A DOM counters with plain title and no Badging API update the visible sidebar/native total 1 -> 4 -> 0');
  for(const count of [1,0]) {
    await workspacePage.evaluate(count=>window.tauri.setNotificationsCount(count),count);
    await waitUnread(shell,'fixture-a',count);
    await shell.getByLabel('1 unread',{exact:true}).waitFor({state:count?'visible':'detached'});
    assert.equal((await invoke(shell,'smoke_inspect')).title,count?'(1) Omnia':'Omnia');
  }
  check('Telegram Web A Tauri-specific count callback updates and clears the sidebar/native total');
  await workspacePage.evaluate(()=>{document.body.style.background='rgb(40, 160, 240)';});
  await delay(500);
  const beforeDrawer=await invoke(shell,'smoke_inspect');
  assert.deepEqual(beforeDrawer.pixels[1],[40,160,240],'Native fixture must be foreground and visibly blue before overlay');
  await shell.getByRole('button',{name:'Manage routes',exact:true}).click();
  await shell.getByRole('heading',{name:'Manage routes'}).waitFor();
  await shell.waitForFunction(()=>document.documentElement.classList.contains('native-drawer-open'));
  await delay(500);
  const blueDrawer=await invoke(shell,'smoke_inspect');
  assert.ok(blueDrawer.views.find(v=>v.id==='fixture-a').visible);
  assert.equal(blueDrawer.views.find(v=>v.id==='fixture-a').label,beforeDrawer.views.find(v=>v.id==='fixture-a').label);
  const near=(actual,expected)=>assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=8),`Composited pixel ${actual} expected ${expected}`);
  near(blueDrawer.pixels[1],[21,83,132]);
  await workspacePage.evaluate(()=>{document.body.style.background='rgb(240, 80, 40)';});
  await delay(500);
  const redDrawer=await invoke(shell,'smoke_inspect');
  near(redDrawer.pixels[1],[121,43,32]);
  assert.equal(await shell.evaluate(()=>document.hasFocus()),true);
  check('Real native compositing shows live page color changes under translucent drawer backdrop without recreating the view', {before:beforeDrawer.pixels,blue:blueDrawer.pixels,red:redDrawer.pixels});
  await invoke(shell,'smoke_inspect',{size:[1000,700]});
  await shell.waitForFunction(()=>innerWidth===1000&&innerHeight===700);
  await delay(500);
  const resizedDrawer=await invoke(shell,'smoke_inspect');
  near(resizedDrawer.pixels[1],[121,43,32]);
  assert.equal(resizedDrawer.views.find(v=>v.id==='fixture-a').label,beforeDrawer.views.find(v=>v.id==='fixture-a').label);
  await shell.getByTestId('drawer-backdrop').click({position:{x:850,y:500}});
  await shell.getByRole('heading',{name:'Manage routes'}).waitFor({state:'detached'});
  await delay(500);
  near((await invoke(shell,'smoke_inspect')).pixels[1],[240,80,40]);
  assert.equal(await workspacePage.evaluate(()=>document.hasFocus()),true);
  await shell.getByRole('button',{name:'Settings',exact:true}).click();
  await shell.waitForFunction(()=>document.documentElement.classList.contains('native-drawer-open'));
  await delay(300);near((await invoke(shell,'smoke_inspect')).pixels[1],[121,43,32]);
  await shell.keyboard.press('Escape');
  await shell.waitForFunction(()=>!document.documentElement.classList.contains('native-drawer-open'));
  await delay(300);near((await invoke(shell,'smoke_inspect')).pixels[1],[240,80,40]);
  await invoke(shell,'smoke_inspect',{size:[1200,800]});
  await shell.waitForFunction(()=>innerWidth===1200&&innerHeight===800);
  await shell.getByRole('button',{name:'Manage routes',exact:true}).click();
  await shell.getByRole('heading',{name:'Manage routes'}).waitFor();
  check('Live drawer survives native resize, click-outside close and Settings/Escape; focus returns to original website');
  await shell.getByRole('button',{name:'Rename',exact:true}).first().click();
  await shell.getByRole('textbox').fill('Renamed A');await shell.getByRole('button',{name:'Save',exact:true}).click();
  await shell.getByText('Renamed A',{exact:true}).first().waitFor();assert.equal(backend.state.routes[0].name,'Renamed A');
  await shell.getByRole('button',{name:'Hibernate',exact:true}).first().click();await shell.getByRole('button',{name:'Restore',exact:true}).first().waitFor();
  await shell.getByRole('button',{name:'Restore',exact:true}).first().click();
  await shell.getByRole('button',{name:'Close manage routes'}).click();
  await shell.getByRole('button',{name:'Columns layout',exact:true}).click();
  await shell.getByRole('button',{name:'Matrix layout',exact:true}).click();
  await shell.getByRole('button',{name:'Single layout',exact:true}).click();
  check('Retained React drawer, rename/PATCH, hibernation and all three layout controls operate on native views');
  await shell.getByRole('button',{name:'Add route',exact:true}).first().click();
  await shell.getByLabel('Label',{exact:true}).fill('Created site');
  await shell.getByRole('combobox').selectOption('link');
  await shell.getByLabel('URL',{exact:true}).fill('http://127.0.0.1:7890/created');
  await shell.getByRole('button',{name:'Save route',exact:true}).click();
  await shell.getByRole('link',{name:'Created site',exact:true}).waitFor();assert.equal(backend.state.routes.length,3);
  await shell.getByRole('button',{name:'Manage routes',exact:true}).click();
  await shell.getByRole('button',{name:'Delete route',exact:true}).last().click();
  await delay(300);assert.equal(backend.state.routes.length,2);check('Create/POST metadata and delete/204 through retained UI');
  backend.state.offline=true;
  const offline=await invoke(shell,'workspace_bootstrap');assert.equal(offline.isOffline,true);assert.equal(offline.routes.length,2);
  backend.state.offline=false;const online=await invoke(shell,'workspace_bootstrap');assert.equal(online.isOffline,false);check('Temporary route API outage uses account-scoped cache and reconciles on recovery');
  await shell.getByRole('button',{name:'Close manage routes',exact:true}).click();
  await shell.getByRole('link',{name:'Renamed A',exact:true}).dragTo(shell.getByRole('link',{name:'Fixture B',exact:true}),{targetPosition:{x:30,y:70}});
  for(let attempt=0;attempt<80&&backend.state.routes.find(r=>r.id==='fixture-a').order!==1;attempt++)await delay(100);
  assert.equal(backend.state.routes.find(r=>r.id==='fixture-a').order,1);
  await delay(300);
  await stop();shell=await launch();await shell.getByRole('button',{name:'Manage routes',exact:true}).waitFor({timeout:25000});assert.ok(backend.state.refreshes>0);check('Cold startup refreshes OS-stored credentials and restores workspace');
  assert.deepEqual((await shell.locator('nav a').allTextContents()).map(v=>v.trim()),['Fixture B','Renamed A']);
  check('Drag-reordered routes retain their order after a full native restart');
  const persisted=await shell.evaluate(()=>JSON.stringify(localStorage));assert.ok(!persisted.includes('fixture-access')&&!persisted.includes('fixture-refresh'));check('Raw tokens absent from frontend localStorage');
  backend.state.invalid=true;
  assert.equal(await invoke(shell,'workspace_bootstrap').then(()=>false,()=>true),true);
  assert.equal((await invoke(shell,'workspace_bootstrap')).user,null);backend.state.invalid=false;check('Invalid authentication clears session instead of exposing offline cache');
  backend.state.holdAuthorization=true;backend.state.code=null;await shell.reload();await shell.getByRole('button',{name:'Sign in',exact:true}).click();
  for(let i=0;i<100&&!backend.state.code;i++)await delay(50);assert.ok(backend.state.code);
  const callback='omnia://auth/callback?code=fixture-code&state='+backend.state.code.state;
  await stop();shell=await launch([callback]);await shell.getByRole('button',{name:'Manage routes',exact:true}).waitFor({timeout:25000});check('Cold-start callback consumes OS-stored pending state');
  const exchanged=backend.state.requests.filter(r=>r.grant==='authorization_code').length;
  const replay=spawn('src-tauri/target/debug/omnia-tauri.exe',[callback],{env:{...process.env,OMNIA_SMOKE:'1'},windowsHide:true,stdio:'ignore'});await new Promise(resolve=>replay.once('exit',resolve));await delay(300);
  assert.equal(backend.state.requests.filter(r=>r.grant==='authorization_code').length,exchanged);check('Already-running instance rejects replayed callback without exchanging the code');
  await invoke(shell,'auth_logout');
  }
  evidence.contractRequests=backend.state.requests;
  evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=String(error);console.error(error);try{const page=shellBrowser.contexts()[0].pages()[0];console.error('SHELL',await page.locator('body').innerText());console.error('REQUESTS',JSON.stringify(backend.state.requests));await page.screenshot({path:'reports/native-failure.png'});}catch{}process.exitCode=1;}
finally{await stop();fixture.close();await mkdir('reports',{recursive:true});await writeFile('reports/native-smoke.json',JSON.stringify(evidence,null,2));}
