// One worker handles installation, a public offline page and existing notifications.
// Never cache private pages, API responses, mail/reset links, avatars or messages.
const CACHE='fpiupdates-public-v028';
const PUBLIC=['/offline.html','/manifest.webmanifest','/pwa/icon-192.png','/pwa/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC.map(url=>new Request(url,{credentials:'omit',cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('fpiupdates-public-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||/^\/api(?:\/|$)/i.test(url.pathname))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).catch(async()=>await caches.match('/offline.html')||Response.error()));return;}
 if(PUBLIC.includes(url.pathname)&&!url.search)event.respondWith(fetch(req).catch(async()=>await caches.match(url.pathname)||Response.error()));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const href=event.notification.data?.href;const safe=typeof href==='string'&&/^\/(?!\/)[a-zA-Z0-9_/?=&.%#-]*$/.test(href)?href:'/notifications';const destination=new URL(safe,self.location.origin).href;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.navigate(destination);await client.focus();return;}}
  await self.clients.openWindow(destination);
 })());
});

self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={};try{data=event.data?.json()||{};}catch{}for(const w of await self.clients.matchAll({type:'window',includeUncontrolled:true}))w.postMessage({type:'INBOX_UPDATED'});await self.registration.showNotification('FpiUpdates',{body:typeof data.body==='string'?data.body.slice(0,200):'You have new activity. Open FpiUpdates to catch up.',icon:'/pwa/icon-192.png',badge:'/pwa/badge.png',tag:'fpiupdates-inbox',data:{href:'/notifications'}});})());});
