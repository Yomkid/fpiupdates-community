import { BackButton } from './Navigation';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from './api';
import { ErrorBox, PostList } from './components';
export function HashtagPage(){
 const {tag}=useParams();const navigate=useNavigate();const [query,setQuery]=useState(tag??'');const [tags,setTags]=useState<{tag:string}[]>([]);const [error,setError]=useState('');
 useEffect(()=>setQuery(tag??''),[tag]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>{setError('');api<{tag:string}[]>('/discovery/hashtags'+(query?'?'+new URLSearchParams({q:query.replace(/^#/,'')}):''),{signal:c.signal}).then(setTags).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));});},250);return()=>{clearTimeout(timer);c.abort();};},[query]);
 return <><div className="page-heading"><BackButton/><div><h1 className="hashtag-heading">{tag?'#'+tag:'Explore hashtags'}</h1><p>Find conversations by their hashtags.</p></div></div><section className="page-panel"><form className="hashtag-search" onSubmit={e=>{e.preventDefault();const clean=query.replace(/^#/,'').normalize('NFKC').toLowerCase();if(!/^[\p{L}\p{M}\p{N}_]{1,64}$/u.test(clean)||clean.length>64){setError('Use 1–64 letters, numbers or underscores.');return;}navigate('/tags/'+encodeURIComponent(clean));}}><label>Search hashtags<input value={query} maxLength={65} onChange={e=>setQuery(e.target.value)} placeholder="Ilaro"/></label><button className="button primary small">Search</button></form><div className="hashtag-choices">{tags.map(t=><Link key={t.tag} to={'/tags/'+encodeURIComponent(t.tag)}>#{t.tag}</Link>)}</div>{error&&<ErrorBox message={error}/>}</section>{tag&&<PostList key={tag} endpoint={'/posts?'+new URLSearchParams({hashtag:tag})} emptyTitle="No matching conversations yet" emptyText="Publish a post using this hashtag to start a conversation."/>}</>;
}
