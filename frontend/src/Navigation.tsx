import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSession } from './session';
const positions=new Map<string,number>();
export function BackButton({fallback}:{fallback?:string}){const navigate=useNavigate();const {user}=useSession();return <button type="button" className="icon-button back-button" aria-label="Go back" title="Go back" onClick={()=>{if((window.history.state?.idx??0)>0)navigate(-1);else navigate(fallback??(user?'/home':'/search'),{replace:true});}}><ArrowLeft size={21}/></button>;}
export function NavigationRestoration(){
 const location=useLocation(),type=useNavigationType();
 useEffect(()=>{const previous=history.scrollRestoration;history.scrollRestoration='manual';return()=>{history.scrollRestoration=previous;};},[]);
 useLayoutEffect(()=>{let frame=0,attempt=0,cancelled=false;const destination=type==='POP'?(positions.get(location.key)??0):0;const cancel=()=>{cancelled=true;};for(const e of ['wheel','touchstart','keydown'])window.addEventListener(e,cancel,{once:true,passive:true});const restore=()=>{if(cancelled)return;window.scrollTo(0,destination);if(document.documentElement.scrollHeight-innerHeight<destination&&attempt++<600)frame=requestAnimationFrame(restore);};frame=requestAnimationFrame(restore);const save=()=>{if(!cancelled&&attempt>0&&document.documentElement.scrollHeight-innerHeight<destination)return;positions.set(location.key,window.scrollY);if(positions.size>100)positions.delete(positions.keys().next().value!);};window.addEventListener('scroll',save,{passive:true});return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',save);for(const e of ['wheel','touchstart','keydown'])window.removeEventListener(e,cancel);};},[location.key,type]);return null;
}
export function safeNext(raw:string|null|undefined){if(!raw||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f]/.test(raw))return '/home';try{const decoded=decodeURIComponent(raw);if(decoded.startsWith('//')||/[\\\u0000-\u001f]/.test(decoded))return '/home';const u=new URL(raw,'https://fpi.invalid');if(u.origin!=='https://fpi.invalid'||/^\/(login|register)(\/|$)/.test(u.pathname))return '/home';return u.pathname==='/'?'/home':u.pathname+u.search+u.hash;}catch{return '/home';}}
