/** Small, explainable v1 ranker. No private messages or personal contact data. */
type Candidate={id:string;postId:string;actorId:string;createdAt:Date;post:{authorId:string;communityId:string|null;topicId:string|null;_count:{likes:number;reposts:number;replies:number}}};
type Context={now:number;following:Set<string>;topics:Set<string>;communities:Set<string>};
export function rankCandidates(items:Candidate[],context:Context):string[]{
 const scored=items.map(e=>{const age=Math.max(0,(context.now-e.createdAt.getTime())/3600000);const c=e.post._count;
  // Each signal is bounded; views are deliberately excluded because they are easy to inflate.
  const relevance=(context.following.has(e.post.authorId)||context.following.has(e.actorId)?12:0)+(e.post.topicId&&context.topics.has(e.post.topicId)?8:0)+(e.post.communityId&&context.communities.has(e.post.communityId)?8:0);
  const engagement=Math.min(15,Math.log2(1+c.likes)*2+Math.log2(1+c.reposts)*3+Math.min(4,c.replies));
  return {e,score:50/(1+age/12)+relevance+engagement};
 }).sort((a,b)=>b.score-a.score||b.e.createdAt.getTime()-a.e.createdAt.getTime()||b.e.id.localeCompare(a.e.id));
 const result:string[]=[];const seen=new Set<string>();const recentAuthors:string[]=[];
 // One fresh, low-engagement discovery slot after each four ranked posts when available.
 while(scored.length){let index=result.length%5===4?scored.findIndex(x=>!seen.has(x.e.postId)&&context.now-x.e.createdAt.getTime()<86400000&&x.e.post._count.likes+x.e.post._count.reposts<5&&!recentAuthors.includes(x.e.post.authorId)):-1;
  if(index<0)index=scored.findIndex(x=>!seen.has(x.e.postId)&&recentAuthors.filter(a=>a===x.e.post.authorId).length<2);
  if(index<0)index=scored.findIndex(x=>!seen.has(x.e.postId));if(index<0)break;
  const [{e}]=scored.splice(index,1);seen.add(e.postId);result.push(e.id);recentAuthors.push(e.post.authorId);if(recentAuthors.length>5)recentAuthors.shift();
 }return result;
}
