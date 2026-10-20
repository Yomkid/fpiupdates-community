import {Avatar} from './Avatar';
import {detectedLinks} from './links';
import { useEffect, useId, useState, type RefObject } from 'react';
import { api, errorMessage, type User } from './api';
import { toast } from './toast';
type Choice={key:string;label:string;detail:string;insert:string;user?:User};
export function EntityTextarea({inputRef,id,value,onChange,disabled,autoFocus,onFocus,placeholder}:{inputRef:RefObject<HTMLTextAreaElement|null>;id:string;value:string;onChange:(s:string)=>void;disabled:boolean;autoFocus:boolean;onFocus:()=>void;placeholder:string}){
 const listId=useId();const [scrollTop,setScrollTop]=useState(0);const [hasFocus,setHasFocus]=useState(false);const [caret,setCaret]=useState(0),[choices,setChoices]=useState<Choice[]>([]),[selected,setSelected]=useState(0),[dismissed,setDismissed]=useState(false),[message,setMessage]=useState('');
 const before=value.slice(0,caret),match=before.match(/(?:^|[^\p{L}\p{M}\p{N}_@#/.])([@#])([\p{L}\p{M}\p{N}_]*)$/u);
 const inUrl=detectedLinks(before).some(link=>link.end===before.length);
 const type=match?.[1],prefix=match?.[2]??'';const start=match?caret-prefix.length-1:0;
 const valid=type==='@'?/^[a-z0-9_]{0,30}$/i.test(prefix):prefix.length<=64;
 const open=hasFocus&&!!match&&!inUrl&&valid&&!dismissed&&!disabled;
 useEffect(()=>{
  setChoices([]);setSelected(0);if(!open)return;
  if(!prefix){setMessage(type==='@'?'Type a username to mention someone.':'Type a hashtag.');return;}
  const controller=new AbortController();setMessage('Finding suggestions…');const timer=setTimeout(()=>{
   const query=new URLSearchParams({q:prefix});
   const task=type==='@'?api<User[]>('/discovery/mentions?'+query,{signal:controller.signal}).then(rows=>rows.map(u=>({key:u.id,label:u.displayName,detail:'@'+u.username,insert:'@'+u.username,user:u}))):api<{tag:string}[]>('/discovery/hashtags?'+query,{signal:controller.signal}).then(rows=>rows.map(r=>({key:r.tag,label:'#'+r.tag,detail:'Hashtag',insert:'#'+r.tag})));
   task.then(items=>{if(!controller.signal.aborted){setChoices(items);setMessage(items.length?'':type==='@'?'No matching accounts.':'New hashtag — keep typing or publish.');}}).catch(e=>{if(!controller.signal.aborted)setMessage(errorMessage(e));});
  },250);return()=>{clearTimeout(timer);controller.abort();};
 },[open,prefix,type]);
 function choose(choice:Choice){const suffix=value.slice(caret).match(/^[\p{L}\p{M}\p{N}_]*/u)?.[0]??'';const end=caret+suffix.length;const insert=choice.insert+' ';const next=value.slice(0,start)+insert+value.slice(end);onChange(next);setDismissed(true);const pos=start+insert.length;requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(pos,pos);setCaret(pos);});}
 return <div className="entity-composer"><div className="length-textarea"><div className="character-overlay" aria-hidden="true" style={{transform:`translateY(-${scrollTop}px)`}}><span>{Array.from(value).slice(0,280).join('')}</span><mark>{Array.from(value).slice(280).join('')}</mark>{'\n'}</div><textarea onScroll={e=>setScrollTop(e.currentTarget.scrollTop)} ref={inputRef} id={id} data-autofocus={autoFocus?'true':undefined} value={value} disabled={disabled} onFocus={()=>{setHasFocus(true);onFocus();}} onBlur={()=>setHasFocus(false)} onChange={e=>{onChange(e.target.value);setCaret(e.target.selectionStart);setDismissed(false);}} onSelect={e=>setCaret(e.currentTarget.selectionStart)} onClick={()=>setDismissed(false)} onKeyDown={e=>{if(!open)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDismissed(true);}else if(choices.length&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();setSelected(n=>(n+(e.key==='ArrowDown'?1:choices.length-1))%choices.length);}else if(choices.length&&(e.key==='Enter'||e.key==='Tab')){e.preventDefault();choose(choices[selected]);}}} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open&&choices.length?`${listId}-${selected}`:undefined} aria-multiline="true" placeholder={placeholder} rows={1}/></div>{open&&<div className="entity-suggestions"><div id={listId} role="listbox" aria-label={type==='@'?'Mention suggestions':'Hashtag suggestions'}>{choices.map((c,i)=><button id={`${listId}-${i}`} key={c.key} type="button" role="option" aria-selected={selected===i} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(c)}><>{c.user&&<Avatar user={c.user}/>}<span className="mention-choice-copy"><strong>{c.label}</strong><small>{c.detail}</small></span></></button>)}</div>{message&&<p role="status">{message}</p>}</div>}</div>;
}
