import {mediaUrl} from './api';
export type DesktopDetail={kind:string;actor:{displayName:string;username:string;avatarMediaId?:string|null};preview:string|null;href:string};
export const previewPreference=(id?:string)=>{try{return !!id&&localStorage.getItem('fpiupdates.desktop.preview.'+id)!=='0';}catch{return true;}};
export function savePreviewPreference(id:string,value:boolean){try{localStorage.setItem('fpiupdates.desktop.preview.'+id,value?'1':'0');}catch{}}
export const desktopKey=(userId:string)=>'fpiupdates.desktop.'+userId;
export function desktopPreference(userId?:string){if(!userId)return false;try{return localStorage.getItem(desktopKey(userId))==='1';}catch{return false;}}
export function saveDesktopPreference(userId:string,value:boolean){try{if(value)localStorage.setItem(desktopKey(userId),'1');else localStorage.removeItem(desktopKey(userId));}catch{/* The current-tab preference still works when storage is unavailable. */}}
export function desktopSupported(){return typeof Notification!=='undefined'&&typeof Notification.requestPermission==='function'&&window.isSecureContext;}
async function registration(){
 if(!('serviceWorker' in navigator))return null;
 await navigator.serviceWorker.register('/notification-worker.js',{scope:'/'});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Desktop notifications could not start. Please retry.')),10000);})]);}finally{if(timer)clearTimeout(timer);}
}
const openAlerts=new Set<Notification>();
export async function showDesktopAlert(test=false,isCurrent=()=>true,detail?:DesktopDetail|null){
 if(!desktopSupported()||Notification.permission!=='granted'||!isCurrent())return;
 const actions:Record<string,string>={LIKE:'liked your post',REPLY:'replied to you',QUOTE:'quoted your post',REPOST:'reposted your post',MENTION:'mentioned you',FOLLOW:'followed you',POST_ALERT:'posted an update'};
 const title=!test&&detail?detail.actor.displayName:'FpiUpdates';const body=test?'Desktop notifications are enabled.':detail?`@${detail.actor.username} ${actions[detail.kind]??'shared an update'}${detail.preview?'\n'+detail.preview:''}`:'You have new activity. Open FpiUpdates to view it.';
 const href=detail?.href&&/^\/(?!\/)[a-zA-Z0-9_/?=&.%#-]*$/.test(detail.href)?detail.href:'/notifications';const icon=detail?.actor.avatarMediaId?mediaUrl(detail.actor.avatarMediaId):'/brand-logo-color.webp';
 const worker=await registration();if(!isCurrent())return;
 if(worker){await worker.showNotification(title,{body,icon,tag:'fpiupdates-activity',data:{href}});return;}
 const alert=new Notification(title,{body,icon,tag:'fpiupdates-activity',data:{href}});openAlerts.add(alert);alert.onclose=()=>openAlerts.delete(alert);alert.onclick=()=>{window.focus();window.location.assign(href);alert.close();};
}
export async function closeDesktopAlerts(){
 for(const alert of openAlerts)alert.close();openAlerts.clear();
 if('serviceWorker' in navigator){try{const worker=await navigator.serviceWorker.getRegistration('/');for(const alert of await worker?.getNotifications({tag:'fpiupdates-activity'})??[])alert.close();}catch{/* Closing an alert must not block sign-out. */}}
}
