import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
type Action={label:string;href:string};
type Notice={id:number;message:string;kind:'success'|'error'|'info';action?:Action};
let sequence=0;
export function toast(message:string,kind:Notice['kind']='info',action?:Action){const safe=action&&/^\/(?!\/)/.test(action.href)?action:undefined;window.dispatchEvent(new CustomEvent('fpi-toast',{detail:{id:++sequence,message,kind,action:safe}}));}
export function useToastNotice(message:string,kind:Notice['kind']='success'){useEffect(()=>{if(message)toast(message,kind);},[message,kind]);}
export function ToastHost(){
 const [feedBounds,setFeedBounds]=useState<{left:number;width:number}|null>(null);useEffect(()=>{const update=()=>{const el=document.querySelector<HTMLElement>('.main-column');const rect=el?.getBoundingClientRect();setFeedBounds(rect&&innerWidth>700?{left:rect.left,width:rect.width}:null);};update();const observer=new ResizeObserver(update);observer.observe(document.body);window.addEventListener('resize',update);window.addEventListener('popstate',update);const timer=setInterval(update,1000);return()=>{observer.disconnect();clearInterval(timer);window.removeEventListener('resize',update);window.removeEventListener('popstate',update);};},[]);
 const [items,setItems]=useState<Notice[]>([]);const timers=useRef(new Map<number,ReturnType<typeof setTimeout>>());
 function pause(id:number){const timer=timers.current.get(id);if(timer)clearTimeout(timer);timers.current.delete(id);}
 function dismiss(id:number){pause(id);setItems(old=>old.filter(x=>x.id!==id));}
 function resume(item:Notice){pause(item.id);timers.current.set(item.id,setTimeout(()=>dismiss(item.id),item.kind==='error'||item.action?10000:6000));}
 useEffect(()=>{const handler=(event:Event)=>{const item=(event as CustomEvent<Notice>).detail;setItems(old=>[...old.filter(x=>x.message!==item.message),item].slice(-4));resume(item);};window.addEventListener('fpi-toast',handler);return()=>{window.removeEventListener('fpi-toast',handler);for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();};},[]);
 return <div className={'toast-stack'+(feedBounds?' toast-in-feed':'')} style={feedBounds?{left:feedBounds.left+12,width:Math.max(0,feedBounds.width-24),right:'auto'}:undefined} aria-label="Notifications">{items.map(item=><div className={`toast toast-${item.kind}`} key={item.id} onMouseEnter={()=>pause(item.id)} onMouseLeave={event=>{if(!event.currentTarget.contains(document.activeElement))resume(item);}} onFocusCapture={()=>pause(item.id)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!event.currentTarget.matches(':hover'))resume(item);}}><span role={item.kind==='error'?'alert':'status'}>{item.message}</span>{item.action&&<Link className="toast-action" to={item.action.href} onClick={()=>dismiss(item.id)}>{item.action.label}</Link>}<button type="button" aria-label="Dismiss notification" onClick={()=>dismiss(item.id)}>×</button></div>)}</div>;
}
