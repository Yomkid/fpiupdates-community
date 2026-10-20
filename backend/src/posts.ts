import { rankCandidates } from './feed-ranking';
import { entitySelect, normalizeHashtag, resolveEntities } from './text-entities';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, publicUser, SessionGuard, OptionalSessionGuard } from './auth';
import { VerifiedGuard } from './permissions';
import { CreateThreadDto, CreatePostDto, FeedQuery, ReportDto } from './dtos';
export function decodeCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id) || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) throw new Error();
    if(value.rankOffset!==undefined&&(!Number.isInteger(value.rankOffset)||value.rankOffset<0||value.rankOffset>500))throw new Error();
    return {rankOffset:value.rankOffset as number|undefined, id: value.id as string, createdAt: new Date(value.at),priority:typeof value.priority==='boolean'?value.priority:undefined,replyOrder:value.replyOrder==='oldest'?'oldest' as const:'latest' as const };
  } catch { throw new BadRequestException('Invalid cursor'); }
}
import { visible, postVisibility, visibleAuthor } from './post-visibility';
export { visible } from './post-visibility';
import { firstLink, LinkPreviewService, previewSelect } from './link-previews';
import { MediaService } from './media';
import { IsOptional, IsUUID } from 'class-validator';
class PinDto { @IsOptional() @IsUUID() postId?:string|null; }
const anonymous = '00000000-0000-0000-0000-000000000000';
export function postFields(viewer?:string){return {
 threadRootId:true,isThreadContinuation:true,authorReply:true, sportsCompetition:{select:{id:true,name:true}},sportsMatch:{select:{id:true,home:{select:{name:true}},away:{select:{name:true}}}},tokens:{select:entitySelect(viewer),orderBy:{start:'asc'}},id:true,body:true,replyPolicy:true,replyPolicyOwnerId:true,quotedPostId:true,linkPreview:{select:previewSelect},imageMediaId:true,imageAlt:true,parentId:true,createdAt:true,article:{select:{id:true,slug:true,title:true,excerpt:true,coverMediaId:true,coverAlt:true}},author:{select:publicUser},community:{select:{id:true,slug:true,name:true}},topic:{select:{id:true,name:true}},
 _count:{select:{bookmarks:true,replies:{where:postVisibility(viewer,true)},likes:true,reposts:true,views:true,quotes:{where:postVisibility(viewer,true)}}},
 likes:{where:{userId:viewer??anonymous},select:{userId:true},take:1},reposts:{where:{userId:viewer??anonymous},select:{userId:true},take:1},bookmarks:{where:{userId:viewer??anonymous},select:{userId:true},take:1}
} as const;}
function projectPost<T extends {likes:unknown[];reposts:unknown[];bookmarks:unknown[]}>(post:T){const {likes,reposts,bookmarks,...data}=post;return {...data,viewer:{liked:likes.length>0,reposted:reposts.length>0,bookmarked:bookmarks.length>0}};}
@Injectable()
export class PostsService {
 constructor(private readonly db:Database,private readonly media:MediaService,private readonly previews:LinkPreviewService){}
 async list(query:FeedQuery,authorId?:string,parentId?:string,viewer?:string,bookmarks=false){
  const from=query.q?.match(/(?:^|\s)from:([a-z0-9_]{3,30})(?=\s|$)/i);if(from){const account=await this.db.user.findFirst({where:{AND:[visibleAuthor(viewer,true),{username:from[1].toLowerCase()}]},select:{id:true}});if(!account)return {data:[],nextCursor:null,requiresLogin:false};if(authorId&&authorId!==account.id)return {data:[],nextCursor:null,requiresLogin:false};authorId=account.id;query={...query,profileTab:'posts',q:query.q!.replace(from[0],' ').trim()};}
  if(query.cursor)decodeCursor(query.cursor);
  if(!viewer&&query.cursor)return {data:[],nextCursor:null,requiresLogin:true};
  if(!viewer&&query.profileTab&&query.profileTab!=='posts')return {data:[],nextCursor:null,requiresLogin:true};
  if(!viewer)query={...query,limit:Math.min(query.limit,5)};
  if(parentId===undefined&&!bookmarks&&!query.hashtag&&!query.profileTab)return this.events(query,authorId,viewer);
  const cursor=query.cursor?decodeCursor(query.cursor):undefined;
  const ascending=!!parentId&&query.replyOrder==='oldest';
  if(parentId&&cursor&&cursor.replyOrder!==(query.replyOrder??'latest'))throw new BadRequestException('Reply order changed; reload replies');
  const constraints:Prisma.PostWhereInput[]=[postVisibility(viewer,true)];
  if(query.profileTab==='posts')constraints.push({parentId:null});
  if(query.profileTab==='replies')constraints.push({parentId:{not:null}});else if(query.profileTab==='media')constraints.push({imageMediaId:{not:null}});
  if(query.profileTab){}else if(query.hashtag)constraints.push({tokens:{some:{kind:'HASHTAG',hashtag:normalizeHashtag(query.hashtag)}}});else constraints.push({parentId:parentId??null});
  if(parentId&&query.branches==='true')constraints.push({isThreadContinuation:false});
  if(authorId)constraints.push(query.mode==='reposts'?{reposts:{some:{userId:authorId}}}:{authorId});
  if(query.mediaOnly==='true')constraints.push({imageMediaId:{not:null}});
  if(query.q)constraints.push({body:{contains:query.q,mode:'insensitive'}});
  if(query.sportsCompetitionId)constraints.push({sportsCompetitionId:query.sportsCompetitionId});
  if(query.sportsMatchId)constraints.push({sportsMatchId:query.sportsMatchId});
  if(query.communityId)constraints.push({communityId:query.communityId});
  if(query.topicId)constraints.push({topicId:query.topicId});
  if(bookmarks)constraints.push({bookmarks:{some:{userId:viewer??anonymous}}});
  if(query.mode==='following'){
   if(!viewer)throw new ForbiddenException('Sign in to view your following feed');
   const follows=await this.db.follow.findMany({where:{followerId:viewer},select:{followingId:true},take:5000});const ids=follows.map(x=>x.followingId);
   constraints.push({OR:[{authorId:{in:ids}},{reposts:{some:{userId:{in:ids}}}}]});
  }
  if(cursor){const dates:Prisma.PostWhereInput={OR:[{createdAt:ascending?{gt:cursor.createdAt}:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:ascending?{gt:cursor.id}:{lt:cursor.id}}]};constraints.push(parentId&&!ascending&&cursor.priority!==undefined?{OR:[...(cursor.priority?[{authorReply:false}]:[]),{AND:[{authorReply:cursor.priority},dates]}]}:dates);}
  const items=await this.db.post.findMany({where:{AND:constraints},orderBy:[...(parentId&&!ascending?[{authorReply:'desc' as const}]:[]),{createdAt:ascending?'asc':'desc'},{id:ascending?'asc':'desc'}],take:query.limit+1,select:postFields(viewer)});
  const data=items.slice(0,query.limit);const last=data.at(-1);
  return {data:await this.project(data,viewer),requiresLogin:!viewer&&items.length>query.limit,nextCursor:viewer&&items.length>query.limit&&last?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString(),...(parentId?{priority:last.authorReply,replyOrder:query.replyOrder??'latest'}:{})})).toString('base64url'):null};
 }
 async project<T extends {likes:unknown[];reposts:unknown[];bookmarks:unknown[];quotedPostId:string|null;id:string;threadRootId:string|null}>(rows:T[],viewer?:string){const ids=[...new Set(rows.map(x=>x.quotedPostId).filter((x):x is string=>!!x))];const originals=ids.length?await this.db.post.findMany({where:{AND:[postVisibility(viewer,true),{id:{in:ids}}]},select:{sportsCompetition:{select:{id:true,name:true}},sportsMatch:{select:{id:true,home:{select:{name:true}},away:{select:{name:true}}}},tokens:{select:entitySelect(viewer),orderBy:{start:'asc'}},id:true,quotedPostId:true,body:true,createdAt:true,author:{select:publicUser},imageMediaId:true,imageAlt:true,linkPreview:{select:previewSelect},article:{select:{slug:true,title:true,excerpt:true,coverMediaId:true,coverAlt:true}}}}):[];const nestedIds=[...new Set(originals.map(p=>p.quotedPostId).filter((id):id is string=>!!id))];const nested=nestedIds.length?await this.db.post.findMany({where:{AND:[postVisibility(viewer,true),{id:{in:nestedIds}}]},select:{id:true,body:true,quotedPostId:true,createdAt:true,author:{select:publicUser},tokens:{select:entitySelect(viewer),orderBy:{start:'asc'}},imageMediaId:true,imageAlt:true,linkPreview:{select:previewSelect},article:{select:{slug:true,title:true,excerpt:true,coverMediaId:true,coverAlt:true}}}}):[];const rootIds=[...new Set(rows.map(r=>r.threadRootId??r.id))];const counts=await this.db.post.groupBy({by:['threadRootId'],where:{AND:[postVisibility(viewer,true),{threadRootId:{in:rootIds},isThreadContinuation:true}]},_count:{_all:true}});return rows.map(row=>({...projectPost(row),threadCount:1+(counts.find(c=>c.threadRootId===(row.threadRootId??row.id))?._count._all??0),quotedPost:(()=>{const original=originals.find(x=>x.id===row.quotedPostId);return original?{...original,quotedPost:nested.find(p=>p.id===original.quotedPostId)??null}:null;})()}));}
 private async events(query:FeedQuery,authorId?:string,viewer?:string){
  const conditions:Prisma.PostWhereInput[]=[postVisibility(viewer,!authorId)];if(query.mediaOnly==='true')conditions.push({imageMediaId:{not:null}});if(query.sportsCompetitionId)conditions.push({sportsCompetitionId:query.sportsCompetitionId});if(query.sportsMatchId)conditions.push({sportsMatchId:query.sportsMatchId});if(query.q)conditions.push({body:{contains:query.q,mode:'insensitive'}});if(query.topicId)conditions.push({topicId:query.topicId});if(query.communityId)conditions.push({communityId:query.communityId});
  const where:Prisma.FeedEventWhereInput={post:{AND:conditions},actor:visibleAuthor(viewer,!authorId)};
  if(query.mode==='reposts')where.kind='REPOST';
  if(authorId){where.actorId=authorId;if(query.mode==='reposts')where.kind='REPOST';}
  if(query.mode==='following'){if(!viewer)throw new ForbiddenException('Sign in to view your following feed');const follows=await this.db.follow.findMany({where:{followerId:viewer},select:{followingId:true},take:5000});where.actorId={in:follows.map(x=>x.followingId)};}
  if(query.mode==='for-you'&&viewer&&!authorId&&!query.communityId&&!query.topicId&&!query.q&&!query.sportsMatchId&&!query.sportsCompetitionId&&!query.mediaOnly)return this.rankedEvents(query,where,viewer);
  if(query.cursor){const cursor=decodeCursor(query.cursor);if(cursor.rankOffset!==undefined)throw new BadRequestException('Feed changed; refresh the timeline');where.OR=[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}];}
  const rows=await this.db.feedEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:query.limit+1,select:{id:true,kind:true,createdAt:true,actor:{select:publicUser},post:{select:postFields(viewer)}}});const page=rows.slice(0,query.limit);const posts=await this.project(page.map(x=>x.post),viewer);const last=page.at(-1);
  return {data:posts.map((post,index)=>({...post,feedId:page[index].id,feedCreatedAt:page[index].createdAt,repostedBy:page[index].kind==='REPOST'?page[index].actor:null,repostedAt:page[index].kind==='REPOST'?page[index].createdAt:null})),requiresLogin:!viewer&&rows.length>query.limit,nextCursor:viewer&&rows.length>query.limit&&last?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString()})).toString('base64url'):null};
 }
 private async rankedEvents(query:FeedQuery,where:Prisma.FeedEventWhereInput,viewer:string){
  const now=new Date();let snapshot;let offset=0;
  if(query.cursor){const cursor=decodeCursor(query.cursor);if(cursor.rankOffset===undefined)throw new BadRequestException('Refresh For you to start a new feed');offset=cursor.rankOffset;snapshot=await this.db.feedSnapshot.findFirst({where:{id:cursor.id,userId:viewer,expiresAt:{gt:now}}});if(!snapshot)throw new BadRequestException('This feed has expired. Refresh to see new posts');}
  else{
   await this.db.feedSnapshot.deleteMany({where:{expiresAt:{lte:now}}});
   const candidateWhere:Prisma.FeedEventWhereInput={AND:[where,{createdAt:{lte:now}}]};
   const [recent,popular,follows,interests,groups]=await Promise.all([
    this.db.feedEvent.findMany({where:candidateWhere,orderBy:[{createdAt:'desc'},{id:'desc'}],take:300,select:{id:true,createdAt:true,postId:true,actorId:true,post:{select:{authorId:true,communityId:true,topicId:true,_count:{select:{likes:true,reposts:true,replies:{where:postVisibility(viewer,true)}}}}}}}),
    this.db.feedEvent.findMany({where:{AND:[candidateWhere,{kind:'POST',createdAt:{gte:new Date(now.getTime()-7*86400000)}}]},orderBy:[{post:{likes:{_count:'desc'}}},{createdAt:'desc'},{id:'desc'}],take:100,select:{id:true,createdAt:true,postId:true,actorId:true,post:{select:{authorId:true,communityId:true,topicId:true,_count:{select:{likes:true,reposts:true,replies:{where:postVisibility(viewer,true)}}}}}}}),
    this.db.follow.findMany({where:{followerId:viewer},select:{followingId:true},take:5000}),
    this.db.userInterest.findMany({where:{userId:viewer},select:{topicId:true}}),
    this.db.communityMember.findMany({where:{userId:viewer},select:{communityId:true}})
   ]);
   const candidates=[...new Map([...recent,...popular].map(e=>[e.id,e])).values()];
   const ids=rankCandidates(candidates,{now:now.getTime(),following:new Set(follows.map(f=>f.followingId)),topics:new Set(interests.map(i=>i.topicId)),communities:new Set(groups.map(g=>g.communityId))});
   snapshot=await this.db.feedSnapshot.create({data:{userId:viewer,eventIds:ids,createdAt:now,expiresAt:new Date(now.getTime()+30*60000)}});
  }
  const ids=snapshot.eventIds as string[];const pageIds=ids.slice(offset,offset+query.limit);
  // Visibility is checked again on every page: snapshots never restore deleted or blocked content.
  const rows=await this.db.feedEvent.findMany({where:{AND:[where,{id:{in:pageIds}}]},select:{id:true,kind:true,createdAt:true,actor:{select:publicUser},post:{select:postFields(viewer)}}});
  const ordered=pageIds.flatMap(id=>{const row=rows.find(r=>r.id===id);return row?[row]:[];});const posts=await this.project(ordered.map(r=>r.post),viewer);
  return {feedAsOf:snapshot.createdAt.toISOString(),data:posts.map((post,index)=>({...post,feedId:ordered[index].id,feedCreatedAt:ordered[index].createdAt,repostedBy:ordered[index].kind==='REPOST'?ordered[index].actor:null,repostedAt:ordered[index].kind==='REPOST'?ordered[index].createdAt:null})),requiresLogin:false,nextCursor:offset+query.limit<ids.length?Buffer.from(JSON.stringify({id:snapshot.id,at:snapshot.createdAt.toISOString(),rankOffset:offset+query.limit})).toString('base64url'):null};
 }
  async profile(username: string,viewer?:string) {
    if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new NotFoundException('Profile not found');
    const user = await this.db.user.findFirst({ where: { username, status: 'ACTIVE' }, select: {...publicUser,pinnedPostId:true} });
    if (!user) throw new NotFoundException('Profile not found');
    if(viewer){const incoming=await this.db.block.findUnique({where:{blockerId_blockedId:{blockerId:user.id,blockedId:viewer}}});if(incoming)throw new NotFoundException('Profile not found');const outgoing=await this.db.block.findUnique({where:{blockerId_blockedId:{blockerId:viewer,blockedId:user.id}}});if(outgoing)return {id:user.id,username:user.username,displayName:user.displayName,blocked:true,followers:0,following:0,isFollowing:false};}

    const counts=await Promise.all([this.db.follow.count({where:{followingId:user.id,follower:{status:'ACTIVE'}}}),this.db.follow.count({where:{followerId:user.id,following:{status:'ACTIVE'}}})]);
    const {pinnedPostId,...details}=user;let pinnedPost=null;if(pinnedPostId){try{pinnedPost=await this.get(pinnedPostId,viewer);}catch(e){if(!(e instanceof NotFoundException))throw e;}}
    return {...details,postCount:await this.db.post.count({where:{AND:[postVisibility(viewer),{authorId:user.id,parentId:null}]}}),pinnedPost,followsYou:viewer?!!await this.db.follow.findUnique({where:{followerId_followingId:{followerId:user.id,followingId:viewer}}}):false,followers:counts[0],following:counts[1],isFollowing:viewer?!!await this.db.follow.findUnique({where:{followerId_followingId:{followerId:viewer,followingId:user.id}}}):false};
  }
  async pin(userId:string,postId?:string|null){
   if(postId){const post=await this.get(postId,userId);if(post.author.id!==userId||post.parentId)throw new ForbiddenException('Pin one of your own top-level posts or articles');}
   await this.db.user.update({where:{id:userId},data:{pinnedPostId:postId??null}});return {ok:true};
  }
  async connections(username:string,kind:string,query:FeedQuery,viewer?:string){
   if(!viewer)throw new ForbiddenException('Sign in to view connections');const profile=await this.profile(username,viewer);if('blocked' in profile&&profile.blocked)throw new NotFoundException();
   const rows=await this.db.follow.findMany({where:{...(kind==='followers'?{followingId:profile.id,follower:visibleAuthor(viewer,true)}:{followerId:profile.id,following:visibleAuthor(viewer,true)}),...(query.cursor?(kind==='followers'?{followerId:{lt:decodeCursor(query.cursor).id}}:{followingId:{lt:decodeCursor(query.cursor).id}}):{})},orderBy:kind==='followers'?{followerId:'desc'}:{followingId:'desc'},take:query.limit+1,select:{followerId:true,followingId:true,follower:{select:publicUser},following:{select:publicUser}}});
   const people=rows.slice(0,query.limit).map(r=>kind==='followers'?r.follower:r.following);const follows=await this.db.follow.findMany({where:{followerId:viewer,followingId:{in:people.map(p=>p.id)}},select:{followingId:true}});return {data:people.map(p=>({...p,isFollowing:follows.some(f=>f.followingId===p.id)})),nextCursor:rows.length>query.limit?Buffer.from(JSON.stringify({id:kind==='followers'?rows[query.limit-1].followerId:rows[query.limit-1].followingId,at:new Date(0).toISOString()})).toString('base64url'):null};
  }
  async profileArticles(username:string,viewer?:string){const profile=await this.profile(username,viewer);if('blocked' in profile&&profile.blocked)return [];return this.db.article.findMany({where:{authorId:profile.id,status:'PUBLISHED',discussionPost:postVisibility(viewer)},orderBy:[{publishedAt:'desc'},{id:'desc'}],take:100,select:{id:true,slug:true,title:true,excerpt:true,publishedAt:true,coverMediaId:true,coverAlt:true}});}
  async thread(id:string,q:FeedQuery,viewer?:string){const current=await this.get(id,viewer);const rootId=current.threadRootId??id;const root=await this.get(rootId,viewer);const cursor=q.cursor?decodeCursor(q.cursor):null;const limit=viewer?q.limit:Math.min(q.limit,5);if(!viewer&&cursor)return {root,data:[],nextCursor:null,requiresLogin:true};const rows=await this.db.post.findMany({where:{AND:[postVisibility(viewer,true),{threadRootId:rootId,isThreadContinuation:true,authorId:root.author.id},...(cursor?[{OR:[{createdAt:{gt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{gt:cursor.id}}]}]:[])]},select:postFields(viewer),orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit+1});const data=rows.slice(0,limit),last=data.at(-1);return {root,data:await this.project(data,viewer),requiresLogin:!viewer&&rows.length>limit,nextCursor:viewer&&rows.length>limit&&last?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString()})).toString('base64url'):null};}
  async people(id:string,viewer?:string){
   const post=await this.get(id,viewer);const ancestry=await this.ancestors(id,viewer);const children=await this.db.post.findMany({where:{AND:[postVisibility(viewer,true),{parentId:id}]},orderBy:[{createdAt:'desc'},{id:'desc'}],distinct:['authorId'],take:20,select:{authorId:true}});
   const ids=[...new Set([post.author.id,...ancestry.data.slice().reverse().map(p=>p.author.id),...(post.quotedPost?[post.quotedPost.author.id]:[]),...children.map(p=>p.authorId),...post.tokens.flatMap(t=>t.user?[t.user.id]:[])])].filter(x=>x!==viewer).slice(0,20);
   const users=await this.db.user.findMany({where:{AND:[visibleAuthor(viewer,true),{id:{in:ids}}]},select:publicUser});const follows=viewer?await this.db.follow.findMany({where:{followerId:viewer,followingId:{in:ids}},select:{followingId:true}}):[];
   return ids.flatMap(id=>{const u=users.find(u=>u.id===id);return u?[{...u,isFollowing:follows.some(f=>f.followingId===u.id)}]:[];});
  }
  async ancestors(id:string,viewer?:string){const current=await this.get(id,viewer);const data=[];let parent=current.parentId;for(let i=0;parent&&i<20;i++){try{const post=await this.get(parent,viewer);data.unshift(post);parent=post.parentId;}catch(e){if(e instanceof NotFoundException)return {data,unavailable:true,earlierId:null};throw e;}}return {data,unavailable:false,earlierId:parent};}
  async replies(id: string, query: FeedQuery,viewer?:string) { await this.get(id,viewer); return this.list(query, undefined, id,viewer); }
  async get(id: string,viewer?:string) {
    const post = await this.db.post.findFirst({ where: { AND:[{id},postVisibility(viewer)] }, select: postFields(viewer) });
    if (!post) throw new NotFoundException('Post not found');
    return (await this.project([post],viewer))[0];
  }
  async create(userId: string, dto: CreatePostDto,continuations?:string[],requestId?:string) {
    if(continuations&&dto.parentId)throw new BadRequestException('Start a new thread, or reply to continue an existing one');
    if(requestId){const prior=await this.db.threadPublication.findUnique({where:{userId_requestId:{userId,requestId}}});if(prior)return this.get(prior.rootPostId,userId);}
    let threadRootId:string|undefined;let isThreadContinuation=false;let authorReply=false;
    await this.media.assertOwned(dto.imageMediaId,userId,'POST');
    let replyPolicy=dto.replyPolicy??'EVERYONE';let replyPolicyOwnerId=userId;
    if(dto.quotedPostId)await this.get(dto.quotedPostId,userId);
    if(dto.communityId){const community=await this.db.community.findFirst({where:{id:dto.communityId,active:true}});if(!community)throw new NotFoundException('Community not found');if(!await this.db.communityMember.findUnique({where:{userId_communityId:{userId,communityId:dto.communityId}}}))throw new ForbiddenException('Join this community before posting');}
    if(dto.topicId&&!await this.db.topic.findUnique({where:{id:dto.topicId}}))throw new BadRequestException('Unknown topic');
    if(dto.parentId){const parent=await this.get(dto.parentId,userId);threadRootId=parent.threadRootId??parent.id;isThreadContinuation=parent.author.id===userId&&(!parent.parentId||parent.isThreadContinuation);const root=await this.db.post.findUnique({where:{id:threadRootId},select:{authorId:true}});authorReply=root?.authorId===userId;replyPolicy=parent.replyPolicy;replyPolicyOwnerId=parent.replyPolicyOwnerId??parent.author.id;if(replyPolicy==='FOLLOWING'&&userId!==replyPolicyOwnerId&&!await this.db.follow.findUnique({where:{followerId_followingId:{followerId:replyPolicyOwnerId,followingId:userId}}}))throw new ForbiddenException('Only accounts followed by the conversation author can reply');dto.communityId=parent.community?.id; if(dto.communityId&&!await this.db.communityMember.findUnique({where:{userId_communityId:{userId,communityId:dto.communityId}}}))throw new ForbiddenException('Join this community before replying');}
    if(dto.parentId){const parent=await this.db.post.findUniqueOrThrow({where:{id:dto.parentId},select:{sportsCompetitionId:true,sportsMatchId:true}});dto.sportsCompetitionId=parent.sportsCompetitionId??undefined;dto.sportsMatchId=parent.sportsMatchId??undefined;}
    if(dto.sportsMatchId){const match=await this.db.sportsMatch.findFirst({where:{id:dto.sportsMatchId,competition:{published:true}},select:{competitionId:true}});if(!match)throw new NotFoundException('Match not found');if(dto.sportsCompetitionId&&dto.sportsCompetitionId!==match.competitionId)throw new BadRequestException('Match belongs to another competition');dto.sportsCompetitionId=match.competitionId;}
    if(dto.sportsCompetitionId&&!await this.db.sportsCompetition.findFirst({where:{id:dto.sportsCompetitionId,published:true}}))throw new NotFoundException('Competition not found');
    const link=firstLink(dto.body);const preview=link?await this.previews.get(link):null;
    let id:string;try{id=await this.db.$transaction(async tx=>{
     const creationClock=Date.now();const tokens=await resolveEntities(tx,dto.body,userId);
     const post=await tx.post.create({data:{...(continuations?{createdAt:new Date(creationClock)}:{}),threadRootId,isThreadContinuation,authorReply,sportsCompetitionId:dto.sportsCompetitionId,sportsMatchId:dto.sportsMatchId,authorId:userId,body:dto.body,replyPolicy,replyPolicyOwnerId,quotedPostId:dto.quotedPostId,linkPreviewId:preview?.id,imageMediaId:dto.imageMediaId,imageAlt:dto.imageAlt,parentId:dto.parentId,communityId:dto.communityId,topicId:dto.topicId,tokens:{create:tokens}},select:{id:true}});if(continuations){let previous=post.id;for(const [index,body] of continuations.entries()){const tokens=await resolveEntities(tx,body,userId);const entry=await tx.post.create({data:{createdAt:new Date(creationClock+index+1),authorId:userId,body,parentId:previous,threadRootId:post.id,isThreadContinuation:true,authorReply:true,replyPolicy,replyPolicyOwnerId,sportsCompetitionId:dto.sportsCompetitionId,sportsMatchId:dto.sportsMatchId,communityId:dto.communityId,topicId:dto.topicId,tokens:{create:tokens}},select:{id:true}});previous=entry.id;}await tx.threadPublication.create({data:{userId,requestId:requestId!,rootPostId:post.id}});}
     return post.id;
    });}catch(e){if(requestId&&e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'){const prior=await this.db.threadPublication.findUnique({where:{userId_requestId:{userId,requestId}}});if(prior)return this.get(prior.rootPostId,userId);}throw e;}
    return this.get(id,userId);
  }
  async remove(userId: string, id: string) {
    const post = await this.db.post.findFirst({ where: { id, deletedAt: null }, select: { authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if(await this.db.article.findUnique({where:{discussionPostId:id}}))throw new ForbiddenException('Manage this article in the editorial studio');
    if (post.authorId !== userId) throw new ForbiddenException();
    await this.db.post.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  async report(userId: string, id: string, dto: ReportDto) {
    const post=await this.get(id,userId);
    // Duplicate reports return the existing ticket; reporting does not automatically hide content.
    return this.db.report.upsert({ where: { reporterId_postId: { reporterId: userId, postId: id } }, create: { reporterId: userId, postId: id, snapshot:post.body, ...dto }, update: {}, select: { id: true, createdAt: true } });
  }
}
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}
  @Get() @UseGuards(OptionalSessionGuard) list(@Query() query: FeedQuery,@Req()req:AuthRequest) { return this.posts.list(query,undefined,undefined,req.account?.id); }
  @Get(':id') @UseGuards(OptionalSessionGuard) get(@Param('id', ParseUUIDPipe) id: string,@Req()req:AuthRequest) { return this.posts.get(id,req.account?.id); }
  @Get(':id/ancestors') @UseGuards(OptionalSessionGuard) ancestors(@Param('id',ParseUUIDPipe)id:string,@Req()req:AuthRequest){return this.posts.ancestors(id,req.account?.id);}
  @Get(':id/thread') @UseGuards(OptionalSessionGuard) thread(@Param('id',ParseUUIDPipe)id:string,@Query()q:FeedQuery,@Req()req:AuthRequest){return this.posts.thread(id,q,req.account?.id);}
  @Get(':id/people') @UseGuards(OptionalSessionGuard) people(@Param('id',ParseUUIDPipe)id:string,@Req()req:AuthRequest){return this.posts.people(id,req.account?.id);}
  @Post('thread') @UseGuards(SessionGuard,VerifiedGuard) threadCreate(@Req()req:AuthRequest,@Body()dto:CreateThreadDto){return this.posts.create(req.account.id,dto,dto.continuations,dto.requestId);}
  @Get(':id/replies') @UseGuards(OptionalSessionGuard) replies(@Param('id', ParseUUIDPipe) id: string, @Query() query: FeedQuery,@Req()req:AuthRequest) { return this.posts.replies(id, query,req.account?.id); }
  @Post() @UseGuards(SessionGuard,VerifiedGuard)
  create(@Req() req: AuthRequest, @Body() dto: CreatePostDto) { return this.posts.create(req.account.id, dto); }
  @Delete(':id') @HttpCode(204) @UseGuards(SessionGuard)
  remove(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.posts.remove(req.account.id, id); }
  @Post(':id/reports') @UseGuards(SessionGuard)
  report(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDto) { return this.posts.report(req.account.id, id, dto); }
}

@Controller('users')
export class UsersController {
  constructor(private readonly posts: PostsService) {}
  @Get(':username') @UseGuards(OptionalSessionGuard) profile(@Param('username') username: string,@Req()req:AuthRequest) { return this.posts.profile(username,req.account?.id); }
  @Get(':username/articles') @UseGuards(OptionalSessionGuard) articles(@Param('username')name:string,@Req()req:AuthRequest){return this.posts.profileArticles(name,req.account?.id);}
  @Get(':username/followers') @UseGuards(OptionalSessionGuard) followers(@Param('username')name:string,@Query()q:FeedQuery,@Req()req:AuthRequest){return this.posts.connections(name,'followers',q,req.account?.id);}
  @Get(':username/following') @UseGuards(OptionalSessionGuard) following(@Param('username')name:string,@Query()q:FeedQuery,@Req()req:AuthRequest){return this.posts.connections(name,'following',q,req.account?.id);}
  @Put('me/pinned-post') @UseGuards(SessionGuard) pin(@Req()req:AuthRequest,@Body()dto:PinDto){return this.posts.pin(req.account.id,dto.postId);}
  @Get(':username/posts') @UseGuards(OptionalSessionGuard) async postsForUser(@Param('username') username: string, @Query() query: FeedQuery,@Req()req:AuthRequest) {
    const profile = await this.posts.profile(username,req.account?.id);
    if('blocked' in profile&&profile.blocked)return {data:[],nextCursor:null};
    return this.posts.list(query, profile.id,undefined,req.account?.id);
  }
}
