import {test,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:20000});
test('like delivery updates title, shows live toast and requests desktop permission only on click',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>{
  const state={permission:'default',requests:0,alerts:[] as {title:string;body:string;closed:boolean}[]};(window as any).__notificationTest=state;
  class MockNotification{static get permission(){return state.permission;}static async requestPermission(){state.requests++;state.permission='granted';return 'granted';}}
  Object.defineProperty(window,'Notification',{configurable:true,value:MockNotification});
  const registration={showNotification:async(title:string,options:{body:string})=>{state.alerts.push({title,body:options.body,closed:false});},getNotifications:async()=>state.alerts.filter(x=>!x.closed).map(x=>({close:()=>{x.closed=true;}}))};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration}});
 });
 const suffix=Date.now().toString();await page.goto('/register');await page.getByLabel('Display name',{exact:true}).fill('Like Recipient');await page.getByLabel('Username',{exact:true}).fill('likes'+suffix);await page.getByLabel('Email address',{exact:true}).fill('likes'+suffix+'@example.test');await page.getByLabel('Password',{exact:true}).fill('like recipient password 123');await page.getByRole('button',{name:'Create your account'}).click();await page.getByLabel('Your post',{exact:true}).fill('A post to like '+suffix);await page.getByRole('button',{name:'Post',exact:true}).click();const postToast=page.locator('.toast').filter({hasText:'Post sent.'});await expect(postToast).toBeVisible();const id=(await postToast.getByRole('link',{name:'View',exact:true}).getAttribute('href'))!.split('/').at(-1)!;
 const response=await page.request.post('/api/v1/auth/register',{data:{displayName:'Another Member',username:'liker'+suffix,email:'liker'+suffix+'@example.test',password:'like actor password 123'}});expect(response.status()).toBe(201);const actor=await response.json();const headers={Authorization:'Bearer '+actor.accessToken};
 await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/notifications/sync'&&r.status()===200);await page.bringToFront();
 expect((await page.request.put(`/api/v1/social/posts/${id}/likes`,{headers,data:{}})).status()).toBe(200);
 await expect(page).toHaveTitle('(1) FpiUpdates');await expect(page.locator('.toast').filter({hasText:'You have a new notification.'})).toBeVisible();
 await page.locator('.left-sidebar nav').getByRole('link',{name:'Notifications, 1 unread',exact:true}).click();await expect(page.locator('.notification-row')).toContainText('liked your post');expect(await page.evaluate(()=>(window as any).__notificationTest.requests)).toBe(0);
 await page.getByRole('button',{name:'Notification settings',exact:true}).click();await page.getByRole('button',{name:'Enable desktop notifications',exact:true}).click();await expect(page.getByRole('button',{name:'Send test notification',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__notificationTest.requests)).toBe(1);expect(await page.evaluate(()=>(window as any).__notificationTest.alerts.length)).toBe(1);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});});
 expect((await page.request.delete(`/api/v1/social/posts/${id}/likes`,{headers})).status()).toBe(200);
 await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/notifications/sync'&&r.status()===200);await expect(page).toHaveTitle('FpiUpdates');
 expect((await page.request.put(`/api/v1/social/posts/${id}/likes`,{headers,data:{}})).status()).toBe(200);
 await expect.poll(()=>page.evaluate(()=>(window as any).__notificationTest.alerts.length)).toBe(2);await expect(page).toHaveTitle('(1) FpiUpdates');expect(await page.evaluate(()=>(window as any).__notificationTest.alerts.at(-1).body)).toBe('You have new activity. Open FpiUpdates to view it.');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'Mark all as read',exact:true}).click();await expect(page).toHaveTitle('FpiUpdates');
 await page.getByRole('button',{name:'Disable desktop alerts',exact:true}).click();await expect(page.getByRole('button',{name:'Enable desktop notifications',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();if(process.env.E2E_SCREENSHOT_DIR)await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/delivery-controls.png',fullPage:true});
});

test('notification worker registers without caching API responses',async({page})=>{
 await page.goto('/about');
 const url=await page.evaluate(async()=>{await navigator.serviceWorker.register('/notification-worker.js',{scope:'/'});return (await navigator.serviceWorker.ready).active?.scriptURL;});
 expect(url).toBe('http://localhost:5173/notification-worker.js');
 await page.evaluate(()=>navigator.serviceWorker.controller?Promise.resolve():new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true})));
 expect(await page.evaluate(()=>fetch('/api/v1/health').then(response=>response.status))).toBe(200);
 expect(await page.evaluate(()=>fetch('/api/v1/notifications').then(response=>response.status))).toBe(401);
 expect(await page.evaluate(()=>caches.keys())).toEqual([]);
});

test('blocked desktop permission is explained without prompting automatically',async({page})=>{
 await page.addInitScript(()=>{(window as any).__permissionRequests=0;class DeniedNotification{static permission='denied';static async requestPermission(){(window as any).__permissionRequests++;return 'denied';}}Object.defineProperty(window,'Notification',{value:DeniedNotification,configurable:true});});
 const suffix=Date.now().toString();await page.goto('/register');await page.getByLabel('Display name',{exact:true}).fill('Permission Member');await page.getByLabel('Username',{exact:true}).fill('denied'+suffix);await page.getByLabel('Email address',{exact:true}).fill('denied'+suffix+'@example.test');await page.getByLabel('Password',{exact:true}).fill('denied browser password 123');await page.getByRole('button',{name:'Create your account'}).click();await expect(page.getByLabel('Your post',{exact:true})).toBeVisible();await page.locator('.left-sidebar nav').getByRole('link',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:'Notification settings',exact:true}).click();await expect(page.getByRole('button',{name:'Enable desktop notifications',exact:true})).toBeDisabled();await expect(page.getByText('Blocked in your browser. Allow notifications in site settings.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__permissionRequests)).toBe(0);
});
