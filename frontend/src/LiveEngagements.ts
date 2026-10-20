import {api,type Post} from './api';
export type Engagements=Pick<Post,'id'|'_count'|'viewer'>;
type Listener=(metrics:Engagements)=>void;
const watchers=new Map<string,Set<Listener>>();let session='';let timer:ReturnType<typeof setInterval>|undefined;let soon:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;let running=false;
async function refresh(){if(running||document.hidden||!watchers.size)return;running=true;const identity=session;const request=new AbortController();controller=request;try{const ids=[...watchers.keys()];for(let i=0;i<ids.length;i+=20){const result=await api<{data:Engagements[]}>('/social/engagements?ids='+ids.slice(i,i+20).join(','),{signal:request.signal});if(identity!==session||request.signal.aborted)return;for(const row of result.data)for(const notify of watchers.get(row.id)??[])notify(row);}}catch{/* Background counts must not interrupt reading. */}finally{if(controller===request){controller=undefined;running=false;}}}
function wake(){void refresh();}
export function watchEngagements(id:string,viewer:string,listener:Listener){
 if(viewer!==session){controller?.abort();controller=undefined;running=false;watchers.clear();session=viewer;}
 const listeners=watchers.get(id)??new Set<Listener>();listeners.add(listener);watchers.set(id,listeners);
 if(!timer){timer=setInterval(wake,12000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);}
 clearTimeout(soon);soon=setTimeout(wake,150);
 return()=>{listeners.delete(listener);if(!listeners.size&&watchers.get(id)===listeners)watchers.delete(id);if(!watchers.size){clearInterval(timer);clearTimeout(soon);timer=undefined;controller?.abort();controller=undefined;running=false;window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);}};
}
