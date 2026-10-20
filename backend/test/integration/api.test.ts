import {PrismaClient as FixturePrismaClient} from '@prisma/client';
import {PrismaPg as FixturePrismaPg} from '@prisma/adapter-pg';
import {utcDatabaseUrl as fixtureDatabaseUrl} from '../../src/config';
import { AnalyticsService, nigeriaDay, nigeriaWeek } from '../../src/analytics';
import 'reflect-metadata';
import sharp from 'sharp';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { mediaDirectory } from '../../src/media';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app';
import { PublishingService } from '../../src/publishing';
import { MediaService } from '../../src/media';
import { Database } from '../../src/database';
let app: INestApplication;
let slowFixture:FixturePrismaClient|undefined;
let db: Database;
const runId = `t${Date.now()}`;
const ids: string[] = [];
let token: string;
let otherToken: string;
let authorId: string;
let postId: string;
const auth = () => `Bearer ${token}`;
before(async () => {
  if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.PRODUCTION_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.PUBLISHING_WORKER_DISABLED='true';
  process.env.ANALYTICS_WORKER_DISABLED='true';
  process.env.MEDIA_DIRECTORY=await mkdtemp(join(tmpdir(),'fpiupdates-test-media-'));
  const builder=Test.createTestingModule({imports:[AppModule]});
  // Embedded PostgreSQL fixtures serialize connections and can be much slower than real PostgreSQL.
  // This opt-in changes only fixture pool waiting; the application Database keeps its normal settings.
  if(process.env.TEST_EMBEDDED_DATABASE==='true'){slowFixture=new FixturePrismaClient({adapter:new FixturePrismaPg({connectionString:fixtureDatabaseUrl(process.env.TEST_DATABASE_URL!),max:1,connectionTimeoutMillis:30000,idleTimeoutMillis:10000})});await slowFixture.$connect();builder.overrideProvider(Database).useValue(slowFixture);}
  const module=await builder.compile();
  app = module.createNestApplication({ logger: process.env.TEST_LOG_ERRORS?['error']:false });
  configureApp(app, ['http://localhost:5173']); await app.init(); db = app.get(Database);
});
after(async () => {
  if (db) {
    const uploads=await db.media.findMany({where:{ownerId:{in:ids}}});for(const media of uploads)await unlink(join(mediaDirectory(),media.id+'.webp')).catch(()=>{});
    await db.article.deleteMany({where:{authorId:{in:ids}}});
    await db.report.deleteMany({ where: { reporterId: { in: ids } } });
    await db.post.deleteMany({ where: { authorId: { in: ids }, parentId: { not: null } } });
    await db.post.deleteMany({ where: { authorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await app?.close();
  await slowFixture?.$disconnect();
  if(process.env.MEDIA_DIRECTORY)await rm(process.env.MEDIA_DIRECTORY,{recursive:true,force:true});
});
test('register validates inputs and never exposes password hashes', async () => {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'bad', username: 'x', password: 'short', displayName: ' ' }).expect(400);
  const result = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: `${runId}@example.test`, username: runId, displayName: 'Test Author', password: 'long test password 123' }).expect(201);
  token = result.body.accessToken; authorId = result.body.user.id; ids.push(authorId);
  assert.equal(result.body.user.passwordHash, undefined);
  const session = await db.session.findFirstOrThrow({ where: { userId: authorId } });
  assert.notEqual(session.tokenHash, token);
});
test('login normalizes email, rejects bad credentials and permits authenticated profile', async () => {
  await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: `${runId}@example.test`, password: 'wrong' }).expect(401);
  await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: ` ${runId.toUpperCase()}@EXAMPLE.TEST `, password: 'long test password 123' }).expect(200);
  const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', auth()).expect(200);
  assert.equal(me.body.id, authorId);
});
test('anonymous publication and malformed input are rejected', async () => {
  await request(app.getHttpServer()).post('/api/v1/posts').send({ body: 'hello' }).expect(401);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', auth()).send({ body: '   ' }).expect(400);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', auth()).send({ body: 'hello', authorId: 'forged' }).expect(400);
  const result = await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', auth()).send({ body: 'Hello Ilaro' }).expect(201);
  postId = result.body.id;
  assert.equal(result.body.author.id, authorId); assert.equal(result.body.author.email, undefined);
});
test('pagination handles tied timestamps and rejects malformed cursors', async () => {
  const at = new Date('2030-01-01T00:00:00Z');
  await db.post.createMany({ data: [1,2,3].map(n => ({ authorId, body: `page ${n}`, createdAt: at })) });
  const first = await request(app.getHttpServer()).get('/api/v1/posts?limit=2').set('Authorization',auth()).expect(200);
  const second = await request(app.getHttpServer()).get('/api/v1/posts').query({ limit: 2, cursor: first.body.nextCursor }).set('Authorization',auth()).expect(200);
  assert.ok(first.body.data.every((p:{feedCreatedAt:string})=>Number.isFinite(Date.parse(p.feedCreatedAt))));
  const firstIds = new Set(first.body.data.map((p: {id: string}) => p.id));
  assert.equal(second.body.data.some((p: {id: string}) => firstIds.has(p.id)), false);
  assert.equal(first.body.data.length, 2);
  await request(app.getHttpServer()).get('/api/v1/posts?cursor=broken').expect(400);
  await request(app.getHttpServer()).get('/api/v1/posts?limit=500').expect(400);
});
test('other users cannot delete posts; duplicate reports retain one ticket', async () => {
  const result = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: `${runId}b@example.test`, username: `${runId}b`, displayName: 'Other Author', password: 'long test password 456' }).expect(201);
  otherToken = result.body.accessToken; ids.push(result.body.user.id);
  await request(app.getHttpServer()).delete(`/api/v1/posts/${postId}`).set('Authorization', `Bearer ${otherToken}`).expect(403);
  const report = await request(app.getHttpServer()).post(`/api/v1/posts/${postId}/reports`).set('Authorization', `Bearer ${otherToken}`).send({ reason: 'SCAM' }).expect(201);
  const again = await request(app.getHttpServer()).post(`/api/v1/posts/${postId}/reports`).set('Authorization', `Bearer ${otherToken}`).send({ reason: 'SCAM' }).expect(201);
  assert.equal(report.body.id, again.body.id);
  await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(200);
});
test('hidden posts and suspended authors are excluded', async () => {
  await db.post.update({ where: { id: postId }, data: { status: 'HIDDEN' } });
  await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(404);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', auth()).send({ body: 'reply', parentId: postId }).expect(404);
  await db.post.update({ where: { id: postId }, data: { status: 'PUBLISHED' } });
  await db.user.update({ where: { id: authorId }, data: { status: 'SUSPENDED' } });
  await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', auth()).expect(401);
  await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(404);
  await db.user.update({ where: { id: authorId }, data: { status: 'ACTIVE' } });
});
test('logout revokes the bearer session', async () => {
  await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', auth()).expect(204);
  await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', auth()).expect(401);
});
test('health and CORS work without exposing database details', async () => {
  await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  const allowed = await request(app.getHttpServer()).get('/api/v1/health').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  const rejected = await request(app.getHttpServer()).get('/api/v1/health').set('Origin', 'https://untrusted.test').expect(200);
  assert.equal(rejected.headers['access-control-allow-origin'], undefined);
});

test('browser sessions are HttpOnly, survive profile lookup and reject cross-origin writes', async () => {
  const origin = 'http://localhost:5173';
  await request(app.getHttpServer()).post('/api/v1/auth/browser/login').send({ email: `${runId}@example.test`, password: 'long test password 123' }).expect(403);
  const login = await request(app.getHttpServer()).post('/api/v1/auth/browser/login').set('Origin', origin).send({ email: `${runId}@example.test`, password: 'long test password 123' }).expect(200);
  assert.equal(login.body.accessToken, undefined);
  const cookies = login.headers['set-cookie'] as unknown as string[];
  assert.match(cookies[0], /HttpOnly/); assert.match(cookies[0], /SameSite=Lax/);
  const cookie = cookies[0].split(';')[0];
  await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Cookie', cookie).send({ body: 'forged request' }).expect(403);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Cookie', cookie).set('Origin', 'https://untrusted.test').send({ body: 'forged request' }).expect(403);
  const post = await request(app.getHttpServer()).post('/api/v1/posts').set('Cookie', cookie).set('Origin', origin).send({ body: 'Cookie-authored hello' }).expect(201);
  const reply = await request(app.getHttpServer()).post('/api/v1/posts').set('Cookie', cookie).set('Origin', origin).send({ body: 'A reply', parentId: post.body.id }).expect(201);
  const replies = await request(app.getHttpServer()).get(`/api/v1/posts/${post.body.id}/replies`).expect(200);
  assert.equal(replies.body.data[0].id, reply.body.id);
  const detail = await request(app.getHttpServer()).get(`/api/v1/posts/${post.body.id}`).expect(200);
  assert.equal(detail.body._count.replies, 1);
  const profile = await request(app.getHttpServer()).get(`/api/v1/users/${runId}`).expect(200);
  assert.equal(profile.body.email, undefined); assert.equal(profile.body.passwordHash, undefined);
  const matches = await request(app.getHttpServer()).get('/api/v1/posts').query({ q: 'Cookie-authored' }).expect(200);
  assert.equal(matches.body.data.length, 1);
  await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).expect(204);
  await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
});

// Expanded community checkpoint: security and social invariants.
import { randomUUID } from 'node:crypto';
import { hashPassword, newToken, tokenHash } from '../../src/security';
let featureToken:string;
let staffToken:string;
let staffId:string;
let featurePost:string;
let communityId:string;
test('prepare explicit staff fixture; members cannot reach administration or inject roles',async()=>{
 featureToken=newToken();await db.session.create({data:{userId:authorId,tokenHash:tokenHash(featureToken),expiresAt:new Date(Date.now()+3600000)}});
 const staff=await db.user.create({data:{email:`${runId}staff@example.test`,username:`${runId}staff`,displayName:'Staff Fixture',passwordHash:await hashPassword('staff fixture password 123')}});staffId=staff.id;ids.push(staffId);staffToken=newToken();await db.session.create({data:{userId:staffId,tokenHash:tokenHash(staffToken),expiresAt:new Date(Date.now()+3600000)}});
 const role=await db.role.findUniqueOrThrow({where:{key:'administrator'}});await db.userRole.create({data:{userId:staffId,roleId:role.id}});
 await request(app.getHttpServer()).get('/api/v1/admin/users').set('Authorization',`Bearer ${featureToken}`).expect(403);
 await request(app.getHttpServer()).post('/api/v1/auth/register').send({email:'injection@example.test',username:'injection',displayName:'Bad',password:'long password 123456',roles:['administrator']}).expect(400);
 await request(app.getHttpServer()).put('/api/v1/admin/users/'+staffId+'/roles').set('Authorization',`Bearer ${staffToken}`).send({roleIds:[]}).expect(400);
});
test('profile URLs and interests validate; joined public communities allow publication',async()=>{
 const topics=await request(app.getHttpServer()).get('/api/v1/catalog/topics').expect(200);assert.ok(topics.body.length>=4);
 const topicId=topics.body[0].id;
 await request(app.getHttpServer()).put('/api/v1/profile/interests').set('Authorization',`Bearer ${featureToken}`).send({topicIds:[topicId]}).expect(200);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({displayName:'Test Author',bio:'Hello Ilaro',website:'javascript:alert(1)'}).expect(400);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({displayName:'Test Author',bio:'Hello Ilaro',website:'https://example.com',department:'Computer Engineering'}).expect(200);
 const communities=await request(app.getHttpServer()).get('/api/v1/catalog/communities').expect(200);communityId=communities.body[0].id;
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'A department question',communityId}).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/catalog/communities/${communityId}/join`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 const result=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'A department question https://example.com',communityId,topicId}).expect(201);featurePost=result.body.id;
 const personalized=await request(app.getHttpServer()).get('/api/v1/posts?mode=for-you').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(personalized.body.data.some((p:{id:string})=>p.id===featurePost));
});
test('likes, reposts, bookmarks and daily member views are idempotent and private',async()=>{
 const root=`/api/v1/social/posts/${featurePost}`;for(const kind of ['likes','reposts','bookmarks'])for(let i=0;i<2;i++)await request(app.getHttpServer()).put(`${root}/${kind}`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const detail=await request(app.getHttpServer()).get(`/api/v1/posts/${featurePost}`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(detail.body._count.likes,1);assert.equal(detail.body._count.reposts,1);assert.equal(detail.body.viewer.bookmarked,true);assert.equal(detail.body._count.bookmarks,1);assert.equal(detail.body.bookmarks,undefined);
 const owner=await request(app.getHttpServer()).get(`/api/v1/posts/${featurePost}`).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(owner.body.viewer.bookmarked,false);
 await request(app.getHttpServer()).get('/api/v1/social/bookmarks').expect(401);
 const mine=await request(app.getHttpServer()).get('/api/v1/social/bookmarks').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(mine.body.data[0].id,featurePost);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).post(`${root}/view`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(201);
 assert.equal(await db.postView.count({where:{postId:featurePost}}),1);
 await request(app.getHttpServer()).delete(`${root}/likes`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(await db.like.count({where:{postId:featurePost}}),0);
});
test('following feed contains followed authors and prevents self-follow',async()=>{
 await request(app.getHttpServer()).put(`/api/v1/social/users/${authorId}/follow`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const feed=await request(app.getHttpServer()).get('/api/v1/posts?mode=following').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(feed.body.data.some((p:{id:string})=>p.id===featurePost));
 await request(app.getHttpServer()).put(`/api/v1/social/users/${authorId}/follow`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(400);
});
test('moderation hides content from feeds/bookmarks and writes an audit trail',async()=>{
 await request(app.getHttpServer()).post(`/api/v1/posts/${featurePost}/reports`).set('Authorization',`Bearer ${otherToken}`).send({reason:'OTHER',details:'Review fixture'}).expect(201);
 const reports=await request(app.getHttpServer()).get('/api/v1/admin/reports').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.ok(reports.body.some((r:{postId:string;snapshot:string})=>r.postId===featurePost&&r.snapshot));
 await request(app.getHttpServer()).put(`/api/v1/admin/posts/${featurePost}/moderation`).set('Authorization',`Bearer ${staffToken}`).send({status:'HIDDEN',reason:'Hidden for integration review'}).expect(200);
 await request(app.getHttpServer()).get(`/api/v1/posts/${featurePost}`).expect(404);
 const saved=await request(app.getHttpServer()).get('/api/v1/social/bookmarks').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(saved.body.data.some((p:{id:string})=>p.id===featurePost),false);
 assert.ok(await db.auditLog.count({where:{targetId:featurePost}})>0);
});



test('analytics deduplicates browser/day and page events, separates members, and protects collection',async()=>{
 const analytics=app.get(AnalyticsService);const visitorId=randomUUID(),eventId=randomUUID();const payload={visitorId,eventId,kind:'PAGE',page:'feed',source:'direct'};
 const send=(body:object,access?:string)=>{const r=request(app.getHttpServer()).post('/api/v1/stats/collect').set('Origin','http://localhost:5173').set('User-Agent','FpiBrowserTest');return (access?r.set('Authorization','Bearer '+access):r).send(body);};
 await request(app.getHttpServer()).post('/api/v1/stats/collect').set('Origin','https://evil.test').send(payload).expect(403);
 await request(app.getHttpServer()).post('/api/v1/stats/collect').send(payload).expect(403);
 const before=await db.analyticsDay.findUnique({where:{day:nigeriaDay()}});
 await send(payload).expect(201);await send(payload).expect(201);await send({...payload,kind:'PULSE',eventId:randomUUID()},featureToken).expect(201);await send({...payload,eventId:randomUUID()},featureToken).expect(201);
 const day=await db.analyticsDay.findUniqueOrThrow({where:{day:nigeriaDay()}});assert.equal(day.visitors-(before?.visitors??0),1);assert.equal(day.pageViews-(before?.pageViews??0),2);assert.equal(day.activeMembers-(before?.activeMembers??0),1);
 assert.equal(await db.analyticsMember.count({where:{userId:authorId}}),1);const measured=await db.analyticsVisitorDay.findFirstOrThrow();assert.notEqual(measured.visitorHash,visitorId);assert.equal(measured.visitorHash.length,64);
 analytics.clearCache();const stats=await request(app.getHttpServer()).get('/api/v1/stats?period=today').expect(200);assert.ok(stats.body.metrics.onlineNow>=1);assert.equal(stats.body.timezone,'Africa/Lagos');assert.equal(stats.body.secret,undefined);assert.equal(stats.body.admin,undefined);assert.equal(stats.body.metrics.revenue,undefined);
 await send({...payload,referrer:'https://private.test/secret'}).expect(400);
});

test('analytics honours privacy headers and crawler exclusion without inventing visitor counts',async()=>{
 const payload={visitorId:randomUUID(),eventId:randomUUID(),kind:'PAGE',page:'stats',source:'social'};const before=await db.analyticsVisitorDay.count();
 for(const headers of [{DNT:'1','User-Agent':'FpiBrowserTest'},{'Sec-GPC':'1','User-Agent':'FpiBrowserTest'},{'User-Agent':'ExampleCrawlerBot'}]){const r=await request(app.getHttpServer()).post('/api/v1/stats/collect').set('Origin','http://localhost:5173').set(headers).send(payload).expect(201);assert.equal(r.body.recorded,false);}
 assert.equal(await db.analyticsVisitorDay.count(),before);
 const old=new Date(Date.now()-600000);await db.analyticsMember.update({where:{userId:authorId},data:{lastSeen:old}});app.get(AnalyticsService).clearCache();const stats=await request(app.getHttpServer()).get('/api/v1/stats?period=today').expect(200);assert.equal(stats.body.metrics.onlineNow,0);
});

test('public totals exclude drafts, hidden/deleted content and article discussion double-counts',async()=>{
 const service=app.get(AnalyticsService);service.clearCache();const before=(await request(app.getHttpServer()).get('/api/v1/stats?period=all').expect(200)).body.metrics;
 const pub=await db.post.create({data:{authorId,body:'Stats visible root'}});const hidden=await db.post.create({data:{authorId,body:'Stats hidden root',status:'HIDDEN'}});await db.post.create({data:{authorId,body:'Stats deleted root',deletedAt:new Date()}});await db.post.create({data:{authorId,body:'Stats visible reply',parentId:pub.id}});
 const discussion=await db.post.create({data:{authorId,body:'Article root'}});const article=await db.article.create({data:{authorId,title:'Stats article',slug:'stats-'+runId,excerpt:'',body:'Public article text',status:'PUBLISHED',publishedAt:new Date(),discussionPostId:discussion.id}});
 await db.like.create({data:{userId:staffId,postId:pub.id}});await db.like.create({data:{userId:staffId,postId:hidden.id}});service.clearCache();let stats=(await request(app.getHttpServer()).get('/api/v1/stats?period=all').expect(200)).body.metrics;
 assert.equal(stats.posts-before.posts,1);assert.equal(stats.replies-before.replies,1);assert.equal(stats.articles-before.articles,1);assert.equal(stats.likes-before.likes,1);
 await db.article.update({where:{id:article.id},data:{status:'DRAFT'}});service.clearCache();stats=(await request(app.getHttpServer()).get('/api/v1/stats?period=all').expect(200)).body.metrics;assert.equal(stats.articles,before.articles);
 const legacyPost=await db.post.create({data:{authorId,body:'Legacy published discussion'}});await db.article.create({data:{authorId,title:'Legacy undated article',slug:'legacy-stats-'+runId,excerpt:'',body:'Legacy text',status:'PUBLISHED',discussionPostId:legacyPost.id}});service.clearCache();const legacy=(await request(app.getHttpServer()).get('/api/v1/stats?period=all').expect(200)).body.metrics;assert.equal(legacy.articles,before.articles+1);
});

test('admin analytics permissions, private settings, future modules and operations are enforced',async()=>{
 const service=app.get(AnalyticsService);await request(app.getHttpServer()).get('/api/v1/admin/analytics').expect(401);await request(app.getHttpServer()).get('/api/v1/admin/analytics').set('Authorization','Bearer '+featureToken).expect(403);
 service.recordApi(500,1500);service.recordApi(200,100);await service.flushApi();const dashboard=await request(app.getHttpServer()).get('/api/v1/admin/analytics?period=today').set('Authorization','Bearer '+staffToken).expect(200);assert.ok(dashboard.body.admin.apiErrors>=1);assert.ok(dashboard.body.admin.apiRequests>=2);assert.ok(dashboard.body.admin.mediaCapacityBytes>0);assert.equal(dashboard.body.modules.find((m:{key:string})=>m.key==='payments').status,'not_configured');assert.equal(dashboard.body.secret,undefined);
 const settings=await request(app.getHttpServer()).get('/api/v1/admin/analytics/settings').set('Authorization','Bearer '+staffToken).expect(200);assert.equal(settings.body.secret,undefined);
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;const role=await db.role.create({data:{key:'analyst-'+runId,name:'Analytics read fixture',permissions:['analytics.view']}});await db.userRole.create({data:{userId:otherId,roleId:role.id}});
 try{await request(app.getHttpServer()).get('/api/v1/admin/analytics').set('Authorization','Bearer '+otherToken).expect(200);await request(app.getHttpServer()).put('/api/v1/admin/analytics/settings').set('Authorization','Bearer '+otherToken).send({publicRankings:true}).expect(403);}finally{await db.userRole.delete({where:{userId_roleId:{userId:otherId,roleId:role.id}}});}
 await request(app.getHttpServer()).get('/api/v1/admin/analytics').set('Authorization','Bearer '+otherToken).expect(403);
});


test('week-two return cohorts become available only after sufficient measured history',async()=>{
 const service=app.get(AnalyticsService),settings=await service.settings();const userId=randomUUID(),registered=new Date(Date.now()-21*86400000);ids.push(userId);
 await db.user.create({data:{id:userId,email:'cohort-'+runId+'@example.test',username:'cohort'+Date.now(),displayName:'Cohort fixture',passwordHash:'fixture',createdAt:registered}});
 try{
 await db.analyticsSettings.update({where:{key:'main'},data:{trackingSince:new Date(Date.now()-30*86400000)}});await db.analyticsMemberDay.create({data:{userId,day:new Date(nigeriaDay(registered).getTime()+8*86400000),lastSeen:new Date(registered.getTime()+8*86400000)}});
 const data=await service.adminSummary('all');assert.equal(data.admin.cohortMembers,1);assert.equal(data.admin.cohortReturned,1);assert.equal(data.admin.weekTwoReturnRate,100);assert.equal(data.modules.find(m=>m.key==='retention')?.status,'available');
 }finally{await db.analyticsSettings.update({where:{key:'main'},data:{trackingSince:settings.trackingSince}});await db.user.delete({where:{id:userId}});}
 const recent=await service.adminSummary('today');assert.equal(recent.admin.weekTwoReturnRate,null);assert.equal(recent.modules.find(m=>m.key==='retention')?.status,'waiting_for_data');
});
test('admin rankings work immediately; public rankings are gated and honour opt-out and blocks',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const disabled=await request(app.getHttpServer()).get('/api/v1/stats/rankings').expect(200);assert.equal(disabled.body.enabled,false);
 const admin=await request(app.getHttpServer()).get('/api/v1/admin/analytics/rankings').set('Authorization','Bearer '+staffToken).expect(200);assert.ok(Array.isArray(admin.body.followers));
 await request(app.getHttpServer()).put('/api/v1/admin/analytics/settings').set('Authorization','Bearer '+staffToken).send({publicRankings:true}).expect(200);
 const user=await db.user.findUniqueOrThrow({where:{id:authorId}});await db.follow.upsert({where:{followerId_followingId:{followerId:otherId,followingId:authorId}},create:{followerId:otherId,followingId:authorId},update:{}});
 await request(app.getHttpServer()).put('/api/v1/stats/preferences').set('Authorization','Bearer '+featureToken).send({excludeFromPublicRankings:true}).expect(200);
 let ranks=await request(app.getHttpServer()).get('/api/v1/stats/rankings').expect(200);assert.equal(ranks.body.enabled,true);assert.ok(!ranks.body.followers.some((r:{href:string})=>r.href==='/u/'+user.username));
 await request(app.getHttpServer()).put('/api/v1/stats/preferences').set('Authorization','Bearer '+featureToken).send({excludeFromPublicRankings:false}).expect(200);
 ranks=await request(app.getHttpServer()).get('/api/v1/stats/rankings').expect(200);assert.ok(ranks.body.followers.some((r:{href:string})=>r.href==='/u/'+user.username));
 await db.block.create({data:{blockerId:otherId,blockedId:authorId}});try{ranks=await request(app.getHttpServer()).get('/api/v1/stats/rankings').set('Authorization','Bearer '+otherToken).expect(200);assert.ok(!ranks.body.followers.some((r:{href:string})=>r.href==='/u/'+user.username));}finally{await db.block.delete({where:{blockerId_blockedId:{blockerId:otherId,blockedId:authorId}}});}
 await request(app.getHttpServer()).put('/api/v1/admin/analytics/settings').set('Authorization','Bearer '+staffToken).send({publicRankings:false}).expect(200);
});

test('weekly snapshots are immutable, partial coverage is labelled, private fields never reach public reports',async()=>{
 const service=app.get(AnalyticsService),settings=await service.settings();const week=new Date(nigeriaWeek().getTime()-7*86400000);await db.analyticsSettings.update({where:{key:'main'},data:{trackingSince:new Date(week.getTime()+2*86400000)}});
 let report;
 try{report=await service.weekly(week);assert.ok(report);assert.equal(report.partial,true);const snapshot=JSON.stringify(report.publicData);await db.post.create({data:{authorId,body:'Later record with old date',createdAt:new Date(week.getTime()+3*86400000)}});await service.weekly(week);const unchanged=await db.analyticsWeeklyReport.findUniqueOrThrow({where:{weekStart:week}});assert.equal(JSON.stringify(unchanged.publicData),snapshot);
 const publicReports=await request(app.getHttpServer()).get('/api/v1/stats/reports').expect(200);assert.equal(publicReports.body[0].adminData,undefined);assert.equal(publicReports.body[0].publicData.metrics.onlineNow,null);
 const privateReports=await request(app.getHttpServer()).get('/api/v1/admin/analytics/reports').set('Authorization','Bearer '+staffToken).expect(200);assert.ok(privateReports.body[0].adminData.metrics);
 }finally{await db.analyticsSettings.update({where:{key:'main'},data:{trackingSince:settings.trackingSince}});}
 const future=await service.weekly(nigeriaWeek());assert.equal(future,null);
});


test('weekly report archives paginate without exposing private snapshots',async()=>{
 const weeks=Array.from({length:13},(_,i)=>new Date(Date.UTC(2020,0,6+i*7)));
 await db.analyticsWeeklyReport.createMany({data:weeks.map(weekStart=>({weekStart,weekEnd:new Date(weekStart.getTime()+7*86400000),partial:false,publicData:{metrics:{posts:1}},adminData:{privateCanary:12345}}))});
 const first=await request(app.getHttpServer()).get('/api/v1/stats/reports').expect(200);assert.equal(first.body.length,12);assert.ok(first.body.every((r:{adminData?:unknown})=>r.adminData===undefined));
 const second=await request(app.getHttpServer()).get('/api/v1/stats/reports?before='+first.body.at(-1).weekStart.slice(0,10)).expect(200);assert.ok(second.body.length>=1);const seen=new Set(first.body.map((r:{weekStart:string})=>r.weekStart));assert.ok(second.body.every((r:{weekStart:string})=>!seen.has(r.weekStart)));
 await request(app.getHttpServer()).get('/api/v1/stats/reports?before=2026-02-30').expect(400);
 await db.analyticsWeeklyReport.deleteMany({where:{weekStart:{in:weeks}}});
});
test('analytics retention removes short-lived identifiers but retains daily aggregates',async()=>{
 const day=new Date(nigeriaDay().getTime()-100*86400000);await db.analyticsDay.create({data:{day,visitors:9,pageViews:12,activeMembers:1}});await db.analyticsVisitorDay.create({data:{day,visitorHash:'f'.repeat(64),lastSeen:day}});await db.analyticsHit.create({data:{hash:'e'.repeat(64),day}});await db.analyticsMemberDay.create({data:{day,userId:authorId,lastSeen:day}});
 await app.get(AnalyticsService).tick();assert.equal(await db.analyticsVisitorDay.count({where:{day}}),0);assert.equal(await db.analyticsHit.count({where:{day}}),0);assert.equal(await db.analyticsMemberDay.count({where:{day}}),0);assert.equal((await db.analyticsDay.findUniqueOrThrow({where:{day}})).visitors,9);
});
test('mentions are resolved to account IDs, survive rename, and notify once per recipient',async()=>{
 const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)},include:{user:true}});const username=other.user.username;
 const post=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:`😀 Hello @${username.toUpperCase()} and @${username} #Ilaro`}).expect(201)).body;
 assert.equal(post.tokens.filter((t:{kind:string})=>t.kind==='MENTION').length,2);assert.equal(post.tokens[0].user.id,other.userId);assert.equal(post.body.slice(post.tokens[0].start,post.tokens[0].end),post.tokens[0].label);
 const events=await db.notification.findMany({where:{postId:post.id,recipientId:other.userId}});assert.equal(events.length,1);assert.equal(events[0].kind,'MENTION');
 const inbox=await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(inbox.body.data.some((n:{id:string;kind:string;href:string})=>n.id===events[0].id&&n.kind==='MENTION'&&n.href==='/posts/'+post.id));
 const replacement='renamed'+Date.now();await db.user.update({where:{id:other.userId},data:{username:replacement}});
 try{const reloaded=await request(app.getHttpServer()).get('/api/v1/posts/'+post.id).expect(200);assert.equal(reloaded.body.tokens[0].user.username,replacement);assert.equal(reloaded.body.tokens[0].label,'@'+username.toUpperCase());}finally{await db.user.update({where:{id:other.userId},data:{username}});}
 const quote=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Quoted entity context',quotedPostId:post.id}).expect(201)).body;assert.equal(quote.quotedPost.tokens[0].user.id,other.userId);
 await request(app.getHttpServer()).delete('/api/v1/posts/'+post.id).set('Authorization',`Bearer ${featureToken}`).expect(204);const removed=await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(!removed.body.data.some((n:{id:string})=>n.id===events[0].id));
});

test('reply and quote notifications take precedence over mentions; unknown/self mentions do not alert',async()=>{
 const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)},include:{user:true}});const me=await db.user.findUniqueOrThrow({where:{id:authorId}});
 const root=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Mention precedence root'}).expect(201)).body;
 for(const relation of ['parentId','quotedPostId']){const post=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:`Hello @${other.user.username} @${other.user.username} @${me.username} @unknown_account_zz`,[relation]:root.id}).expect(201)).body;const events=await db.notification.findMany({where:{postId:post.id}});assert.equal(events.length,1);assert.equal(events[0].kind,relation==='parentId'?'REPLY':'QUOTE');assert.equal(post.tokens.filter((t:{kind:string})=>t.kind==='MENTION').length,3);}
});

test('mentions and discovery respect mutes, bilateral blocks and recipient privacy',async()=>{
 const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)},include:{user:true}});const me=await db.user.findUniqueOrThrow({where:{id:authorId}});
 await request(app.getHttpServer()).get('/api/v1/discovery/mentions?q='+other.user.username).expect(401);
 const suggestions=await request(app.getHttpServer()).get('/api/v1/discovery/mentions?q='+other.user.username).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(suggestions.body.some((u:{id:string})=>u.id===other.userId));assert.equal(suggestions.body[0].email,undefined);
 await db.mute.create({data:{muterId:other.userId,mutedId:authorId}});
 const muted=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:`Muted mention @${other.user.username}`}).expect(201)).body;assert.equal(await db.notification.count({where:{postId:muted.id}}),0);
 const hidden=await request(app.getHttpServer()).get('/api/v1/discovery/mentions?q='+me.username).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(!hidden.body.some((u:{id:string})=>u.id===authorId));
 await db.mute.delete({where:{muterId_mutedId:{muterId:other.userId,mutedId:authorId}}});
 for(const direction of [true,false]){const blockerId=direction?authorId:other.userId,blockedId=direction?other.userId:authorId;await db.block.create({data:{blockerId,blockedId}});try{
 const post=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:`Blocked mention @${other.user.username}`}).expect(201)).body;assert.equal(post.tokens.length,0);assert.equal(await db.notification.count({where:{postId:post.id}}),0);const list=await request(app.getHttpServer()).get('/api/v1/discovery/mentions?q='+other.user.username).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(list.body.length,0);
 }finally{await db.block.delete({where:{blockerId_blockedId:{blockerId,blockedId}}});}}
});

test('hashtag feeds match exact canonical tags, include replies, paginate and filter hidden content',async()=>{
 const tag='tag'+Date.now();const created:string[]=[];
 for(const body of [`One #${tag.toUpperCase()}`,`Two #${tag}`,`Long #${tag}extra`])created.push((await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body}).expect(201)).body.id);
 const reply=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:`Reply #${tag}`,parentId:created[0]}).expect(201)).body;created.push(reply.id);
 const first=await request(app.getHttpServer()).get('/api/v1/posts?hashtag='+tag.toUpperCase()+'&limit=2').set('Authorization','Bearer '+featureToken).expect(200);assert.equal(first.body.data.length,2);assert.ok(first.body.nextCursor);
 const second=await request(app.getHttpServer()).get('/api/v1/posts?'+new URLSearchParams({hashtag:tag,limit:'2',cursor:first.body.nextCursor})).set('Authorization','Bearer '+featureToken).expect(200);const idsFound=[...first.body.data,...second.body.data].map((p:{id:string})=>p.id);assert.equal(new Set(idsFound).size,3);assert.ok(idsFound.includes(reply.id));assert.ok(!idsFound.includes(created[2]));
 await db.post.update({where:{id:created[0]},data:{status:'HIDDEN'}});const visible=await request(app.getHttpServer()).get('/api/v1/posts?hashtag='+tag).expect(200);assert.ok(!visible.body.data.some((p:{id:string})=>p.id===created[0]));
 const tags=await request(app.getHttpServer()).get('/api/v1/discovery/hashtags?q='+tag.toUpperCase()).expect(200);assert.ok(tags.body.some((t:{tag:string})=>t.tag===tag));await request(app.getHttpServer()).get('/api/v1/posts?hashtag=two%20words').expect(400);
});

test('excessive mentions/hashtags roll back posts and notifications',async()=>{
 const before=await db.post.count({where:{authorId}});await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:Array.from({length:11},(_,i)=>'@account'+i).join(' ')}).expect(400);assert.equal(await db.post.count({where:{authorId}}),before);await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Forged entity',tokens:[{kind:'MENTION',userId:staffId}]}).expect(400);
});
test('private working copies allow incomplete drafts, enforce ownership and reject stale saves',async()=>{
 const id=randomUUID();const base={version:0,title:'',excerpt:'',body:'',bodyFormat:'HTML'};
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${featureToken}`).send(base).expect(403);
 const draft=await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${staffToken}`).send(base).expect(200);
 assert.equal(draft.body.version,1);assert.equal(await db.article.findUnique({where:{id}}),null);
 await request(app.getHttpServer()).get(`/api/v1/publishing/${id}`).expect(401);
 const role=await db.role.findUniqueOrThrow({where:{key:'editor'}});const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}});
 await db.userRole.create({data:{userId:other.userId,roleId:role.id}});
 try{
 await request(app.getHttpServer()).get(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${otherToken}`).expect(403);
 const list=await request(app.getHttpServer()).get('/api/v1/publishing').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(!list.body.some((d:{id:string})=>d.id===id));
 }finally{await db.userRole.delete({where:{userId_roleId:{userId:other.userId,roleId:role.id}}});}
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${staffToken}`).send(base).expect(409);
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}/publication`).set('Authorization',`Bearer ${staffToken}`).send({version:1,action:'publish'}).expect(400);
 const changes=await Promise.all(['First title','Second title'].map(title=>request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...base,version:1,title,body:'<p>Draft body</p><script>bad()</script>'})));
 assert.deepEqual(changes.map(x=>x.status).sort(),[200,409]);
 const saved=await db.articleWorkingCopy.findUniqueOrThrow({where:{id}});assert.equal(saved.version,2);assert.ok(!JSON.stringify(saved.payload).includes('<script>'));
});

test('autosaving live edits is private; publication preserves slug, discussion and engagements',async()=>{
 const id=randomUUID();const send=(data:object)=>request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${staffToken}`).send(data);
 const act=(data:object)=>request(app.getHttpServer()).put(`/api/v1/publishing/${id}/publication`).set('Authorization',`Bearer ${staffToken}`).send(data);
 const base={version:0,title:'Published original',excerpt:'Public summary',body:'<p>Public text</p>',bodyFormat:'HTML'};
 await send(base).expect(200);await act({version:1,action:'publish'}).expect(200);
 const original=await db.article.findUniqueOrThrow({where:{id}});assert.ok(original.discussionPostId);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${original.discussionPostId}/likes`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 await send({...base,version:2,title:'Private replacement',body:'<h2>Not yet public</h2>'}).expect(200);
 const live=await request(app.getHttpServer()).get(`/api/v1/articles/${original.slug}`).expect(200);assert.equal(live.body.title,'Published original');assert.equal(live.body.discussion._count.likes,1);assert.ok(!JSON.stringify(live.body).includes('Private replacement'));
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({title:base.title,excerpt:base.excerpt,body:base.body,bodyFormat:base.bodyFormat,status:'PUBLISHED'}).expect(403);
 await act({version:3,action:'publish'}).expect(200);
 const updated=await db.article.findUniqueOrThrow({where:{id}});assert.equal(updated.slug,original.slug);assert.equal(updated.discussionPostId,original.discussionPostId);assert.equal(updated.title,'Private replacement');assert.equal(updated.publishedAt?.toISOString(),original.publishedAt?.toISOString());
 await act({version:4,action:'unpublish'}).expect(200);await request(app.getHttpServer()).get(`/api/v1/articles/${original.slug}`).expect(404);await request(app.getHttpServer()).get(`/api/v1/posts/${original.discussionPostId}`).expect(404);await act({version:5,action:'publish'}).expect(200);
 assert.equal((await db.article.findUniqueOrThrow({where:{id}})).discussionPostId,original.discussionPostId);
});

test('schedules validate timezone, lock drafts, cancel, reschedule and publish exactly once across workers',async()=>{
 const id=randomUUID();const base={version:0,title:'A scheduled story',excerpt:'Timed update',body:'<p>Scheduled content</p>',bodyFormat:'HTML'};
 const headers={Authorization:`Bearer ${staffToken}`};
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set(headers).send(base).expect(200);
 const act=(data:object)=>request(app.getHttpServer()).put(`/api/v1/publishing/${id}/publication`).set(headers).send(data);
 await act({version:1,action:'schedule',scheduledAt:'2030-01-01T10:00:00'}).expect(400);
 await act({version:1,action:'schedule',scheduledAt:new Date(Date.now()-1000).toISOString()}).expect(400);
 let scheduled=await act({version:1,action:'schedule',scheduledAt:new Date(Date.now()+120000).toISOString()}).expect(200);assert.equal(scheduled.body.version,2);
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set(headers).send({...base,version:2}).expect(409);
 await act({version:2,action:'cancel'}).expect(200);
 await app.get(PublishingService).tick();assert.equal(await db.article.findUnique({where:{id}}),null);
 scheduled=await act({version:3,action:'schedule',scheduledAt:new Date(Date.now()+120000).toISOString()}).expect(200);
 await db.articleWorkingCopy.update({where:{id},data:{scheduledAt:new Date(Date.now()-1000)}});
 const secondWorker=new PublishingService(db,app.get(MediaService));
 await Promise.all([app.get(PublishingService).tick(),secondWorker.tick()]);
 const article=await db.article.findUniqueOrThrow({where:{id}});assert.ok(article.discussionPostId);assert.equal(await db.post.count({where:{article:{id}}}),1);
 const done=await db.articleWorkingCopy.findUniqueOrThrow({where:{id}});assert.equal(done.scheduledAt,null);assert.equal(done.version,done.publishedVersion);
 await secondWorker.tick();assert.equal(await db.auditLog.count({where:{targetId:id,action:'article.publish'}}),1);
});

test('scheduled publication rechecks current permissions and retains draft when permission is revoked',async()=>{
 const id=randomUUID();const role=await db.role.findUniqueOrThrow({where:{key:'editor'}});const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}});
 await db.userRole.create({data:{userId:other.userId,roleId:role.id}});
 const headers={Authorization:`Bearer ${otherToken}`};
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set(headers).send({version:0,title:'Permission review',excerpt:'',body:'Private text',bodyFormat:'PLAIN'}).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}/publication`).set(headers).send({version:1,action:'schedule',scheduledAt:new Date(Date.now()+120000).toISOString()}).expect(200);
 await db.userRole.delete({where:{userId_roleId:{userId:other.userId,roleId:role.id}}});
 await db.articleWorkingCopy.update({where:{id},data:{scheduledAt:new Date(Date.now()-1000)}});
 await app.get(PublishingService).tick();const draft=await db.articleWorkingCopy.findUniqueOrThrow({where:{id}});assert.equal(draft.scheduledAt,null);assert.ok(draft.scheduleError?.includes('permissions'));assert.equal(await db.article.findUnique({where:{id}}),null);
});

test('working-copy covers stay private while authors and managing editors can preview them',async()=>{
 const role=await db.role.findUniqueOrThrow({where:{key:'editor'}});const other=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}});await db.userRole.create({data:{userId:other.userId,roleId:role.id}});
 try{
 const image=await sharp({create:{width:20,height:20,channels:3,background:'#227744'}}).png().toBuffer();
 const upload=async(access:string)=>(await request(app.getHttpServer()).post('/api/v1/media/cover').set('Authorization',`Bearer ${access}`).attach('file',image,{filename:'cover.png',contentType:'image/png'}).expect(201)).body.id;
 const ownCover=await upload(otherToken),adminCover=await upload(staffToken),id=randomUUID();
 const payload={version:0,title:'Private cover review',excerpt:'',body:'Cover preview',bodyFormat:'PLAIN',coverMediaId:ownCover};
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${otherToken}`).send(payload).expect(200);
 await request(app.getHttpServer()).get('/api/v1/media/'+ownCover).set('Authorization',`Bearer ${staffToken}`).expect(200);
 await request(app.getHttpServer()).get('/api/v1/media/'+ownCover).set('Authorization',`Bearer ${featureToken}`).expect(404);
 await request(app.getHttpServer()).get('/api/v1/media/'+ownCover).expect(404);
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${otherToken}`).send({...payload,version:1,coverMediaId:adminCover}).expect(400);
 await request(app.getHttpServer()).put(`/api/v1/publishing/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,version:1,coverMediaId:adminCover}).expect(200);
 await request(app.getHttpServer()).get('/api/v1/media/'+adminCover).set('Authorization',`Bearer ${otherToken}`).expect(200);
 await request(app.getHttpServer()).get('/api/v1/media/'+adminCover).set('Authorization',`Bearer ${featureToken}`).expect(404);
 }finally{await db.userRole.delete({where:{userId_roleId:{userId:other.userId,roleId:role.id}}});}
});
test('article ownership, automatic URLs, safe rich text and one shared feed discussion',async()=>{
 const id=randomUUID();const payload={title:'Campus Guide',excerpt:'A useful guide',body:'<h2>Welcome</h2><p>Hello <strong>Ilaro</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>',bodyFormat:'HTML',status:'DRAFT'};
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${featureToken}`).send(payload).expect(403);
 const draft=await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send(payload).expect(200);
 assert.ok(draft.body.slug.startsWith('campus-guide-'));assert.equal(draft.body.discussionPostId,null);assert.ok(!draft.body.body.includes('<script'));assert.ok(!draft.body.body.includes('javascript:'));assert.ok(draft.body.body.includes('<strong>Ilaro</strong>'));
 await request(app.getHttpServer()).get(`/api/v1/articles/${draft.body.slug}`).expect(404);
 const editor=await db.role.findUniqueOrThrow({where:{key:'editor'}});const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 await db.userRole.upsert({where:{userId_roleId:{userId:otherId,roleId:editor.id}},create:{userId:otherId,roleId:editor.id},update:{}});
 const ownList=await request(app.getHttpServer()).get('/api/v1/editorial').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(!ownList.body.some((a:{id:string})=>a.id===id));
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${otherToken}`).send(payload).expect(403);
 const ownId=randomUUID();await request(app.getHttpServer()).put(`/api/v1/editorial/${ownId}`).set('Authorization',`Bearer ${otherToken}`).send({...payload,status:'PUBLISHED'}).expect(200);
 const published=await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'PUBLISHED'}).expect(200);
 const changed=await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,title:'A changed title',status:'PUBLISHED'}).expect(200);assert.equal(changed.body.slug,draft.body.slug);assert.equal(changed.body.discussionPostId,published.body.discussionPostId);
 const detail=await request(app.getHttpServer()).get(`/api/v1/articles/${draft.body.slug}`).expect(200);const postId=detail.body.discussion.id;
 const feed=await request(app.getHttpServer()).get('/api/v1/posts?limit=50').expect(200);assert.ok(feed.body.data.some((p:{id:string;article?:{id:string}})=>p.id===postId&&p.article?.id===id));
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${postId}/likes`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Article discussion comment',parentId:postId}).expect(201);
 const engaged=await request(app.getHttpServer()).get(`/api/v1/articles/${draft.body.slug}`).expect(200);assert.equal(engaged.body.discussion._count.likes,1);assert.equal(engaged.body.discussion._count.replies,1);
 await request(app.getHttpServer()).delete(`/api/v1/posts/${postId}`).set('Authorization',`Bearer ${staffToken}`).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'DRAFT'}).expect(200);
 await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(404);await request(app.getHttpServer()).get(`/api/v1/articles/${draft.body.slug}`).expect(404);
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'PUBLISHED'}).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/admin/posts/${postId}/moderation`).set('Authorization',`Bearer ${staffToken}`).send({status:'HIDDEN',reason:'Article moderation test'}).expect(200);await request(app.getHttpServer()).get(`/api/v1/articles/${draft.body.slug}`).expect(404);
 const guest=await request(app.getHttpServer()).get('/api/v1/navigation').expect(200);assert.equal(guest.body.some((m:{path:string})=>m.path==='/admin'),false);
 await db.userRole.delete({where:{userId_roleId:{userId:otherId,roleId:editor.id}}});
});
test('image uploads validate bytes, optimize output, enforce ownership and respect visibility',async()=>{
 const png=await sharp({create:{width:48,height:32,channels:3,background:'#246c40'}}).png().withMetadata({exif:{IFD0:{Artist:'private fixture metadata'}}}).toBuffer();
 await request(app.getHttpServer()).post('/api/v1/media/post').attach('file',png,{filename:'campus.png',contentType:'image/png'}).expect(401);
 await request(app.getHttpServer()).post('/api/v1/media/post').set('Authorization',`Bearer ${featureToken}`).attach('file',Buffer.from('<svg><script>bad()</script></svg>'),{filename:'fake.png',contentType:'image/png'}).expect(400);
 await request(app.getHttpServer()).post('/api/v1/media/post').set('Authorization',`Bearer ${featureToken}`).attach('file',Buffer.alloc(5*1024*1024+1),{filename:'large.png',contentType:'image/png'}).expect(413);
 const image=await request(app.getHttpServer()).post('/api/v1/media/post').set('Authorization',`Bearer ${featureToken}`).attach('file',png,{filename:'../../campus.png',contentType:'image/png'}).expect(201);const imageId=image.body.id;assert.equal(image.body.width,48);assert.equal(image.body.height,32);
 await request(app.getHttpServer()).get(`/api/v1/media/${imageId}`).expect(404);await request(app.getHttpServer()).get(`/api/v1/media/${imageId}`).set('Authorization',`Bearer ${otherToken}`).expect(404);
 const preview=await request(app.getHttpServer()).get(`/api/v1/media/${imageId}`).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.match(preview.headers['content-type'],/^image\/webp/);assert.equal(preview.headers['cache-control'],'no-store');const metadata=await sharp(preview.body).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Stolen image',imageMediaId:imageId}).expect(400);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({displayName:'Test Author',bio:'',avatarMediaId:imageId}).expect(400);
 const post=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Campus photo',imageMediaId:imageId,imageAlt:'A green campus scene'}).expect(201);assert.equal(post.body.imageMediaId,imageId);assert.equal(post.body.imageAlt,'A green campus scene');await request(app.getHttpServer()).get(`/api/v1/media/${imageId}`).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/admin/posts/${post.body.id}/moderation`).set('Authorization',`Bearer ${staffToken}`).send({status:'HIDDEN',reason:'Image visibility moderation check'}).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${imageId}`).expect(404);
 const avatar=await request(app.getHttpServer()).post('/api/v1/media/avatar').set('Authorization',`Bearer ${featureToken}`).attach('file',png,{filename:'avatar.png',contentType:'image/png'}).expect(201);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({displayName:'Test Author',bio:'',avatarMediaId:avatar.body.id}).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${avatar.body.id}`).expect(200);
 const me=await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(me.body.avatarMediaId,avatar.body.id);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({displayName:'Test Author',bio:'',avatarMediaId:null}).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${avatar.body.id}`).expect(404);
});
test('article covers remain private in drafts and become public with the published article',async()=>{
 const png=await sharp({create:{width:64,height:40,channels:3,background:'#235b42'}}).png().toBuffer();const upload=await request(app.getHttpServer()).post('/api/v1/media/cover').set('Authorization',`Bearer ${staffToken}`).attach('file',png,{filename:'cover.png',contentType:'image/png'}).expect(201);const id=randomUUID();const payload={title:'A covered article',excerpt:'A cover image test',body:'Article text',status:'DRAFT',coverMediaId:upload.body.id,coverAlt:'A campus green cover'};
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send(payload).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${upload.body.id}`).expect(404);
 const published=await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'PUBLISHED'}).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${upload.body.id}`).expect(200);
 const article=await request(app.getHttpServer()).get(`/api/v1/articles/${published.body.slug}`).expect(200);assert.equal(article.body.discussion.article.coverMediaId,upload.body.id);assert.equal(article.body.coverAlt,payload.coverAlt);
 await request(app.getHttpServer()).put(`/api/v1/editorial/${id}`).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'DRAFT'}).expect(200);await request(app.getHttpServer()).get(`/api/v1/media/${upload.body.id}`).expect(404);
 await db.media.create({data:{ownerId:staffId,kind:'COVER',bytes:100*1024*1024,width:1,height:1}});
 await request(app.getHttpServer()).post('/api/v1/media/cover').set('Authorization',`Bearer ${staffToken}`).attach('file',png,{filename:'quota.png',contentType:'image/png'}).expect(400);
 await db.media.deleteMany({where:{ownerId:staffId,bytes:100*1024*1024}});
});
test('private profile details, username availability and uniqueness are enforced',async()=>{
 const values={displayName:'Test Author',bio:'Private profile test',phoneNumber:'+2348012345678',dateOfBirth:'2000-02-29',location:'Ilaro, Ogun State'};
 for(const invalid of [{dateOfBirth:'2099-01-01'},{dateOfBirth:'2001-02-29'},{phoneNumber:'08012345678'}])await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({...values,...invalid}).expect(400);
 const username='updated'+runId;await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${featureToken}`).send({...values,username}).expect(200);
 const me=await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(me.body.dateOfBirth,values.dateOfBirth);assert.equal(me.body.phoneNumber,values.phoneNumber);
 const publicProfile=await request(app.getHttpServer()).get('/api/v1/users/'+username).expect(200);assert.equal(publicProfile.body.phoneNumber,undefined);assert.equal(publicProfile.body.dateOfBirth,undefined);assert.equal(publicProfile.body.location,values.location);
 const taken=await request(app.getHttpServer()).get('/api/v1/auth/username-availability?username='+username).expect(200);assert.equal(taken.body.available,false);
 const own=await request(app.getHttpServer()).get('/api/v1/auth/username-availability?username='+username).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(own.body.available,true);
 await request(app.getHttpServer()).put('/api/v1/profile').set('Authorization',`Bearer ${otherToken}`).send({displayName:'Other',bio:'',username}).expect(409);
});
test('quotes, attributed repost events and the first-link preview survive feed reloads',async()=>{
 const preview=await db.linkPreview.create({data:{url:'https://first.example.com/story',title:'First story',description:'A cached public story',siteName:'First site'}});
 const original=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Original for quote '+runId}).expect(201);
 const quote=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'My thoughts https://first.example.com/story https://second.example.com/story',quotedPostId:original.body.id}).expect(201);assert.equal(quote.body.quotedPost.id,original.body.id);assert.equal(quote.body.linkPreview.id,preview.id);
 const post=await request(app.getHttpServer()).get('/api/v1/posts/'+original.body.id).expect(200);assert.equal(post.body._count.quotes,1);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${original.body.id}/reposts`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const feed=await request(app.getHttpServer()).get('/api/v1/posts?limit=50').expect(200);const event=feed.body.data.find((p:any)=>p.id===original.body.id&&p.repostedBy);assert.ok(event?.repostedBy.username);assert.ok(event.feedId);assert.ok(feed.body.data.some((p:any)=>p.id===quote.body.id&&p.quotedPost.id===original.body.id));
 await request(app.getHttpServer()).delete(`/api/v1/social/posts/${original.body.id}/reposts`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(await db.feedEvent.count({where:{postId:original.body.id,kind:'REPOST'}}),0);
 await request(app.getHttpServer()).put(`/api/v1/admin/posts/${original.body.id}/moderation`).set('Authorization',`Bearer ${staffToken}`).send({status:'HIDDEN',reason:'Quoted original visibility check'}).expect(200);
 const hidden=await request(app.getHttpServer()).get('/api/v1/posts/'+quote.body.id).expect(200);assert.equal(hidden.body.quotedPost,null);assert.equal(hidden.body.quotedPostId,original.body.id);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Cannot quote hidden post',quotedPostId:original.body.id}).expect(404);
 const blocked=await request(app.getHttpServer()).post('/api/v1/link-previews').set('Authorization',`Bearer ${otherToken}`).send({url:'http://127.0.0.1/private'}).expect(201);assert.equal(blocked.body.preview,null);
 await request(app.getHttpServer()).post('/api/v1/link-previews').send({url:'https://example.com'}).expect(401);
 await db.linkPreview.delete({where:{id:preview.id}});
});
test('reply permissions are enforced by the API and inherited throughout the conversation',async()=>{
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Restricted conversation',replyPolicy:'FOLLOWING'}).expect(201);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Not yet allowed',parentId:root.body.id,replyPolicy:'EVERYONE'}).expect(403);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Author can reply',parentId:root.body.id}).expect(201);
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 await request(app.getHttpServer()).put('/api/v1/social/users/'+otherId+'/follow').set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 const reply=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Now permitted',parentId:root.body.id,replyPolicy:'EVERYONE'}).expect(201);assert.equal(reply.body.replyPolicy,'FOLLOWING');assert.equal(reply.body.replyPolicyOwnerId,authorId);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${staffToken}`).send({body:'Cannot bypass through child',parentId:reply.body.id}).expect(403);
 await request(app.getHttpServer()).delete('/api/v1/social/users/'+otherId+'/follow').set('Authorization',`Bearer ${featureToken}`).expect(200);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Permission revoked',parentId:reply.body.id}).expect(403);
});
test('muting privately filters feeds, repost actors, quotes and replies but allows deliberate profile visits',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const other=await db.user.findUniqueOrThrow({where:{id:otherId}});
 const original=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Muted original '+runId}).expect(201)).body;
 const staffPost=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${staffToken}`).send({body:'Visible third party '+runId}).expect(201)).body;
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${staffPost.id}/reposts`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const quote=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${staffToken}`).send({body:'Third party quote',quotedPostId:original.id}).expect(201)).body;
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Muted reply',parentId:staffPost.id}).expect(201);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${original.id}/bookmarks`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).put('/api/v1/safety/mutes/'+otherId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 const ownQuote=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Deliberate quote of a muted account',quotedPostId:original.id}).expect(201);assert.equal(ownQuote.body.quotedPost,null);
 const feed=await request(app.getHttpServer()).get('/api/v1/posts?limit=50').set('Authorization',`Bearer ${featureToken}`).expect(200);
 assert.ok(!feed.body.data.some((p:{author:{id:string};repostedBy?:{id:string}})=>p.author.id===otherId||p.repostedBy?.id===otherId));
 const quoted=await request(app.getHttpServer()).get('/api/v1/posts/'+quote.id).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(quoted.body.quotedPost,null);
 const replies=await request(app.getHttpServer()).get(`/api/v1/posts/${staffPost.id}/replies`).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(replies.body.data.length,0);
 const detail=await request(app.getHttpServer()).get('/api/v1/posts/'+staffPost.id).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(detail.body._count.replies,0);
 const bookmarks=await request(app.getHttpServer()).get('/api/v1/social/bookmarks').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(!bookmarks.body.data.some((p:{id:string})=>p.id===original.id));
 await request(app.getHttpServer()).get('/api/v1/users/'+other.username).set('Authorization',`Bearer ${featureToken}`).expect(200);
 const profilePosts=await request(app.getHttpServer()).get('/api/v1/users/'+other.username+'/posts').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(profilePosts.body.data.some((p:{id:string})=>p.id===original.id));
 await request(app.getHttpServer()).get('/api/v1/posts/'+original.id).set('Authorization',`Bearer ${featureToken}`).expect(200);
 const privateState=await request(app.getHttpServer()).get('/api/v1/safety/users/'+authorId).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(privateState.body.muted,false);
 await request(app.getHttpServer()).get('/api/v1/safety').expect(401);
 await request(app.getHttpServer()).delete('/api/v1/safety/mutes/'+otherId).set('Authorization',`Bearer ${featureToken}`).expect(200);
 const restored=await request(app.getHttpServer()).get('/api/v1/posts/'+quote.id).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(restored.body.quotedPost.id,original.id);
});
test('blocking is bilateral, removes follows, rejects interaction and prevents nested-reply bypass',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;const other=await db.user.findUniqueOrThrow({where:{id:otherId}});const author=await db.user.findUniqueOrThrow({where:{id:authorId}});
 const root=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Blocked conversation '+runId}).expect(201)).body;
 const reply=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${staffToken}`).send({body:'Third party child',parentId:root.id}).expect(201)).body;
 const target=(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Blocked counterpart '+runId}).expect(201)).body;
 for(const [viewer,id] of [[featureToken,otherId],[otherToken,authorId]])await request(app.getHttpServer()).put('/api/v1/social/users/'+id+'/follow').set('Authorization',`Bearer ${viewer}`).send({}).expect(200);
 const report=await request(app.getHttpServer()).post(`/api/v1/posts/${target.id}/reports`).set('Authorization',`Bearer ${featureToken}`).send({reason:'HARASSMENT',details:'Review retained after block'}).expect(201);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+otherId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 assert.equal(await db.follow.count({where:{OR:[{followerId:authorId,followingId:otherId},{followerId:otherId,followingId:authorId}]}}),0);
 for(const [viewer,id,post] of [[featureToken,otherId,target.id],[otherToken,authorId,root.id]]){
  await request(app.getHttpServer()).get('/api/v1/posts/'+post).set('Authorization',`Bearer ${viewer}`).expect(404);
  await request(app.getHttpServer()).put('/api/v1/social/users/'+id+'/follow').set('Authorization',`Bearer ${viewer}`).send({}).expect(404);
  for(const kind of ['likes','reposts','bookmarks'])await request(app.getHttpServer()).put(`/api/v1/social/posts/${post}/${kind}`).set('Authorization',`Bearer ${viewer}`).send({}).expect(404);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${viewer}`).send({body:'Cannot reply',parentId:post}).expect(404);
  await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${viewer}`).send({body:'Cannot quote',quotedPostId:post}).expect(404);
 }
 await request(app.getHttpServer()).get('/api/v1/posts/'+reply.id).set('Authorization',`Bearer ${otherToken}`).expect(404);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Cannot bypass nested child',parentId:reply.id}).expect(404);
 const limited=await request(app.getHttpServer()).get('/api/v1/users/'+other.username).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(limited.body.blocked,true);assert.equal(limited.body.bio,undefined);
 await request(app.getHttpServer()).get('/api/v1/users/'+author.username).set('Authorization',`Bearer ${otherToken}`).expect(404);
 await request(app.getHttpServer()).get('/api/v1/users/'+author.username+'/posts').set('Authorization',`Bearer ${otherToken}`).expect(404);
 const ownList=await request(app.getHttpServer()).get('/api/v1/safety').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(ownList.body.blocks.some((x:{blocked:{id:string}})=>x.blocked.id===otherId));
 await request(app.getHttpServer()).get('/api/v1/posts/'+root.id).expect(200);
 // Moderation remains available to authorized staff despite personal safety preferences.
 await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+otherId).set('Authorization',`Bearer ${staffToken}`).send({}).expect(200);
 const queue=await request(app.getHttpServer()).get('/api/v1/admin/reports?status=OPEN&reason=HARASSMENT').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.ok(queue.body.some((x:{id:string})=>x.id===report.body.id));
 await request(app.getHttpServer()).delete('/api/v1/safety/blocks/'+otherId).set('Authorization',`Bearer ${staffToken}`).expect(200);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).delete('/api/v1/safety/blocks/'+otherId).set('Authorization',`Bearer ${featureToken}`).expect(200);
 await request(app.getHttpServer()).get('/api/v1/posts/'+target.id).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(await db.follow.count({where:{followerId:authorId,followingId:otherId}}),0);
 await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+authorId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(400);
 await request(app.getHttpServer()).put('/api/v1/safety/mutes/not-an-id').set('Authorization',`Bearer ${featureToken}`).send({}).expect(400);
});
test('signed-in media and article reads respect blocks and moderation records review notes',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const png=await sharp({create:{width:32,height:32,channels:3,background:'#235b42'}}).png().toBuffer();
 const image=await request(app.getHttpServer()).post('/api/v1/media/post').set('Authorization',`Bearer ${otherToken}`).attach('file',png,{filename:'safety.png',contentType:'image/png'}).expect(201);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Safety media',imageMediaId:image.body.id}).expect(201);
 const articleId=randomUUID();const article=await request(app.getHttpServer()).put('/api/v1/editorial/'+articleId).set('Authorization',`Bearer ${staffToken}`).send({title:'Safety article fixture',excerpt:'Blocking article visibility',body:'Published text',status:'PUBLISHED'}).expect(200);
 await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+otherId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 await request(app.getHttpServer()).get('/api/v1/media/'+image.body.id).set('Authorization',`Bearer ${featureToken}`).expect(404);await request(app.getHttpServer()).get('/api/v1/media/'+image.body.id).expect(200);
 await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+staffId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 await request(app.getHttpServer()).get('/api/v1/articles/'+article.body.slug).set('Authorization',`Bearer ${featureToken}`).expect(404);
 const articles=await request(app.getHttpServer()).get('/api/v1/articles').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(!articles.body.some((x:{id:string})=>x.id===articleId));
 for(const id of [otherId,staffId])await request(app.getHttpServer()).delete('/api/v1/safety/blocks/'+id).set('Authorization',`Bearer ${featureToken}`).expect(200);
 const report=await db.report.findFirstOrThrow({where:{reason:'HARASSMENT',reporterId:authorId}});
 await request(app.getHttpServer()).put(`/api/v1/admin/reports/${report.id}/resolve`).set('Authorization',`Bearer ${featureToken}`).send({note:'No permission'}).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/admin/reports/${report.id}/resolve`).set('Authorization',`Bearer ${staffToken}`).send({note:'x'}).expect(400);
 await request(app.getHttpServer()).put(`/api/v1/admin/reports/${report.id}/resolve`).set('Authorization',`Bearer ${staffToken}`).send({note:'Reviewed and retained as evidence'}).expect(200);
 const reviewed=await db.report.findUniqueOrThrow({where:{id:report.id}});assert.equal(reviewed.status,'RESOLVED');assert.equal(reviewed.reviewedById,staffId);assert.ok(reviewed.reviewedAt);assert.equal(reviewed.reviewNote,'Reviewed and retained as evidence');
 const queue=await request(app.getHttpServer()).get('/api/v1/admin/reports?status=OPEN&reason=HARASSMENT').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.ok(!queue.body.some((x:{id:string})=>x.id===report.id));
 await request(app.getHttpServer()).put(`/api/v1/admin/reports/${report.id}/reopen`).set('Authorization',`Bearer ${staffToken}`).send({note:'Further evidence needs review'}).expect(200);
 assert.equal((await db.report.findUniqueOrThrow({where:{id:report.id}})).status,'OPEN');assert.ok(await db.auditLog.findFirst({where:{targetId:report.id,action:'report.reopen',actorId:staffId}}));
 await request(app.getHttpServer()).get('/api/v1/admin/reports?status=INVALID').set('Authorization',`Bearer ${staffToken}`).expect(400);
});
test('private safety lists and filtered report queues paginate without losing boundary records',async()=>{
 const fixtureIds=Array.from({length:105},()=>randomUUID());ids.push(...fixtureIds);const passwordHash=(await db.user.findUniqueOrThrow({where:{id:authorId}})).passwordHash;
 await db.user.createMany({data:fixtureIds.map((id,index)=>({id,email:`page${index}${runId}@example.test`,username:`page${index}${runId}`,displayName:'Pagination fixture',passwordHash}))});
 await db.block.createMany({data:fixtureIds.map(blockedId=>({blockerId:authorId,blockedId}))});await db.mute.createMany({data:fixtureIds.slice(0,4).map(mutedId=>({muterId:authorId,mutedId}))});
 const blocked=new Set<string>();const muted=new Set<string>();let cursor:string|null=null;let pages=0;
 do{const page:import('supertest').Response=await request(app.getHttpServer()).get('/api/v1/safety'+(cursor?'?before='+cursor:'')).set('Authorization',`Bearer ${featureToken}`).expect(200);for(const row of page.body.blocks){assert.ok(!blocked.has(row.blocked.id));blocked.add(row.blocked.id);assert.equal(row.blocked.phoneNumber,undefined);assert.equal(row.blocked.email,undefined);}for(const row of page.body.mutes){assert.ok(!muted.has(row.muted.id));muted.add(row.muted.id);}cursor=page.body.nextCursor;assert.ok(++pages<5);}while(cursor);
 assert.equal(blocked.size,105);assert.equal(muted.size,4);assert.ok(pages>=2);
 const stranger=await request(app.getHttpServer()).get('/api/v1/safety').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(stranger.body.blocks.length,0);assert.equal(stranger.body.mutes.length,0);
 await request(app.getHttpServer()).get('/api/v1/safety?before=------------------------------------').set('Authorization',`Bearer ${featureToken}`).expect(400);
 await db.block.deleteMany({where:{blockerId:authorId}});await db.mute.deleteMany({where:{muterId:authorId}});
 const postIds=Array.from({length:103},()=>randomUUID());await db.post.createMany({data:postIds.map(id=>({id,authorId:staffId,replyPolicyOwnerId:staffId,body:'Moderation pagination fixture'}))});
 await db.report.createMany({data:postIds.map(postId=>({postId,reporterId:authorId,reason:'THREAT',createdAt:new Date('2024-01-01T00:00:00Z')}))});
 const first=await request(app.getHttpServer()).get('/api/v1/admin/reports?status=OPEN&reason=THREAT').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.equal(first.body.length,100);
 const second=await request(app.getHttpServer()).get('/api/v1/admin/reports?status=OPEN&reason=THREAT&before='+first.body.at(-1).id).set('Authorization',`Bearer ${staffToken}`).expect(200);assert.equal(second.body.length,3);const seen=new Set(first.body.map((x:{id:string})=>x.id));for(const row of second.body)assert.ok(!seen.has(row.id));
});
test('notifications are private, transactional, idempotent and exclude self activity',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Notification root '+runId}).expect(201);
 const reply=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Notification reply '+runId,parentId:root.body.id}).expect(201);
 const quote=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Notification quote '+runId,quotedPostId:root.body.id}).expect(201);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.body.id}/reposts`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 await request(app.getHttpServer()).delete(`/api/v1/social/users/${authorId}/follow`).set('Authorization',`Bearer ${otherToken}`).expect(200);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).put(`/api/v1/social/users/${authorId}/follow`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const replyNotice=await db.notification.findUniqueOrThrow({where:{eventKey:'REPLY:'+reply.body.id}});assert.equal(replyNotice.recipientId,authorId);assert.equal(replyNotice.actorId,otherId);
 assert.equal(await db.notification.count({where:{eventKey:'REPOST:'+otherId+':'+root.body.id}}),1);assert.equal(await db.notification.count({where:{eventKey:'FOLLOW:'+otherId+':'+authorId}}),1);
 const inbox=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${featureToken}`).expect(200);
 const row=inbox.body.data.find((x:{id:string})=>x.id===replyNotice.id);assert.ok(row);assert.equal(row.kind,'REPLY');assert.equal(row.href,'/posts/'+reply.body.id);assert.equal(row.preview,'Notification reply '+runId);assert.equal(row.actor.email,undefined);assert.equal(row.recipientId,undefined);assert.equal(row.eventKey,undefined);assert.ok(inbox.body.unreadCount>=4);assert.ok(Number.isFinite(Date.parse(inbox.body.asOf)));
 const otherInbox=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${otherToken}`).expect(200);assert.ok(!otherInbox.body.data.some((x:{id:string})=>x.id===replyNotice.id));
 for(const path of ['/api/v1/notifications','/api/v1/notifications/unread-count'])await request(app.getHttpServer()).get(path).expect(401);
 await request(app.getHttpServer()).put(`/api/v1/notifications/${replyNotice.id}/read`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(404);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Self reply',parentId:root.body.id}).expect(201);
 await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${featureToken}`).send({body:'Self quote',quotedPostId:root.body.id}).expect(201);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.body.id}/reposts`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);
 assert.equal(await db.notification.count({where:{recipientId:authorId,actorId:authorId}}),0);
 // Source and notification both roll back if the enclosing transaction fails.
 const rollbackId=randomUUID();await assert.rejects(db.$transaction(async tx=>{await tx.post.create({data:{id:rollbackId,authorId:otherId,body:'Rolled back reply',parentId:root.body.id,replyPolicyOwnerId:authorId}});throw new Error('rollback fixture');}));assert.equal(await db.notification.count({where:{postId:rollbackId}}),0);
 await request(app.getHttpServer()).delete(`/api/v1/social/posts/${root.body.id}/reposts`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(await db.notification.count({where:{eventKey:'REPOST:'+otherId+':'+root.body.id}}),0);
 await request(app.getHttpServer()).delete(`/api/v1/social/users/${authorId}/follow`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(await db.notification.count({where:{eventKey:'FOLLOW:'+otherId+':'+authorId}}),0);
 assert.ok(await db.notification.findUnique({where:{eventKey:'QUOTE:'+quote.body.id}}));
 const combined=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Reply and quote same author',parentId:root.body.id,quotedPostId:root.body.id}).expect(201);assert.equal(await db.notification.count({where:{postId:combined.body.id,recipientId:authorId}}),1);assert.equal((await db.notification.findFirstOrThrow({where:{postId:combined.body.id}})).kind,'REPLY');
});
test('notification read state, unread filters and read-all boundaries preserve newer arrivals',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const root=await db.post.create({data:{authorId,body:'Read-state root',replyPolicyOwnerId:authorId}});
 const old=await db.post.create({data:{authorId:otherId,body:'Read-state reply',parentId:root.id,replyPolicyOwnerId:authorId}});
 const notice=await db.notification.findUniqueOrThrow({where:{eventKey:'REPLY:'+old.id}});
 const initial=await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').set('Authorization',`Bearer ${featureToken}`).expect(200);
 const first=await request(app.getHttpServer()).put(`/api/v1/notifications/${notice.id}/read`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);assert.equal(first.body.unreadCount,initial.body.unreadCount-1);
 const readAt=(await db.notification.findUniqueOrThrow({where:{id:notice.id}})).readAt;
 await request(app.getHttpServer()).put(`/api/v1/notifications/${notice.id}/read`).set('Cookie','fpi_session='+featureToken).set('Origin','https://evil.example').send({}).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/notifications/${notice.id}/read`).set('Cookie','fpi_session='+featureToken).send({}).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/notifications/${notice.id}/read`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);assert.equal((await db.notification.findUniqueOrThrow({where:{id:notice.id}})).readAt?.toISOString(),readAt?.toISOString());
 const unread=await request(app.getHttpServer()).get('/api/v1/notifications?filter=unread&limit=50').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(!unread.body.data.some((x:{id:string})=>x.id===notice.id));
 const late=await db.post.create({data:{authorId:otherId,body:'New unread after boundary',parentId:root.id,replyPolicyOwnerId:authorId}});await db.notification.update({where:{eventKey:'REPLY:'+late.id},data:{createdAt:new Date(Date.parse(unread.body.asOf)+100)}});
 const result=await request(app.getHttpServer()).put('/api/v1/notifications/read-all').set('Authorization',`Bearer ${featureToken}`).send({through:unread.body.asOf}).expect(200);assert.equal(result.body.unreadCount,1);assert.equal((await db.notification.findUniqueOrThrow({where:{eventKey:'REPLY:'+late.id}})).readAt,null);
 for(const invalid of [{},{through:'bad'},{through:'2099-01-01T00:00:00.000Z'}])await request(app.getHttpServer()).put('/api/v1/notifications/read-all').set('Authorization',`Bearer ${featureToken}`).send(invalid).expect(400);
 await request(app.getHttpServer()).get('/api/v1/notifications?cursor=broken').set('Authorization',`Bearer ${featureToken}`).expect(400);
 await request(app.getHttpServer()).get('/api/v1/notifications?limit=51').set('Authorization',`Bearer ${featureToken}`).expect(400);
 await request(app.getHttpServer()).get('/api/v1/notifications?filter=other').set('Authorization',`Bearer ${featureToken}`).expect(400);
});
test('notification reads suppress muted or blocked actors, deleted sources and hidden contexts',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const root=await db.post.create({data:{authorId,body:'Safety notification root',replyPolicyOwnerId:authorId}});const reply=await db.post.create({data:{authorId:otherId,body:'Safety notification reply',parentId:root.id,replyPolicyOwnerId:authorId}});const notice=await db.notification.findUniqueOrThrow({where:{eventKey:'REPLY:'+reply.id}});
 const canSee=async()=>{const page=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${featureToken}`).expect(200);return page.body.data.some((x:{id:string})=>x.id===notice.id);};assert.equal(await canSee(),true);
 await request(app.getHttpServer()).put('/api/v1/safety/mutes/'+otherId).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);assert.equal(await canSee(),false);
 await request(app.getHttpServer()).put(`/api/v1/notifications/${notice.id}/read`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(404);
 const suppressed=await db.post.create({data:{authorId:otherId,body:'While muted',parentId:root.id,replyPolicyOwnerId:authorId}});assert.equal(await db.notification.count({where:{postId:suppressed.id}}),0);
 await request(app.getHttpServer()).delete('/api/v1/safety/mutes/'+otherId).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(await canSee(),true);
 for(const [blocker,blocked] of [[otherId,authorId],[authorId,otherId]]){await db.block.create({data:{blockerId:blocker,blockedId:blocked}});assert.equal(await canSee(),false);const blockedPost=await db.post.create({data:{authorId:otherId,body:'While blocked',parentId:root.id,replyPolicyOwnerId:authorId}});assert.equal(await db.notification.count({where:{postId:blockedPost.id}}),0);await db.block.delete({where:{blockerId_blockedId:{blockerId:blocker,blockedId:blocked}}});}
 await db.post.update({where:{id:root.id},data:{status:'HIDDEN'}});assert.equal(await canSee(),false);await db.post.update({where:{id:root.id},data:{status:'PUBLISHED'}});
 await db.post.update({where:{id:reply.id},data:{deletedAt:new Date()}});assert.equal(await canSee(),false);await db.post.update({where:{id:reply.id},data:{deletedAt:null}});
 await db.user.update({where:{id:otherId},data:{status:'SUSPENDED'}});assert.equal(await canSee(),false);await db.user.update({where:{id:otherId},data:{status:'ACTIVE'}});
 const count=await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.ok(count.body.unreadCount>0);
});
test('article repost notifications open the article and disappear when publication is withdrawn',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const id=randomUUID();const payload={title:'Notification article fixture',excerpt:'An article to share',body:'Published notification article',status:'PUBLISHED'};
 const article=await request(app.getHttpServer()).put('/api/v1/editorial/'+id).set('Authorization',`Bearer ${staffToken}`).send(payload).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${article.body.discussionPostId}/reposts`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const notice=await db.notification.findUniqueOrThrow({where:{eventKey:'REPOST:'+otherId+':'+article.body.discussionPostId}});
 const page=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.equal(page.body.data.find((x:{id:string})=>x.id===notice.id).href,'/articles/'+article.body.slug);
 await request(app.getHttpServer()).put('/api/v1/editorial/'+id).set('Authorization',`Bearer ${staffToken}`).send({...payload,status:'DRAFT'}).expect(200);
 const hidden=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.ok(!hidden.body.data.some((x:{id:string})=>x.id===notice.id));
});
test('like notifications notify the author once, sync new activity and disappear on unlike',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const root=await db.post.create({data:{authorId,body:'Live like notification root',replyPolicyOwnerId:authorId}});
 const baseline=await request(app.getHttpServer()).get('/api/v1/notifications/sync').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(baseline.body.newCount,0);assert.ok(baseline.body.cursor);
 for(let i=0;i<2;i++)await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 const item=await db.notification.findUniqueOrThrow({where:{eventKey:'LIKE:'+otherId+':'+root.id}});assert.equal(item.kind,'LIKE');assert.equal(item.recipientId,authorId);assert.equal(await db.notification.count({where:{eventKey:item.eventKey}}),1);
 const sync=await request(app.getHttpServer()).get('/api/v1/notifications/sync?cursor='+baseline.body.cursor).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(sync.body.newCount,1);assert.equal(sync.body.unreadCount,baseline.body.unreadCount+1);
 const repeated=await request(app.getHttpServer()).get('/api/v1/notifications/sync?cursor='+sync.body.cursor).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(repeated.body.newCount,0);
 const list=await request(app.getHttpServer()).get('/api/v1/notifications?limit=50').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(list.body.data.find((x:{id:string})=>x.id===item.id).kind,'LIKE');
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${featureToken}`).send({}).expect(200);assert.equal(await db.notification.count({where:{postId:root.id,actorId:authorId}}),0);
 await request(app.getHttpServer()).delete(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(await db.notification.count({where:{id:item.id}}),0);
 await request(app.getHttpServer()).get('/api/v1/notifications/sync?cursor=invalid').set('Authorization',`Bearer ${featureToken}`).expect(400);
 await request(app.getHttpServer()).get('/api/v1/notifications/sync').expect(401);
 await request(app.getHttpServer()).get('/api/v1/notifications/sync?recipientId='+authorId).set('Authorization',`Bearer ${otherToken}`).expect(400);
});
test('muting and blocking also suppress like alerts and sync counters',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const root=await db.post.create({data:{authorId,body:'Like privacy root',replyPolicyOwnerId:authorId}});
 await db.mute.create({data:{muterId:authorId,mutedId:otherId}});
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);assert.equal(await db.notification.count({where:{postId:root.id}}),0);
 await db.mute.delete({where:{muterId_mutedId:{muterId:authorId,mutedId:otherId}}});await request(app.getHttpServer()).delete(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${otherToken}`).expect(200);
 const before=await request(app.getHttpServer()).get('/api/v1/notifications/sync').set('Authorization',`Bearer ${featureToken}`).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/social/posts/${root.id}/likes`).set('Authorization',`Bearer ${otherToken}`).send({}).expect(200);
 await db.block.create({data:{blockerId:otherId,blockedId:authorId}});
 const blocked=await request(app.getHttpServer()).get('/api/v1/notifications/sync?cursor='+before.body.cursor).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(blocked.body.newCount,0);
 await db.block.delete({where:{blockerId_blockedId:{blockerId:otherId,blockedId:authorId}}});
 await db.post.update({where:{id:root.id},data:{status:'HIDDEN'}});
 const hidden=await request(app.getHttpServer()).get('/api/v1/notifications/sync?cursor='+before.body.cursor).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(hidden.body.newCount,0);
});
test('notification cursor pagination handles tied timestamps without reading items on GET',async()=>{
 const otherId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;const parent=await db.post.create({data:{authorId,body:'Pagination notifications',replyPolicyOwnerId:authorId}});const children=Array.from({length:6},()=>randomUUID());await db.post.createMany({data:children.map(id=>({id,authorId:otherId,body:'Tied notification item',parentId:parent.id,replyPolicyOwnerId:authorId}))});
 await db.notification.updateMany({where:{postId:{in:children}},data:{createdAt:new Date('2090-01-01T00:00:00.000Z')}});
 const first=await request(app.getHttpServer()).get('/api/v1/notifications?limit=3').set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(first.body.data.length,3);assert.ok(first.body.nextCursor);
 const second=await request(app.getHttpServer()).get('/api/v1/notifications?limit=3&cursor='+first.body.nextCursor).set('Authorization',`Bearer ${featureToken}`).expect(200);assert.equal(second.body.data.length,3);assert.equal(new Set([...first.body.data,...second.body.data].map((x:{id:string})=>x.id)).size,6);assert.equal(await db.notification.count({where:{postId:{in:children},readAt:null}}),6);
});
test('notification sync has a session allowance without sharing it with another campus user',async()=>{
 const stored=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}}));const fresh=newToken();await db.session.create({data:{userId:stored.userId,tokenHash:tokenHash(fresh),expiresAt:new Date(Date.now()+3600000)}});
 for(let i=0;i<60;i++)await request(app.getHttpServer()).get('/api/v1/notifications/sync').set('Authorization',`Bearer ${fresh}`).expect(200);
 await request(app.getHttpServer()).get('/api/v1/notifications/sync').set('Authorization',`Bearer ${fresh}`).expect(429);
 await request(app.getHttpServer()).get('/api/v1/notifications/sync').set('Authorization',`Bearer ${otherToken}`).expect(200);
});
test('verification/reset tokens are single-use and password reset revokes sessions',async()=>{
 const verify=newToken();await db.actionToken.create({data:{userId:authorId,purpose:'VERIFY',tokenHash:tokenHash(verify),expiresAt:new Date(Date.now()+3600000)}});
 await request(app.getHttpServer()).post('/api/v1/account/verify-email').send({token:verify}).expect(201);
 await request(app.getHttpServer()).post('/api/v1/account/verify-email').send({token:verify}).expect(400);
 const reset=newToken();await db.actionToken.create({data:{userId:authorId,purpose:'RESET',tokenHash:tokenHash(reset),expiresAt:new Date(Date.now()+3600000)}});
 await request(app.getHttpServer()).post('/api/v1/account/reset-password').send({token:reset,password:'updated secure password 123'}).expect(201);
 await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization',`Bearer ${featureToken}`).expect(401);
 await request(app.getHttpServer()).post('/api/v1/account/reset-password').send({token:reset,password:'another secure password'}).expect(400);
 const expired=newToken();await db.actionToken.create({data:{userId:authorId,purpose:'RESET',tokenHash:tokenHash(expired),expiresAt:new Date(Date.now()-1000)}});
 await request(app.getHttpServer()).post('/api/v1/account/reset-password').send({token:expired,password:'another secure password'}).expect(400);
});
test('custom roles grant only named permissions and removal takes effect immediately',async()=>{
 const key='helper-'+runId;
 await request(app.getHttpServer()).put(`/api/v1/admin/roles/${key}`).set('Authorization',`Bearer ${staffToken}`).send({name:'Limited Helper',permissions:['not-a-permission']}).expect(400);
 const created=await request(app.getHttpServer()).put(`/api/v1/admin/roles/${key}`).set('Authorization',`Bearer ${staffToken}`).send({name:'Limited Helper',permissions:['moderation.manage']}).expect(200);
 const otherId=ids.find(id=>id!==authorId&&id!==staffId)!;
 await request(app.getHttpServer()).put(`/api/v1/admin/users/${otherId}/roles`).set('Authorization',`Bearer ${staffToken}`).send({roleIds:[created.body.id]}).expect(200);
 await request(app.getHttpServer()).get('/api/v1/admin/reports').set('Authorization',`Bearer ${otherToken}`).expect(200);
 await request(app.getHttpServer()).get('/api/v1/admin/users').set('Authorization',`Bearer ${otherToken}`).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/admin/users/${otherId}/roles`).set('Authorization',`Bearer ${staffToken}`).send({roleIds:[]}).expect(200);
 await request(app.getHttpServer()).get('/api/v1/admin/reports').set('Authorization',`Bearer ${otherToken}`).expect(403);
 await db.role.delete({where:{id:created.body.id}});
 process.env.REQUIRE_VERIFIED_EMAIL='true';
 try{await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Unverified should not publish'}).expect(403);}finally{delete process.env.REQUIRE_VERIFIED_EMAIL;}
});

test('discovery fallback, scheduling, staff permissions and sponsor labelling',async()=>{
 await request(app.getHttpServer()).get('/api/v1/admin/discovery').set('Authorization',`Bearer ${otherToken}`).expect(403);
 const settings=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200);assert.ok(Array.isArray(settings.body.topics));assert.equal(settings.body.sponsored,null);
 const id=crypto.randomUUID();const payload={kind:'ANNOUNCEMENT',title:'Test notice',body:'Community update',href:'/about',enabled:true,position:0,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()};
 await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+id).set('Authorization',`Bearer ${staffToken}`).send(payload).expect(200);
 try{
  const current=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200);assert.equal(current.body.announcement.id,id);
  for(const href of ['javascript:alert(1)','//evil.test','/\\evil.test','https://user:pass@example.test'])await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+id).set('Authorization',`Bearer ${staffToken}`).send({...payload,href}).expect(400);
  await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+id).set('Authorization',`Bearer ${staffToken}`).send({...payload,endsAt:payload.startsAt}).expect(400);
  await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+id).set('Authorization',`Bearer ${staffToken}`).send({...payload,kind:'SPONSORED'}).expect(200);
  const sponsor=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200);assert.equal(sponsor.body.sponsored.kind,'SPONSORED');assert.equal(sponsor.body.announcement,null);
  await db.discoveryCard.update({where:{id},data:{endsAt:new Date(Date.now()-1)}});assert.equal((await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200)).body.sponsored,null);
  assert.ok(await db.auditLog.findFirst({where:{action:'discovery.save',targetId:id}}));
 }finally{await db.discoveryCard.delete({where:{id}});}
});
test('trends require three distinct authors, deduplicate tags, and filter muted/hidden content',async()=>{
 const tag='trend'+runId;const users=await Promise.all([1,2,3].map(n=>db.user.create({data:{email:`${tag}${n}@example.test`,username:`${tag}${n}`,displayName:'Trend member',passwordHash:'not-used'},select:{id:true}})));ids.push(...users.map(u=>u.id));
 const posts=[];for(const u of users){const p=await db.post.create({data:{authorId:u.id,body:'#'+tag}});posts.push(p);await db.postToken.createMany({data:[0,1].map(n=>({postId:p.id,kind:'HASHTAG',hashtag:tag,start:n*20,end:n*20+tag.length+1,label:'#'+tag}))});}
 const page=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200);const trend=page.body.trends.find((t:{tag:string})=>t.tag===tag);assert.equal(trend.authors,3);assert.equal(trend.posts,3);assert.equal(page.body.topics.length,0);
 await db.mute.create({data:{muterId:staffId,mutedId:users[0].id}});
 try{const personal=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.equal(personal.body.trends.some((t:{tag:string})=>t.tag===tag),false);}finally{await db.mute.deleteMany({where:{muterId:staffId,mutedId:users[0].id}});}
 await db.post.update({where:{id:posts[0].id},data:{status:'HIDDEN'}});
 const hidden=await request(app.getHttpServer()).get('/api/v1/discovery/sidebar').expect(200);assert.equal(hidden.body.trends.some((t:{tag:string})=>t.tag===tag),false);
});
test('profile pins enforce ownership, hidden pins disappear, follower lists are filtered and private fields stay private',async()=>{
 const own=await db.post.create({data:{authorId:staffId,body:'Pin me'}});
 await request(app.getHttpServer()).put('/api/v1/users/me/pinned-post').set('Authorization',`Bearer ${otherToken}`).send({postId:own.id}).expect(403);
 await request(app.getHttpServer()).put('/api/v1/users/me/pinned-post').set('Authorization',`Bearer ${staffToken}`).send({postId:own.id}).expect(200);
 const staff=await db.user.findUniqueOrThrow({where:{id:staffId}});
 await db.user.update({where:{id:staffId},data:{campusIdentity:'ALUMNUS',phoneNumber:'+2348000000001',dateOfBirth:new Date('2000-01-01')}});
 const profile=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username).expect(200);assert.equal(profile.body.pinnedPost.id,own.id);assert.equal(profile.body.campusIdentity,'ALUMNUS');assert.equal(profile.body.phoneNumber,undefined);assert.equal(profile.body.dateOfBirth,undefined);
 const me=await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization',`Bearer ${staffToken}`).expect(200);assert.equal(me.body.campusIdentity,'ALUMNUS');
 await db.post.update({where:{id:own.id},data:{status:'HIDDEN'}});assert.equal((await request(app.getHttpServer()).get('/api/v1/users/'+staff.username).expect(200)).body.pinnedPost,null);
 await request(app.getHttpServer()).put('/api/v1/users/me/pinned-post').set('Authorization',`Bearer ${staffToken}`).send({postId:null}).expect(200);
 const follower=ids.find(id=>id!==authorId&&id!==staffId)!;await db.follow.upsert({where:{followerId_followingId:{followerId:follower,followingId:staffId}},create:{followerId:follower,followingId:staffId},update:{}});
 const people=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/followers?limit=1').set('Authorization','Bearer '+staffToken).expect(200);assert.ok(people.body.data.length);assert.equal(people.body.data[0].email,undefined);
 const reply=await db.post.create({data:{authorId:staffId,parentId:own.id,body:'Profile reply'}});
 const replies=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/posts?profileTab=replies').set('Authorization','Bearer '+staffToken).expect(200);assert.ok(replies.body.data.some((p:{id:string})=>p.id===reply.id));assert.ok(replies.body.data.every((p:{parentId:string|null})=>p.parentId!==null));
 await db.post.delete({where:{id:reply.id}});await db.post.delete({where:{id:own.id}});
});

let sportsId:string;let sportsMatchId:string;let sportsHome:string;let sportsAway:string;let sportsOther:string;let sportsReporterId:string;
const sportsCompetitionPayload={name:'Campus Cup',season:'2026/2027',description:'Campus football coverage',format:'GROUP_KNOCKOUT',published:false,winPoints:3,drawPoints:1,lossPoints:0};
const scorePayload=(revision:number,more:Record<string,unknown>={})=>({revision,status:'LIVE',homeScore:1,awayScore:0,homePenalties:null,awayPenalties:null,minute:12,confirmed:false,note:'Goal for the home side',...more});
test('sports roles protect the desk and organisers can prepare private teams/fixtures',async()=>{
 await request(app.getHttpServer()).get('/api/v1/sports-desk').expect(401);
 await request(app.getHttpServer()).get('/api/v1/sports-desk').set('Authorization',`Bearer ${otherToken}`).expect(403);
 const c=await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions').set('Authorization',`Bearer ${staffToken}`).send(sportsCompetitionPayload).expect(201);sportsId=c.body.id;
 await request(app.getHttpServer()).get('/api/v1/sports/competitions/'+sportsId).expect(404);
 const teams=[];for(const [name,groupName] of [['Computer Engineering','A'],['Accountancy','A'],['Science','B']]){const t=await request(app.getHttpServer()).post(`/api/v1/sports-desk/competitions/${sportsId}/teams`).set('Authorization',`Bearer ${staffToken}`).send({name,groupName}).expect(201);teams.push(t.body.id);}
 [sportsHome,sportsAway,sportsOther]=teams;
 sportsReporterId=(await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}})).userId;
 const role=await db.role.findUniqueOrThrow({where:{key:'sports-reporter'}});await db.userRole.create({data:{userId:sportsReporterId,roleId:role.id}});
 await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions').set('Authorization',`Bearer ${otherToken}`).send(sportsCompetitionPayload).expect(403);
 const fixture={homeId:sportsHome,awayId:sportsAway,stage:'GROUP',kickoffAt:new Date().toISOString(),venue:'Campus field',reporterId:sportsReporterId,featured:true,note:'Fixture announced'};
 await request(app.getHttpServer()).post(`/api/v1/sports-desk/competitions/${sportsId}/matches`).set('Authorization',`Bearer ${staffToken}`).send({...fixture,awayId:sportsHome}).expect(400);
 await request(app.getHttpServer()).post(`/api/v1/sports-desk/competitions/${sportsId}/matches`).set('Authorization',`Bearer ${staffToken}`).send({...fixture,awayId:sportsOther}).expect(400);
 const m=await request(app.getHttpServer()).post(`/api/v1/sports-desk/competitions/${sportsId}/matches`).set('Authorization',`Bearer ${staffToken}`).send(fixture).expect(201);sportsMatchId=m.body.id;
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${staffToken}`).send(scorePayload(1)).expect(400);
 await request(app.getHttpServer()).get(`/api/v1/sports/matches/${sportsMatchId}`).expect(404);
 await request(app.getHttpServer()).put('/api/v1/sports-desk/competitions/'+sportsId).set('Authorization',`Bearer ${staffToken}`).send({...sportsCompetitionPayload,published:true,revision:0}).expect(200);
 const featured=await request(app.getHttpServer()).get('/api/v1/sports/featured').expect(200);assert.equal(featured.body.id,sportsMatchId);assert.equal(featured.body.reporterId,undefined);
});
test('assigned scorekeepers update totals, cannot confirm and stale revisions cannot overwrite scores',async()=>{
 const match=await request(app.getHttpServer()).get('/api/v1/sports/matches/'+sportsMatchId).set('Authorization',`Bearer ${otherToken}`).expect(200);assert.equal(match.body.canReport,true);assert.equal(match.body.canManage,false);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(1,{homeScore:-1})).expect(400);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(1,{status:'FULL_TIME',confirmed:true})).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(1)).expect(200);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(1,{homeScore:9})).expect(409);
 const latest=await request(app.getHttpServer()).get('/api/v1/sports/matches/'+sportsMatchId).expect(200);assert.equal(latest.body.homeScore,1);assert.equal(latest.body.revision,2);assert.equal(latest.body.canReport,false);
 const h=await request(app.getHttpServer()).get(`/api/v1/sports/matches/${sportsMatchId}/updates`).expect(200);assert.equal(h.body.data[0].reporter.id,sportsReporterId);assert.equal(h.body.data[0].current.homeScore,1);assert.equal(h.body.data[0].previous,undefined);assert.equal(h.body.data[0].current.reporterId,undefined);
});
test('confirmed results drive tables; authorised corrections recalculate points and preserve update history',async()=>{
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(2,{status:'FULL_TIME',minute:90})).expect(200);
 let c=await request(app.getHttpServer()).get('/api/v1/sports/competitions/'+sportsId).expect(200);assert.equal(c.body.standings[0].rows.find((t:{id:string})=>t.id===sportsHome).played,0);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${staffToken}`).send(scorePayload(3,{status:'FULL_TIME',minute:90,confirmed:true,note:'Result checked with the referee'})).expect(200);
 c=await request(app.getHttpServer()).get('/api/v1/sports/competitions/'+sportsId).expect(200);assert.equal(c.body.standings[0].rows.find((t:{id:string})=>t.id===sportsHome).points,3);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(4,{status:'FULL_TIME',homeScore:5})).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${sportsMatchId}/score`).set('Authorization',`Bearer ${staffToken}`).send(scorePayload(4,{status:'FULL_TIME',homeScore:0,awayScore:0,minute:90,confirmed:true,note:'Correction: referee confirmed a goalless draw'})).expect(200);
 c=await request(app.getHttpServer()).get('/api/v1/sports/competitions/'+sportsId).expect(200);assert.equal(c.body.standings[0].rows.find((t:{id:string})=>t.id===sportsHome).points,1);assert.equal(c.body.standings[0].rows.find((t:{id:string})=>t.id===sportsHome).gf,0);
 const h=await request(app.getHttpServer()).get(`/api/v1/sports/matches/${sportsMatchId}/updates?before=5`).expect(200);assert.equal(h.body.data[0].kind,'CONFIRMATION');const audit=await db.sportsUpdate.findUniqueOrThrow({where:{matchId_revision:{matchId:sportsMatchId,revision:5}}});assert.equal((audit.previous as {homeScore:number}).homeScore,1);
 await request(app.getHttpServer()).put('/api/v1/sports-desk/competitions/'+sportsId).set('Authorization',`Bearer ${staffToken}`).send({...sportsCompetitionPayload,published:true,revision:1,winPoints:4}).expect(400);
});
test('match assignments and current permissions are enforced; knockout results validate penalties',async()=>{
 const fixture={homeId:sportsHome,awayId:sportsOther,stage:'FINAL',kickoffAt:new Date().toISOString(),venue:'Campus field',reporterId:null,featured:false,note:'Final scheduled'};
 const m=await request(app.getHttpServer()).post(`/api/v1/sports-desk/competitions/${sportsId}/matches`).set('Authorization',`Bearer ${staffToken}`).send(fixture).expect(201);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${m.body.id}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(1)).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${m.body.id}/score`).set('Authorization',`Bearer ${staffToken}`).send(scorePayload(1,{status:'FULL_TIME',homeScore:1,awayScore:1})).expect(400);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${m.body.id}/score`).set('Authorization',`Bearer ${staffToken}`).send(scorePayload(1,{status:'FULL_TIME',homeScore:1,awayScore:1,homePenalties:4,awayPenalties:3,confirmed:true})).expect(200);
 await db.userRole.deleteMany({where:{userId:sportsReporterId,role:{key:'sports-reporter'}}});
 await request(app.getHttpServer()).get('/api/v1/sports-desk').set('Authorization',`Bearer ${otherToken}`).expect(403);
 await request(app.getHttpServer()).put(`/api/v1/sports/matches/${m.body.id}/score`).set('Authorization',`Bearer ${otherToken}`).send(scorePayload(2)).expect(403);
});
test('match-linked posts and replies preserve context, filter correctly and hide with unpublished competitions',async()=>{
 const post=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${staffToken}`).send({body:'Discussing the cup final',sportsMatchId:sportsMatchId}).expect(201);
 const reply=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization',`Bearer ${otherToken}`).send({body:'Great atmosphere',parentId:post.body.id,sportsCompetitionId:crypto.randomUUID()}).expect(201);
 const stored=await db.post.findUniqueOrThrow({where:{id:reply.body.id}});assert.equal(stored.sportsCompetitionId,sportsId);assert.equal(stored.sportsMatchId,sportsMatchId);
 const feed=await request(app.getHttpServer()).get('/api/v1/posts?sportsMatchId='+sportsMatchId).expect(200);assert.ok(feed.body.data.some((p:{id:string})=>p.id===post.body.id));assert.equal(feed.body.data.find((p:{id:string})=>p.id===post.body.id).sportsCompetition.id,sportsId);
 await db.sportsCompetition.update({where:{id:sportsId},data:{published:false}});
 await request(app.getHttpServer()).get('/api/v1/posts/'+post.body.id).expect(404);await request(app.getHttpServer()).get('/api/v1/sports/matches/'+sportsMatchId).expect(404);assert.equal((await request(app.getHttpServer()).get('/api/v1/posts?sportsMatchId='+sportsMatchId).expect(200)).body.data.length,0);
 await db.sportsCompetition.update({where:{id:sportsId},data:{published:true}});
});

test('account entry accepts normalized usernames and suggests available, non-reserved handles',async()=>{
 const u=await db.user.findUniqueOrThrow({where:{id:staffId}});
 await request(app.getHttpServer()).post('/api/v1/auth/login').send({identifier:' @'+u.username.toUpperCase()+' ',password:'staff fixture password 123'}).expect(200);
 await request(app.getHttpServer()).post('/api/v1/auth/login').send({identifier:u.email,password:'wrong password'}).expect(401);
 await request(app.getHttpServer()).post('/api/v1/auth/login').send({password:'no identifier'}).expect(400);
 const suggestions=await request(app.getHttpServer()).get('/api/v1/auth/username-suggestions?name=Mayomi%20Odewaye').expect(200);assert.ok(suggestions.body.length);for(const name of suggestions.body){assert.match(name,/^[a-z0-9_]{3,30}$/);assert.equal(await db.user.count({where:{username:name}}),0);}
 const reserved=await request(app.getHttpServer()).get('/api/v1/auth/username-availability?username=administrator').expect(200);assert.equal(reserved.body.available,false);
});
test('new posts and replies enforce 280 code points while historical long posts remain readable',async()=>{
 const headers={Authorization:'Bearer '+staffToken};const r=await request(app.getHttpServer()).post('/api/v1/posts').set(headers).send({body:'😀'.repeat(280)}).expect(201);assert.equal(Array.from(r.body.body).length,280);
 await request(app.getHttpServer()).post('/api/v1/posts').set(headers).send({body:'😀'.repeat(281)}).expect(400);
 await request(app.getHttpServer()).post('/api/v1/posts').set(headers).send({body:'a'.repeat(281),parentId:r.body.id}).expect(400);
 const old=await db.post.create({data:{authorId:staffId,body:'a'.repeat(1000)}});const read=await request(app.getHttpServer()).get('/api/v1/posts/'+old.id).expect(200);assert.equal(read.body.body.length,1000);
});
let entryThreadId:string;
test('threads publish atomically, keep ordered parent links, and are idempotent across retries',async()=>{
 const requestId=crypto.randomUUID(),payload={body:'Entry thread root',continuations:['Second author post','Third author post'],requestId};
 const root=await request(app.getHttpServer()).post('/api/v1/posts/thread').set('Authorization','Bearer '+staffToken).send(payload).expect(201);entryThreadId=root.body.id;assert.equal(root.body.threadCount,3);
 const duplicate=await request(app.getHttpServer()).post('/api/v1/posts/thread').set('Authorization','Bearer '+staffToken).send(payload).expect(201);assert.equal(duplicate.body.id,entryThreadId);
 let thread=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/thread?limit=1').set('Authorization','Bearer '+staffToken).expect(200);assert.equal(thread.body.root.id,entryThreadId);assert.equal(thread.body.data[0].body,'Second author post');assert.ok(thread.body.nextCursor);
 const second=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/thread?limit=1&cursor='+thread.body.nextCursor).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(second.body.data[0].body,'Third author post');assert.equal(second.body.data[0].parentId,thread.body.data[0].id);assert.ok(new Date(second.body.data[0].createdAt)>new Date(thread.body.data[0].createdAt));assert.equal(second.body.nextCursor,null);
 const before=await db.post.count({where:{authorId:staffId}});await request(app.getHttpServer()).post('/api/v1/posts/thread').set('Authorization','Bearer '+staffToken).send({...payload,requestId:crypto.randomUUID(),continuations:['Fine','x'.repeat(281)]}).expect(400);assert.equal(await db.post.count({where:{authorId:staffId}}),before);
 await request(app.getHttpServer()).post('/api/v1/posts/thread').set('Authorization','Bearer '+staffToken).send({...payload,requestId:crypto.randomUUID(),parentId:entryThreadId}).expect(400);
});
test('self replies continue author threads and original-author replies lead paginated conversation branches',async()=>{
 const self=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization','Bearer '+staffToken).send({body:'An author continuation',parentId:entryThreadId}).expect(201);assert.equal(self.body.isThreadContinuation,true);assert.equal(self.body.threadRootId,entryThreadId);
 const other=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization','Bearer '+otherToken).send({body:'A separate reader question',parentId:entryThreadId}).expect(201);assert.equal(other.body.isThreadContinuation,false);assert.equal(other.body.authorReply,false);
 const answer=await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization','Bearer '+staffToken).send({body:'The author answers the reader',parentId:other.body.id}).expect(201);assert.equal(answer.body.authorReply,true);assert.equal(answer.body.isThreadContinuation,false);
 const first=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/replies?limit=1').set('Authorization','Bearer '+staffToken).expect(200);assert.equal(first.body.data[0].authorReply,true);let cursor=first.body.nextCursor;const found=new Set<string>([first.body.data[0].id]);for(let i=0;cursor&&i<5;i++){const page=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/replies?limit=1&cursor='+cursor).set('Authorization','Bearer '+staffToken).expect(200);for(const p of page.body.data){assert.ok(!found.has(p.id));found.add(p.id);}cursor=page.body.nextCursor;}assert.ok(found.has(other.body.id));assert.equal(cursor,null);
 const branches=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/replies?branches=true&limit=1').set('Authorization','Bearer '+staffToken).expect(200);assert.equal(branches.body.data[0].id,other.body.id);assert.equal(branches.body.nextCursor,null);
 const thread=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/thread').expect(200);assert.ok(thread.body.data.some((p:{id:string})=>p.id===self.body.id));assert.ok(!thread.body.data.some((p:{id:string})=>p.id===answer.body.id));
});
test('guest list previews cap results, require login for pagination and keep individual public posts readable',async()=>{
 const staff=await db.user.findUniqueOrThrow({where:{id:staffId}});for(let i=0;i<6;i++)await db.post.create({data:{authorId:staffId,body:'Guest preview '+i}});
 const list=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/posts?limit=20').expect(200);assert.equal(list.body.data.length,5);assert.equal(list.body.requiresLogin,true);assert.equal(list.body.nextCursor,null);
 const attempt=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/posts?cursor='+Buffer.from(JSON.stringify({id:entryThreadId,at:new Date().toISOString()})).toString('base64url')).expect(200);assert.equal(attempt.body.data.length,0);assert.equal(attempt.body.requiresLogin,true);
 const replies=await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/posts?profileTab=replies').expect(200);assert.equal(replies.body.requiresLogin,true);assert.equal(replies.body.data.length,0);
 await request(app.getHttpServer()).get('/api/v1/users/'+staff.username+'/followers').expect(403);await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId).expect(200);
});
test('relevant people are contextual and suppress blocked and muted accounts',async()=>{
 let people=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/people').set('Authorization','Bearer '+otherToken).expect(200);assert.ok(people.body.some((u:{id:string})=>u.id===staffId));assert.equal(people.body[0].email,undefined);
 const viewer=await db.session.findUniqueOrThrow({where:{tokenHash:tokenHash(otherToken)}});await db.mute.upsert({where:{muterId_mutedId:{muterId:viewer.userId,mutedId:staffId}},create:{muterId:viewer.userId,mutedId:staffId},update:{}});try{people=await request(app.getHttpServer()).get('/api/v1/posts/'+entryThreadId+'/people').set('Authorization','Bearer '+otherToken).expect(200);assert.ok(!people.body.some((u:{id:string})=>u.id===staffId));}finally{await db.mute.delete({where:{muterId_mutedId:{muterId:viewer.userId,mutedId:staffId}}});}
});

let searchNeedle:string;let searchExact:string;const searchUsers:string[]=[];
test('people search ranks exact usernames first and paginates every relevance bucket without duplicates',async()=>{
 searchNeedle='find'+Date.now();searchExact=searchNeedle;
 for(const [username,displayName,bio]of [[searchExact,'Exact member','Public search bio'],[searchNeedle+'_a','Prefix member',''],[searchNeedle+'_b','Prefix two',''],['a'+searchNeedle,'Name '+searchNeedle,''],['z'+searchNeedle,'Bio match',searchNeedle],['b'+searchNeedle,'Other '+searchNeedle,'']]){const u=await db.user.create({data:{username,email:username+'@example.test',displayName,bio,passwordHash:'not-a-login-fixture'}});ids.push(u.id);searchUsers.push(u.id);}
 let cursor:string|undefined;const found:string[]=[];for(let i=0;i<6;i++){const result=await request(app.getHttpServer()).get('/api/v1/search').query({q:searchNeedle,type:'people',limit:1,...cursor?{cursor}:{}}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(result.body.data.length,1);const p=result.body.data[0];assert.equal(p.email,undefined);assert.equal(p.passwordHash,undefined);assert.equal(p.phoneNumber,undefined);if(i===0)assert.equal(p.username,searchExact);if(i===1)assert.equal(p.username,searchNeedle+'_a');found.push(p.id);cursor=result.body.nextCursor??undefined;}
 assert.equal(new Set(found).size,6);assert.equal(cursor,undefined);
 const at=await request(app.getHttpServer()).get('/api/v1/search').query({q:'@'+searchExact.toUpperCase(),type:'people'}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(at.body.data[0].username,searchExact);
});
test('people search hides suspended, muted and bilaterally blocked accounts and reports follow state',async()=>{
 await db.follow.upsert({where:{followerId_followingId:{followerId:staffId,followingId:searchUsers[0]}},create:{followerId:staffId,followingId:searchUsers[0]},update:{}});await db.mute.create({data:{muterId:staffId,mutedId:searchUsers[1]}});await db.block.create({data:{blockerId:searchUsers[2],blockedId:staffId}});await db.user.update({where:{id:searchUsers[3]},data:{status:'SUSPENDED'}});
 const result=await request(app.getHttpServer()).get('/api/v1/search').query({q:searchNeedle,type:'people'}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(result.body.data.find((p:{id:string})=>p.id===searchUsers[0]).isFollowing,true);for(const id of searchUsers.slice(1,4))assert.ok(!result.body.data.some((p:{id:string})=>p.id===id));
 await db.mute.delete({where:{muterId_mutedId:{muterId:staffId,mutedId:searchUsers[1]}}});await db.block.delete({where:{blockerId_blockedId:{blockerId:searchUsers[2],blockedId:staffId}}});await db.user.update({where:{id:searchUsers[3]},data:{status:'ACTIVE'}});
});
test('article search returns only visible published stories, paginates tied times and searches titles/excerpts',async()=>{
 const at=new Date('2031-01-01T00:00:00Z');const published:string[]=[];
 for(let i=0;i<4;i++){const post=await db.post.create({data:{authorId:staffId,body:'Search story '+i}});const a=await db.article.create({data:{authorId:staffId,discussionPostId:post.id,slug:searchNeedle+'-'+i,title:i===1?'An unrelated title':searchNeedle+' story '+i,excerpt:i===1?'A guide about '+searchNeedle:'Campus article summary',body:'Private article body text',status:i===3?'DRAFT':'PUBLISHED',publishedAt:at}});if(i<3)published.push(a.id);}
 const first=await request(app.getHttpServer()).get('/api/v1/search').query({type:'articles',q:searchNeedle,limit:2}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(first.body.data.length,2);assert.ok(first.body.nextCursor);assert.equal(first.body.data[0].body,undefined);assert.equal(first.body.data[0].author.email,undefined);
 const next=await request(app.getHttpServer()).get('/api/v1/search').query({type:'articles',q:searchNeedle,limit:2,cursor:first.body.nextCursor}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(new Set([...first.body.data,...next.body.data].map((a:{id:string})=>a.id)).size,3);assert.equal(next.body.nextCursor,null);
 const article=await db.article.findUniqueOrThrow({where:{id:published[0]}});await db.post.update({where:{id:article.discussionPostId!},data:{status:'HIDDEN'}});const hidden=await request(app.getHttpServer()).get('/api/v1/search').query({type:'articles',q:searchNeedle}).expect(200);assert.ok(!hidden.body.data.some((a:{id:string})=>a.id===article.id));
});
test('community search filters inactive records and preserves equal-name pagination boundaries',async()=>{
 const communities:string[]=[];try{for(let i=0;i<4;i++){const c=await db.community.create({data:{name:searchNeedle+' Community',slug:searchNeedle+'-community-'+i,description:'Accommodation and campus connections',kind:'INTEREST',active:i!==3}});communities.push(c.id);}
 const first=await request(app.getHttpServer()).get('/api/v1/search').query({type:'communities',q:searchNeedle,limit:2}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(first.body.data.length,2);const second=await request(app.getHttpServer()).get('/api/v1/search').query({type:'communities',q:searchNeedle,limit:2,cursor:first.body.nextCursor}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(new Set([...first.body.data,...second.body.data].map((c:{id:string})=>c.id)).size,3);assert.equal(second.body.nextCursor,null);
 }finally{await db.community.deleteMany({where:{id:{in:communities}}});}
});
test('search validates scope-bound cursors, caps guest previews and treats empty searches safely',async()=>{
 const guest=await request(app.getHttpServer()).get('/api/v1/search').query({type:'people',q:searchNeedle,limit:30}).expect(200);assert.equal(guest.body.data.length,5);assert.equal(guest.body.requiresLogin,true);assert.equal(guest.body.nextCursor,null);
 const signed=await request(app.getHttpServer()).get('/api/v1/search').query({type:'people',q:searchNeedle,limit:1}).set('Authorization','Bearer '+staffToken).expect(200);
 const gate=await request(app.getHttpServer()).get('/api/v1/search').query({type:'people',q:searchNeedle,cursor:signed.body.nextCursor}).expect(200);assert.equal(gate.body.data.length,0);assert.equal(gate.body.requiresLogin,true);
 await request(app.getHttpServer()).get('/api/v1/search').query({type:'people',q:'different',cursor:signed.body.nextCursor}).expect(400);await request(app.getHttpServer()).get('/api/v1/search').query({type:'articles',q:searchNeedle,cursor:signed.body.nextCursor}).expect(400);
 await request(app.getHttpServer()).get('/api/v1/search?type=people&cursor=broken').expect(400);await request(app.getHttpServer()).get('/api/v1/search?type=unknown&q=test').expect(400);await request(app.getHttpServer()).get('/api/v1/search').query({type:'people',q:'x'.repeat(81)}).expect(400);
 const empty=await request(app.getHttpServer()).get('/api/v1/search?type=people&q=%20').expect(200);assert.deepEqual(empty.body.data,[]);
});
test('post search image filtering includes uploaded attachments and rejects invalid filter values',async()=>{
 const media=await db.media.create({data:{ownerId:staffId,kind:'POST',bytes:12,width:1,height:1}});
 const pic=await db.post.create({data:{authorId:staffId,body:searchNeedle+' photo post',imageMediaId:media.id}});await db.post.create({data:{authorId:staffId,body:searchNeedle+' text post'}});
 const images=await request(app.getHttpServer()).get('/api/v1/posts').query({q:searchNeedle,mediaOnly:'true'}).set('Authorization','Bearer '+staffToken).expect(200);assert.equal(images.body.data.length,1);assert.equal(images.body.data[0].id,pic.id);await request(app.getHttpServer()).get('/api/v1/posts?mediaOnly=anything').expect(400);
});

test('conversation ancestors preserve real parent order and nested quotes include the visible inner original',async()=>{
 const create=async(body:string,extra:object={},access=staffToken)=>(await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization','Bearer '+access).send({body,...extra}).expect(201)).body;
 const root=await create('An ancestry root');const sibling=await create('Separate self continuation',{parentId:root.id});const reader=await create('A reader question',{parentId:root.id},otherToken);const answer=await create('The exact answer',{parentId:reader.id});const another=await create('A second root reply',{parentId:root.id});
 const path=await request(app.getHttpServer()).get('/api/v1/posts/'+answer.id+'/ancestors').set('Authorization','Bearer '+staffToken).expect(200);assert.deepEqual(path.body.data.map((p:{id:string})=>p.id),[root.id,reader.id]);assert.ok(!path.body.data.some((p:{id:string})=>[sibling.id,another.id].includes(p.id)));
 const original=await create('Original nested quote');const quote=await create('First quote',{quotedPostId:original.id},otherToken);const outer=await create('A quote of that quote',{quotedPostId:quote.id});assert.equal(outer.quotedPost.id,quote.id);assert.equal(outer.quotedPost.quotedPost.id,original.id);
 await db.post.update({where:{id:original.id},data:{status:'HIDDEN'}});const hidden=await request(app.getHttpServer()).get('/api/v1/posts/'+outer.id).expect(200);assert.equal(hidden.body.quotedPost.quotedPost,null);
 await db.post.update({where:{id:reader.id},data:{status:'HIDDEN'}});const unavailable=await request(app.getHttpServer()).get('/api/v1/posts/'+answer.id+'/ancestors').set('Authorization','Bearer '+staffToken).expect(200);assert.equal(unavailable.body.unavailable,true);assert.equal(unavailable.body.data.length,0);
});
let dmA:string,dmB:string,dmC:string,dmAToken:string,dmBToken:string,dmCToken:string,dmChat:string,dmMessage:string;
const dmAuth=(token:string)=>({Authorization:'Bearer '+token});
test('message requests are private, permit one initial message and require recipient acceptance',async()=>{
 const created=[];for(const suffix of ['dma','dmb','dmc']){const user=await db.user.create({data:{username:runId+suffix,email:runId+suffix+'@example.test',displayName:suffix,passwordHash:await hashPassword('chat fixture password 123'),emailVerifiedAt:new Date(),roles:{create:{role:{connect:{key:'member'}}}}}});ids.push(user.id);const token=newToken();await db.session.create({data:{userId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});created.push({id:user.id,token,username:user.username});}
 [dmA,dmB,dmC]=created.map(x=>x.id);[dmAToken,dmBToken,dmCToken]=created.map(x=>x.token);
 const requestId=crypto.randomUUID();const start=await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmAToken)).send({username:created[1].username,body:'Hello, may we talk?',requestId}).expect(201);dmChat=start.body.id;
 const retry=await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmAToken)).send({username:created[1].username,body:'Hello, may we talk?',requestId}).expect(201);assert.equal(retry.body.id,dmChat);assert.equal(await db.chatMessage.count({where:{conversationId:dmChat}}),1);
 const inbox=await request(app.getHttpServer()).get('/api/v1/messages?folder=requests').set(dmAuth(dmBToken)).expect(200);assert.equal(inbox.body.data[0].id,dmChat);assert.equal(inbox.body.data[0].other.email,undefined);assert.equal(inbox.body.data[0].other.passwordHash,undefined);
 const counts=await request(app.getHttpServer()).get('/api/v1/messages/count').set(dmAuth(dmBToken)).expect(200);assert.equal(counts.body.requestCount,1);assert.equal(counts.body.unreadCount,0);
 for(const token of [dmCToken,staffToken]){await request(app.getHttpServer()).get('/api/v1/messages/'+dmChat).set(dmAuth(token)).expect(404);await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/request/accept').set(dmAuth(token)).expect(404);}
 await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmAToken)).send({body:'Another message',requestId:crypto.randomUUID()}).expect(403);await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmBToken)).send({body:'Not accepted yet',requestId:crypto.randomUUID()}).expect(403);
 await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/request/accept').set(dmAuth(dmAToken)).expect(404);await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/request/accept').set(dmAuth(dmBToken)).expect(200);
});
test('accepted messages are idempotent, validate limits and retain unread boundaries without reordering chats',async()=>{
 const requestId=crypto.randomUUID();const first=await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmBToken)).send({body:'First response',requestId}).expect(201);dmMessage=first.body.id;const retry=await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmBToken)).send({body:'First response',requestId}).expect(201);assert.equal(retry.body.id,dmMessage);
 const second=await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmBToken)).send({body:'Second response',requestId:crypto.randomUUID()}).expect(201);
 await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmAToken)).send({body:'x'.repeat(2001),requestId:crypto.randomUUID()}).expect(400);await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmCToken)).send({body:'Intrusion',requestId:crypto.randomUUID()}).expect(404);
 const old=await db.chatConversation.findUniqueOrThrow({where:{id:dmChat}});await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/read').set(dmAuth(dmAToken)).send({messageId:dmMessage}).expect(200);const after=await db.chatConversation.findUniqueOrThrow({where:{id:dmChat}});assert.equal(after.updatedAt.toISOString(),old.updatedAt.toISOString());assert.equal((await request(app.getHttpServer()).get('/api/v1/messages/count').set(dmAuth(dmAToken)).expect(200)).body.unreadCount,1);
 await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/read').set(dmAuth(dmCToken)).send({messageId:second.body.id}).expect(404);await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/read').set(dmAuth(dmAToken)).send({messageId:second.body.id}).expect(200);assert.equal((await request(app.getHttpServer()).get('/api/v1/messages/count').set(dmAuth(dmAToken)).expect(200)).body.unreadCount,0);
 await request(app.getHttpServer()).put('/api/v1/messages/'+dmChat+'/read').set(dmAuth(dmAToken)).send({messageId:dmMessage}).expect(200);assert.equal((await db.chatConversation.findUniqueOrThrow({where:{id:dmChat}}))[dmA===old.lowId?'lowReadId':'highReadId'],second.body.id);
 const page=await request(app.getHttpServer()).get('/api/v1/messages/'+dmChat+'?limit=2').set(dmAuth(dmAToken)).expect(200);assert.equal(page.body.data.length,2);assert.ok(page.body.nextCursor);const next=await request(app.getHttpServer()).get('/api/v1/messages/'+dmChat+'?limit=2&cursor='+page.body.nextCursor).set(dmAuth(dmAToken)).expect(200);assert.equal(next.body.data.length,1);assert.equal(new Set([...page.body.data,...next.body.data].map((m:{id:string})=>m.id)).size,3);
});
test('message privacy, declined requests and bilateral blocks prevent unwanted contact',async()=>{
 const b=await db.user.findUniqueOrThrow({where:{id:dmB}}),c=await db.user.findUniqueOrThrow({where:{id:dmC}});
 await request(app.getHttpServer()).put('/api/v1/messages/settings').set(dmAuth(dmBToken)).send({policy:'FOLLOWING'}).expect(200);await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmCToken)).send({username:b.username,body:'Restricted',requestId:crypto.randomUUID()}).expect(403);
 await db.follow.create({data:{followerId:dmB,followingId:dmC}});const accepted=await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmCToken)).send({username:b.username,body:'Known contact',requestId:crypto.randomUUID()}).expect(201);assert.ok((await db.chatConversation.findUniqueOrThrow({where:{id:accepted.body.id}})).acceptedAt);
 await request(app.getHttpServer()).put('/api/v1/messages/settings').set(dmAuth(dmBToken)).send({policy:'NOBODY'}).expect(200);await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(staffToken)).send({username:b.username,body:'Not allowed',requestId:crypto.randomUUID()}).expect(403);
 const pending=await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmAToken)).send({username:c.username,body:'A request',requestId:crypto.randomUUID()}).expect(201);await request(app.getHttpServer()).put('/api/v1/messages/'+pending.body.id+'/request/decline').set(dmAuth(dmCToken)).expect(200);await request(app.getHttpServer()).get('/api/v1/messages/'+pending.body.id).set(dmAuth(dmAToken)).expect(404);await request(app.getHttpServer()).post('/api/v1/messages/start').set(dmAuth(dmAToken)).send({username:c.username,body:'Again',requestId:crypto.randomUUID()}).expect(403);
 await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+dmA).set(dmAuth(dmBToken)).expect(200);await request(app.getHttpServer()).get('/api/v1/messages/'+dmChat).set(dmAuth(dmAToken)).expect(404);await request(app.getHttpServer()).post('/api/v1/messages/'+dmChat+'/send').set(dmAuth(dmBToken)).send({body:'Cannot bypass the block',requestId:crypto.randomUUID()}).expect(404);
});
let messageReportId:string;
test('only participants can report messages and moderators see reported evidence rather than arbitrary conversations',async()=>{
 const report=await request(app.getHttpServer()).post('/api/v1/messages/report/'+dmMessage).set(dmAuth(dmAToken)).send({reason:'SCAM',details:'Suspicious payment request'}).expect(201);messageReportId=report.body.id;
 const retry=await request(app.getHttpServer()).post('/api/v1/messages/report/'+dmMessage).set(dmAuth(dmAToken)).send({reason:'SCAM'}).expect(201);assert.equal(retry.body.id,messageReportId);await request(app.getHttpServer()).post('/api/v1/messages/report/'+dmMessage).set(dmAuth(dmCToken)).send({reason:'SCAM'}).expect(404);await request(app.getHttpServer()).get('/api/v1/admin/message-reports').set(dmAuth(dmAToken)).expect(403);
 const reports=await request(app.getHttpServer()).get('/api/v1/admin/message-reports').set(dmAuth(staffToken)).expect(200);assert.equal(reports.body.find((r:{id:string})=>r.id===messageReportId).snapshot,'First response');assert.equal(reports.body.find((r:{id:string})=>r.id===messageReportId).reporter.email,undefined);await request(app.getHttpServer()).get('/api/v1/messages/'+dmChat).set(dmAuth(staffToken)).expect(404);
 await request(app.getHttpServer()).put('/api/v1/admin/message-reports/'+messageReportId).set(dmAuth(staffToken)).send({status:'RESOLVED',note:'Reviewed the reported evidence'}).expect(200);assert.ok(await db.auditLog.findFirst({where:{targetId:messageReportId,action:'messages.report.review'}}));await request(app.getHttpServer()).delete('/api/v1/safety/blocks/'+dmA).set(dmAuth(dmBToken)).expect(200);
});
let groupedPost:string,groupedNotice:{id:string;createdAt:string};
test('likes group by post and Nigeria day, remain private and read only the observed group boundary',async()=>{
 const post=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Grouped notification fixture'}).expect(201);groupedPost=post.body.id;for(const token of [dmAToken,dmBToken])await request(app.getHttpServer()).put('/api/v1/social/posts/'+groupedPost+'/likes').set(dmAuth(token)).expect(200);
 const list=await request(app.getHttpServer()).get('/api/v1/notification-groups?limit=50').set(dmAuth(staffToken)).expect(200);const row=list.body.data.find((n:{href:string;kind:string})=>n.href==='/posts/'+groupedPost&&n.kind==='LIKE');assert.ok(row);assert.equal(row.eventCount,2);assert.equal(row.actors.length,2);groupedNotice={id:row.id,createdAt:row.createdAt};
 await request(app.getHttpServer()).put('/api/v1/notification-groups/'+row.id+'/read').set(dmAuth(dmAToken)).send({through:row.createdAt}).expect(404);
 await request(app.getHttpServer()).put('/api/v1/social/posts/'+groupedPost+'/likes').set(dmAuth(dmCToken)).expect(200);const fresh=await db.notification.findFirstOrThrow({where:{recipientId:staffId,actorId:dmC,postId:groupedPost,kind:'LIKE'}});await db.notification.update({where:{id:fresh.id},data:{createdAt:new Date(new Date(row.createdAt).getTime()+1)}});
 await request(app.getHttpServer()).put('/api/v1/notification-groups/'+row.id+'/read').set(dmAuth(staffToken)).send({through:row.createdAt}).expect(200);assert.equal((await db.notification.findUniqueOrThrow({where:{id:fresh.id}})).readAt,null);assert.equal(await db.notification.count({where:{recipientId:staffId,postId:groupedPost,kind:'LIKE',readAt:{not:null}}}),2);
 const unread=await request(app.getHttpServer()).get('/api/v1/notification-groups?filter=unread&limit=50').set(dmAuth(staffToken)).expect(200);assert.equal(unread.body.data.find((n:{href:string})=>n.href==='/posts/'+groupedPost).eventCount,3);
 await request(app.getHttpServer()).get('/api/v1/notification-groups?cursor=broken').set(dmAuth(staffToken)).expect(400);
});
test('profile post alerts require a follow, group posts/quotes/reposts and stop when disabled or muted',async()=>{
 await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+staffId+'/on').set(dmAuth(dmAToken)).expect(403);await request(app.getHttpServer()).put('/api/v1/social/users/'+staffId+'/follow').set(dmAuth(dmAToken)).expect(200);await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+staffId+'/on').set(dmAuth(dmAToken)).expect(200);
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Watched account update'}).expect(201);const target=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'An original to quote or repost'}).expect(201);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Watched quote',quotedPostId:target.body.id}).expect(201);await request(app.getHttpServer()).put('/api/v1/social/posts/'+target.body.id+'/reposts').set(dmAuth(staffToken)).expect(200);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'A reply should not trigger a profile post alert',parentId:root.body.id}).expect(201);
 assert.equal(await db.notification.count({where:{recipientId:dmA,actorId:staffId,kind:'POST_ALERT'}}),3);const list=await request(app.getHttpServer()).get('/api/v1/notification-groups').set(dmAuth(dmAToken)).expect(200);const group=list.body.data.find((n:{kind:string})=>n.kind==='POST_ALERT');assert.equal(group.eventCount,3);assert.equal(group.href,'/notifications/posts');const timeline=await request(app.getHttpServer()).get('/api/v1/notification-groups/'+group.id).set(dmAuth(dmAToken)).expect(200);assert.equal(timeline.body.data.length,3);assert.ok(timeline.body.data.some((n:{kind:string;post:{repostedBy:{id:string}|null}})=>n.kind==='REPOST'&&n.post.repostedBy?.id===staffId));await request(app.getHttpServer()).get('/api/v1/notification-groups/'+group.id).set(dmAuth(dmBToken)).expect(404);
 await request(app.getHttpServer()).delete('/api/v1/social/posts/'+target.body.id+'/reposts').set(dmAuth(staffToken)).expect(200);assert.equal(await db.notification.count({where:{recipientId:dmA,actorId:staffId,kind:'POST_ALERT'}}),2);
 await request(app.getHttpServer()).put('/api/v1/safety/mutes/'+staffId).set(dmAuth(dmAToken)).expect(200);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Muted alert must not be delivered'}).expect(201);assert.equal(await db.notification.count({where:{recipientId:dmA,actorId:staffId,kind:'POST_ALERT'}}),2);await request(app.getHttpServer()).delete('/api/v1/safety/mutes/'+staffId).set(dmAuth(dmAToken)).expect(200);await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+staffId+'/off').set(dmAuth(dmAToken)).expect(200);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Alerts turned off'}).expect(201);assert.equal(await db.notification.count({where:{recipientId:dmA,actorId:staffId,kind:'POST_ALERT'}}),2);
});

import { GoogleAuthService, type GoogleIdentity, localNext } from '../../src/google-auth';
let googleUserId:string,googleCookie:string;
const googleEnv={client:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,redirect:process.env.GOOGLE_REDIRECT_URI};
async function beginGoogle(next='/u/publisher'){
 const result=await request(app.getHttpServer()).get('/api/v1/auth/google/start').query({next}).expect(302);const u=new URL(result.headers.location);const state=u.searchParams.get('state')!;const record=await db.oAuthChallenge.findUniqueOrThrow({where:{stateHash:tokenHash(state)}});return {result,u,state,record,cookie:(result.headers['set-cookie'] as unknown as string[])[0].split(';')[0]};
}
async function googleCallback(sub:string,email:string,next='/u/publisher',extra:Partial<GoogleIdentity>={}){
 const start=await beginGoogle(next);const service=app.get(GoogleAuthService),exchange=service.exchange;service.exchange=async()=>({sub,email,email_verified:true,name:'Google Member',nonce:start.record.nonce,...extra});try{const result=await request(app.getHttpServer()).get('/api/v1/auth/google/callback').query({code:'fixture-code',state:start.state}).set('Cookie',start.cookie).expect(302);return {result,start};}finally{service.exchange=exchange;}
}
test('Google sign-in stays disabled without credentials, then uses state, PKCE, nonce and safe local returns',async()=>{
 delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;delete process.env.GOOGLE_REDIRECT_URI;assert.equal((await request(app.getHttpServer()).get('/api/v1/auth/providers').expect(200)).body.google,false);await request(app.getHttpServer()).get('/api/v1/auth/google/start').expect(503);
 process.env.GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com';process.env.GOOGLE_CLIENT_SECRET='fixture-private-secret';process.env.GOOGLE_REDIRECT_URI='http://localhost:5173/api/v1/auth/google/callback';
 const start=await beginGoogle('//foreign.example/steal');assert.equal(start.record.next,'/home');assert.equal(start.u.origin,'https://accounts.google.com');assert.equal(start.u.searchParams.get('code_challenge_method'),'S256');assert.equal(start.u.searchParams.get('code_challenge'),require('node:crypto').createHash('sha256').update(start.record.verifier).digest('base64url'));assert.ok((start.result.headers['set-cookie'] as unknown as string[])[0].includes('HttpOnly'));assert.ok(!start.result.headers.location.includes('fixture-private-secret'));assert.equal(start.u.searchParams.get('nonce'),start.record.nonce);
 const rejected=await request(app.getHttpServer()).get('/api/v1/auth/google/callback').query({code:'fixture-code',state:start.state}).set('Cookie','fpi_google_state=wrong').expect(302);assert.ok(rejected.headers.location.endsWith('/login?google=failed'));assert.ok(await db.oAuthChallenge.findUnique({where:{id:start.record.id}}));
 assert.equal(localNext('/search?q=Ilaro&type=people'),'/search?q=Ilaro&type=people');for(const next of ['https://evil.example','//evil.example','/%2f/evil.example','/\\evil.example','/login'])assert.equal(localNext(next),'/home');
});
test('Google rejects nonce mismatches, expired challenges and callback replay',async()=>{
 const bad=await googleCallback('bad-nonce-'+runId,'badnonce@gmail.com','/home',{nonce:'not-the-issued-nonce'});assert.ok(bad.result.headers.location.endsWith('/login?google=failed'));assert.equal(await db.oAuthIdentity.count({where:{subject:'bad-nonce-'+runId}}),0);
 const start=await beginGoogle();await db.oAuthChallenge.update({where:{id:start.record.id},data:{expiresAt:new Date(0)}});const expired=await request(app.getHttpServer()).get('/api/v1/auth/google/callback').query({code:'fixture-code',state:start.state}).set('Cookie',start.cookie).expect(302);assert.ok(expired.headers.location.endsWith('/login?google=failed'));
 const other=await googleCallback('replay-'+runId,runId+'replay@gmail.com');const replay=await request(app.getHttpServer()).get('/api/v1/auth/google/callback').query({code:'fixture-code',state:other.start.state}).set('Cookie',other.start.cookie).expect(302);assert.ok(replay.headers.location.endsWith('/login?google=failed'));
});
test('Google does not auto-link matching emails and enrollment creates only a member account after username selection',async()=>{
 const staff=await db.user.findUniqueOrThrow({where:{id:staffId}});const existing=await googleCallback('collision-'+runId,staff.email);assert.ok(existing.result.headers.location.endsWith('/login?google=existing'));assert.equal(await db.oAuthIdentity.count({where:{userId:staffId}}),0);
 const flow=await googleCallback('member-'+runId,runId+'google@gmail.com','/search?q=Ilaro&type=people');assert.ok(flow.result.headers.location.endsWith('/auth/google/setup'));const enrollmentCookie=(flow.result.headers['set-cookie'] as unknown as string[]).find(x=>x.startsWith('fpi_google_enroll='))!.split(';')[0];
 const pending=await request(app.getHttpServer()).get('/api/v1/auth/google/pending').set('Cookie',enrollmentCookie).expect(200);assert.equal(pending.body.email,runId+'google@gmail.com');assert.equal(pending.body.subject,undefined);assert.equal(await db.oAuthIdentity.count({where:{subject:'member-'+runId}}),0);
 await request(app.getHttpServer()).post('/api/v1/auth/google/complete').set('Cookie',enrollmentCookie).set('Origin','http://untrusted.example').send({username:runId+'google',displayName:'Google Member',agreed:true}).expect(403);
 const complete=await request(app.getHttpServer()).post('/api/v1/auth/google/complete').set('Cookie',enrollmentCookie).set('Origin','http://localhost:5173').send({username:runId+'google',displayName:'Google Member',agreed:true}).expect(201);googleUserId=complete.body.user.id;ids.push(googleUserId);googleCookie=(complete.headers['set-cookie'] as unknown as string[]).find(x=>x.startsWith('fpi_session='))!.split(';')[0];assert.equal(complete.body.next,'/search?q=Ilaro&type=people');assert.equal(complete.body.accessToken,undefined);
 const user=await db.user.findUniqueOrThrow({where:{id:googleUserId},include:{roles:{include:{role:true}}}});assert.equal(user.passwordEnabled,false);assert.ok(user.emailVerifiedAt);assert.deepEqual(user.roles.map(r=>r.role.key),['member']);
 await request(app.getHttpServer()).post('/api/v1/auth/google/complete').set('Cookie',enrollmentCookie).set('Origin','http://localhost:5173').send({username:runId+'google2',displayName:'Replay',agreed:true}).expect(401);
});
test('linked Google identity uses the stable subject and a Google-only account cannot disconnect its only sign-in method',async()=>{
 const flow=await googleCallback('member-'+runId,runId+'changed@example.test','/posts/'+groupedPost);assert.ok(flow.result.headers.location.endsWith('/posts/'+groupedPost));const sessionCookie=(flow.result.headers['set-cookie'] as unknown as string[]).find(x=>x.startsWith('fpi_session='))!.split(';')[0];assert.equal((await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',sessionCookie).expect(200)).body.id,googleUserId);
 await request(app.getHttpServer()).delete('/api/v1/auth/google/connection').set('Cookie',googleCookie).set('Origin','http://localhost:5173').send({password:'not-a-password'}).expect(401);
 await db.user.update({where:{id:googleUserId},data:{passwordHash:await hashPassword('fixture disabled password 123')}});await request(app.getHttpServer()).post('/api/v1/auth/login').send({identifier:runId+'google',password:'fixture disabled password 123'}).expect(401);
});
test('linking and unlinking Google require current account authentication and never transfer another account identity',async()=>{
 await request(app.getHttpServer()).post('/api/v1/auth/google/link').set(dmAuth(staffToken)).send({password:'wrong'}).expect(401);
 const link=await request(app.getHttpServer()).post('/api/v1/auth/google/link').set(dmAuth(staffToken)).send({password:'staff fixture password 123'}).expect(201);const state=new URL(link.body.url).searchParams.get('state')!;const challenge=await db.oAuthChallenge.findUniqueOrThrow({where:{stateHash:tokenHash(state)}});const cookie=(link.headers['set-cookie'] as unknown as string[])[0].split(';')[0];const service=app.get(GoogleAuthService),original=service.exchange;service.exchange=async()=>({sub:'staff-linked-'+runId,email:'alternate@gmail.com',email_verified:true,nonce:challenge.nonce});try{const callback=await request(app.getHttpServer()).get('/api/v1/auth/google/callback').query({code:'fixture',state}).set(dmAuth(staffToken)).set('Cookie',cookie).expect(302);assert.ok(callback.headers.location.endsWith('/settings?google=linked'));}finally{service.exchange=original;}
 assert.equal((await request(app.getHttpServer()).get('/api/v1/auth/google/connection').set(dmAuth(staffToken)).expect(200)).body.connected,true);await request(app.getHttpServer()).delete('/api/v1/auth/google/connection').set(dmAuth(staffToken)).send({password:'wrong'}).expect(401);await request(app.getHttpServer()).delete('/api/v1/auth/google/connection').set(dmAuth(staffToken)).send({password:'staff fixture password 123'}).expect(200);assert.equal(await db.oAuthIdentity.count({where:{userId:staffId}}),0);
});
test('Google accounts with third-party email addresses still need platform email verification',async()=>{
 const flow=await googleCallback('external-'+runId,runId+'external@example.test');const enrollmentCookie=(flow.result.headers['set-cookie'] as unknown as string[]).find(x=>x.startsWith('fpi_google_enroll='))!.split(';')[0];const complete=await request(app.getHttpServer()).post('/api/v1/auth/google/complete').set('Cookie',enrollmentCookie).set('Origin','http://localhost:5173').send({username:runId+'external',displayName:'External Email',agreed:true}).expect(201);ids.push(complete.body.user.id);assert.equal((await db.user.findUniqueOrThrow({where:{id:complete.body.user.id}})).emailVerifiedAt,null);
 if(googleEnv.client===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=googleEnv.client;if(googleEnv.secret===undefined)delete process.env.GOOGLE_CLIENT_SECRET;else process.env.GOOGLE_CLIENT_SECRET=googleEnv.secret;if(googleEnv.redirect===undefined)delete process.env.GOOGLE_REDIRECT_URI;else process.env.GOOGLE_REDIRECT_URI=googleEnv.redirect;
});

test('oldest reply pages keep the first author response before later siblings and enforce cursor direction',async()=>{
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Chronological conversation root'}).expect(201);
 const question=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'Reader question',parentId:root.body.id}).expect(201);
 const responses=[];for(let i=0;i<7;i++){const r=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Author answer '+i,parentId:question.body.id}).expect(201);responses.push(r.body.id);await db.post.update({where:{id:r.body.id},data:{createdAt:new Date(1700000000000+i*1000)}});}
 const first=await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies').query({replyOrder:'oldest',limit:3}).set(dmAuth(staffToken)).expect(200);assert.deepEqual(first.body.data.map((p:{id:string})=>p.id),responses.slice(0,3));
 const second=await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies').query({replyOrder:'oldest',limit:3,cursor:first.body.nextCursor}).set(dmAuth(staffToken)).expect(200);assert.deepEqual(second.body.data.map((p:{id:string})=>p.id),responses.slice(3,6));
 const last=await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies').query({replyOrder:'oldest',limit:3,cursor:second.body.nextCursor}).set(dmAuth(staffToken)).expect(200);assert.deepEqual(last.body.data.map((p:{id:string})=>p.id),responses.slice(6));assert.equal(last.body.nextCursor,null);
 await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies').query({replyOrder:'latest',cursor:first.body.nextCursor}).set(dmAuth(staffToken)).expect(400);await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies?replyOrder=invalid').set(dmAuth(staffToken)).expect(400);
 const earlyReader=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'An earlier reader follow-up',parentId:question.body.id}).expect(201);await db.post.update({where:{id:earlyReader.body.id},data:{createdAt:new Date(1699999999000)}});
 const chronological=await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies?replyOrder=oldest&limit=2').set(dmAuth(staffToken)).expect(200);assert.deepEqual(chronological.body.data.map((p:{id:string})=>p.id),[earlyReader.body.id,responses[0]]);
 const latest=await request(app.getHttpServer()).get('/api/v1/posts/'+question.body.id+'/replies?limit=2').set(dmAuth(staffToken)).expect(200);assert.deepEqual(latest.body.data.map((p:{id:string})=>p.id),responses.slice(-2).reverse());
});

let peopleViewer='',peopleToken='',peopleTarget='',peopleNames:string[]=[],peopleFriends:string[]=[],peopleCandidate='',peopleOther='';
test('people suggestions exclude self, followed, blocked, muted and suspended accounts and rank actual connections',async()=>{
 const make=async(label:string)=>{const u=await db.user.create({data:{username:runId+'p'+label,email:runId+'p'+label+'@example.test',displayName:'People '+label,passwordHash:'unused fixture hash'}});ids.push(u.id);return u;};
 const viewer=await make('viewer');peopleViewer=viewer.id;peopleToken=newToken();await db.session.create({data:{userId:viewer.id,tokenHash:tokenHash(peopleToken),expiresAt:new Date(Date.now()+3600000)}});const target=await make('target');peopleTarget=target.id;peopleNames.push(target.username);
 const friends=[];for(let i=0;i<5;i++)friends.push(await make('friend'+i));peopleFriends=friends.map(u=>u.id);const candidate=await make('candidate'),other=await make('other');peopleCandidate=candidate.id;peopleOther=other.id;
 await db.follow.createMany({data:[...friends.map(f=>({followerId:viewer.id,followingId:f.id})),...friends.map(f=>({followerId:f.id,followingId:target.id})),{followerId:friends[0].id,followingId:candidate.id},{followerId:friends[1].id,followingId:candidate.id},{followerId:friends[2].id,followingId:other.id}]});await db.mute.create({data:{muterId:viewer.id,mutedId:friends[3].id}});await db.user.update({where:{id:friends[4].id},data:{status:'SUSPENDED'}});
 await request(app.getHttpServer()).get('/api/v1/people/suggestions').expect(401);const result=await request(app.getHttpServer()).get('/api/v1/people/suggestions').query({context:target.username,limit:30}).set(dmAuth(peopleToken)).expect(200);assert.equal(result.body.data[0].id,candidate.id);assert.equal(result.body.data[0].reason,'Followed by people you follow');for(const p of result.body.data){assert.ok(![viewer.id,target.id,...peopleFriends].includes(p.id));assert.equal(p.isFollowing,false);assert.equal(p.email,undefined);assert.equal(p.passwordHash,undefined);}
 await db.block.create({data:{blockerId:viewer.id,blockedId:candidate.id}});await db.block.create({data:{blockerId:other.id,blockedId:viewer.id}});const filtered=await request(app.getHttpServer()).get('/api/v1/people/suggestions').set(dmAuth(peopleToken)).expect(200);assert.ok(!filtered.body.data.some((p:{id:string})=>[candidate.id,other.id].includes(p.id)));await request(app.getHttpServer()).get('/api/v1/people/suggestions?limit=31').set(dmAuth(peopleToken)).expect(400);await request(app.getHttpServer()).get('/api/v1/people/suggestions?context=BAD').set(dmAuth(peopleToken)).expect(400);
});
test('followers you know are the current viewers real visible intersection with complete pagination',async()=>{
 const expected=peopleFriends.slice(0,3).sort().reverse();const found:string[]=[];let cursor:string|null=null;
 do{const result:{body:{total:number;data:{id:string;isFollowing:boolean;email?:string}[];nextCursor:string|null}}=await request(app.getHttpServer()).get('/api/v1/people/mutual/'+peopleNames[0]).query({limit:1,...(cursor?{before:cursor}:{})}).set(dmAuth(peopleToken)).expect(200);assert.equal(result.body.total,3);for(const u of result.body.data){assert.equal(u.isFollowing,true);assert.equal(u.email,undefined);found.push(u.id);}cursor=result.body.nextCursor;}while(cursor);assert.deepEqual(found,expected);
 const unrelated=await request(app.getHttpServer()).get('/api/v1/people/mutual/'+peopleNames[0]).set(dmAuth(dmCToken)).expect(200);assert.equal(unrelated.body.total,0);await request(app.getHttpServer()).get('/api/v1/people/mutual/'+peopleNames[0]+'?before=bad').set(dmAuth(peopleToken)).expect(400);
 await db.block.create({data:{blockerId:peopleTarget,blockedId:peopleViewer}});await request(app.getHttpServer()).get('/api/v1/people/mutual/'+peopleNames[0]).set(dmAuth(peopleToken)).expect(404);const hidden=await request(app.getHttpServer()).get('/api/v1/people/suggestions?context='+peopleNames[0]).set(dmAuth(peopleToken)).expect(200);assert.deepEqual(hidden.body.data,[]);
});

test('notification groups merge one persons likes across posts without duplicating multi-person post activity',async()=>{
 const users=[];for(let i=0;i<3;i++){const u=await db.user.create({data:{username:runId+'ng'+i,email:runId+'ng'+i+'@example.test',displayName:'Notice '+i,passwordHash:'unused',emailVerifiedAt:new Date()}});ids.push(u.id);const token=newToken();await db.session.create({data:{userId:u.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});users.push({...u,token});}
 const [owner,first,second]=users;const posts=[];for(let i=0;i<3;i++){const p=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(owner.token)).send({body:'Grouped target '+i}).expect(201);posts.push(p.body.id);await request(app.getHttpServer()).put('/api/v1/social/posts/'+p.body.id+'/likes').set(dmAuth(first.token)).expect(200);}
 const inbox=await request(app.getHttpServer()).get('/api/v1/notification-groups').set(dmAuth(owner.token)).expect(200);assert.equal(inbox.body.data.length,1);const group=inbox.body.data[0];assert.equal(group.actorCount,1);assert.equal(group.postCount,3);assert.equal(group.eventCount,3);assert.equal(group.href,'/notifications/activity/'+group.id);
 const details=await request(app.getHttpServer()).get('/api/v1/notification-groups/'+group.id).set(dmAuth(owner.token)).expect(200);assert.equal(details.body.data.length,3);
 await request(app.getHttpServer()).put('/api/v1/notification-groups/'+group.id+'/read').set(dmAuth(owner.token)).send({through:group.createdAt}).expect(200);
 await request(app.getHttpServer()).put('/api/v1/social/posts/'+posts[0]+'/likes').set(dmAuth(second.token)).expect(200);
 const regrouped=await request(app.getHttpServer()).get('/api/v1/notification-groups').set(dmAuth(owner.token)).expect(200);assert.equal(regrouped.body.data.length,2);assert.equal(regrouped.body.data.reduce((n:number,g:{eventCount:number})=>n+g.eventCount,0),4);assert.ok(regrouped.body.data.some((g:{actorCount:number;postCount:number})=>g.actorCount===2&&g.postCount===1));assert.ok(regrouped.body.data.some((g:{actorCount:number;postCount:number})=>g.actorCount===1&&g.postCount===2));assert.equal(await db.notification.count({where:{recipientId:owner.id,kind:'LIKE',readAt:{not:null}}}),3);
 await request(app.getHttpServer()).delete('/api/v1/social/posts/'+posts[0]+'/likes').set(dmAuth(second.token)).expect(200);const restored=await request(app.getHttpServer()).get('/api/v1/notification-groups').set(dmAuth(owner.token)).expect(200);assert.equal(restored.body.data.length,1);assert.equal(restored.body.data[0].postCount,3);
});

test('combined account-alert timeline pages across authors and respects enabled bells, visibility and read boundaries',async()=>{
 const users=[];for(let i=0;i<3;i++){const u=await db.user.create({data:{username:runId+'nt'+i,email:runId+'nt'+i+'@example.test',displayName:'Timeline '+i,passwordHash:'unused',emailVerifiedAt:new Date()}});ids.push(u.id);const token=newToken();await db.session.create({data:{userId:u.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});users.push({...u,token});}
 const [viewer,a,b]=users;for(const author of[a,b]){await request(app.getHttpServer()).put('/api/v1/social/users/'+author.id+'/follow').set(dmAuth(viewer.token)).expect(200);await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+author.id+'/on').set(dmAuth(viewer.token)).expect(200);}
 const original=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(a.token)).send({body:'First subscribed update'}).expect(201);await request(app.getHttpServer()).put('/api/v1/social/posts/'+original.body.id+'/reposts').set(dmAuth(b.token)).expect(200);
 const before=await request(app.getHttpServer()).get('/api/v1/notification-groups').set(dmAuth(viewer.token)).expect(200);const group=before.body.data.find((g:{kind:string})=>g.kind==='POST_ALERT');assert.equal(group.actorCount,2);assert.equal(group.eventCount,2);assert.equal(group.href,'/notifications/posts');
 const quote=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(b.token)).send({body:'Second account quote',quotedPostId:original.body.id}).expect(201);
 await request(app.getHttpServer()).put('/api/v1/notification-groups/'+group.id+'/read').set(dmAuth(viewer.token)).send({through:group.createdAt}).expect(200);assert.equal(await db.notification.count({where:{recipientId:viewer.id,kind:'POST_ALERT',readAt:null}}),1);
 const seen:string[]=[];let cursor:string|null=null;do{const page:{body:{data:{id:string;kind:string;post:{repostedBy:{id:string}}}[];nextCursor:string|null}}=await request(app.getHttpServer()).get('/api/v1/notification-groups/posts').query({limit:1,...(cursor?{cursor}:{})}).set(dmAuth(viewer.token)).expect(200);for(const row of page.body.data){seen.push(row.id);assert.ok(row.post);if(row.kind==='REPOST')assert.equal(row.post.repostedBy.id,b.id);}cursor=page.body.nextCursor;}while(cursor);assert.equal(new Set(seen).size,3);
 await request(app.getHttpServer()).get('/api/v1/notification-groups/posts').expect(401);await request(app.getHttpServer()).get('/api/v1/notification-groups/posts?cursor=bad').set(dmAuth(viewer.token)).expect(400);
 await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+b.id+'/off').set(dmAuth(viewer.token)).expect(200);const off=await request(app.getHttpServer()).get('/api/v1/notification-groups/posts').set(dmAuth(viewer.token)).expect(200);assert.deepEqual(off.body.data.map((r:{post:{id:string}})=>r.post.id),[original.body.id]);
 await request(app.getHttpServer()).put('/api/v1/safety/mutes/'+a.id).set(dmAuth(viewer.token)).expect(200);const hidden=await request(app.getHttpServer()).get('/api/v1/notification-groups/posts').set(dmAuth(viewer.token)).expect(200);assert.deepEqual(hidden.body.data,[]);await request(app.getHttpServer()).delete('/api/v1/safety/mutes/'+a.id).set(dmAuth(viewer.token)).expect(200);
 await request(app.getHttpServer()).put('/api/v1/profile-alerts/'+b.id+'/on').set(dmAuth(viewer.token)).expect(200);await request(app.getHttpServer()).put('/api/v1/safety/blocks/'+a.id).set(dmAuth(viewer.token)).expect(200);const blocked=await request(app.getHttpServer()).get('/api/v1/notification-groups/posts').set(dmAuth(viewer.token)).expect(200);assert.ok(!blocked.body.data.some((r:{post:{id:string}})=>r.post.id===original.body.id));
});

test('mentions filter returns only mentions, while replies carry safe conversation cards and reply labels',async()=>{
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Reply notification root'}).expect(201);const reply=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'Reply to display in inbox',parentId:root.body.id}).expect(201);await request(app.getHttpServer()).put('/api/v1/social/posts/'+reply.body.id+'/likes').set(dmAuth(staffToken)).expect(200);
 const inbox=await request(app.getHttpServer()).get('/api/v1/notification-groups?limit=50').set(dmAuth(staffToken)).expect(200);const row=inbox.body.data.find((g:{kind:string;conversationPost?:{id:string}})=>g.kind==='REPLY'&&g.conversationPost?.id===reply.body.id);assert.ok(row);assert.equal(row.targetIsReply,false);assert.equal(row.conversationPost.author.email,undefined);
 const authorInbox=await request(app.getHttpServer()).get('/api/v1/notification-groups?limit=50').set(dmAuth(dmCToken)).expect(200);assert.ok(authorInbox.body.data.some((g:{kind:string;targetIsReply:boolean})=>g.kind==='LIKE'&&g.targetIsReply));
 const mentions=await request(app.getHttpServer()).get('/api/v1/notification-groups?filter=mentions').set(dmAuth(staffToken)).expect(200);assert.ok(mentions.body.data.every((g:{kind:string})=>g.kind==='MENTION'));await request(app.getHttpServer()).get('/api/v1/notification-groups?filter=priority').set(dmAuth(staffToken)).expect(400);
});

test('contact discovery is opt-in, verified, rate bounded, block/mute aware and never exposes supplied contact details',async()=>{
 const make=async(label:string,verified=true)=>{const u=await db.user.create({data:{username:runId+'d'+label,email:runId+'d'+label+'@example.test',displayName:'Discovery '+label,passwordHash:'unused',emailVerifiedAt:verified?new Date():null}});ids.push(u.id);const token=newToken();await db.session.create({data:{userId:u.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});return {...u,token};};
 const viewer=await make('viewer'),target=await make('target',false);await request(app.getHttpServer()).get('/api/v1/people/discoverability').expect(401);
 const defaults=await request(app.getHttpServer()).get('/api/v1/people/discoverability').set(dmAuth(target.token)).expect(200);assert.equal(defaults.body.discoverByEmail,false);assert.equal(defaults.body.discoverByPhone,false);
 await request(app.getHttpServer()).put('/api/v1/people/discoverability').set(dmAuth(target.token)).send({discoverByEmail:true,discoverByPhone:false}).expect(400);
 await request(app.getHttpServer()).put('/api/v1/people/discoverability').set(dmAuth(viewer.token)).send({discoverByEmail:false,discoverByPhone:true}).expect(400);
 await request(app.getHttpServer()).post('/api/v1/people/contacts').set(dmAuth(target.token)).send({emails:[viewer.email]}).expect(400);
 await db.user.update({where:{id:target.id},data:{emailVerifiedAt:new Date()}});
 const find=()=>request(app.getHttpServer()).post('/api/v1/people/contacts').set(dmAuth(viewer.token)).send({emails:[target.email.toUpperCase()]}).expect(r=>{if(r.status!==201&&r.status!==429)throw Error(JSON.stringify(r.body))});assert.deepEqual((await find().expect(201)).body.data,[]);
 await request(app.getHttpServer()).put('/api/v1/people/discoverability').set(dmAuth(target.token)).send({discoverByEmail:true,discoverByPhone:false}).expect(200);
 const found=await find().expect(201);assert.equal(found.body.data[0].id,target.id);assert.equal(found.body.data[0].email,undefined);assert.equal(found.body.data[0].phoneNumber,undefined);assert.equal(found.body.data[0].discoverByEmail,undefined);
 await db.mute.create({data:{muterId:viewer.id,mutedId:target.id}});assert.deepEqual((await find().expect(201)).body.data,[]);await db.mute.delete({where:{muterId_mutedId:{muterId:viewer.id,mutedId:target.id}}});
 await db.block.create({data:{blockerId:target.id,blockedId:viewer.id}});assert.deepEqual((await find().expect(201)).body.data,[]);await db.block.delete({where:{blockerId_blockedId:{blockerId:target.id,blockedId:viewer.id}}});
 await request(app.getHttpServer()).put('/api/v1/people/discoverability').set(dmAuth(target.token)).send({discoverByEmail:false,discoverByPhone:false}).expect(200);assert.deepEqual((await find().expect(201)).body.data,[]);await find().expect(429);
 const publicProfile=await request(app.getHttpServer()).get('/api/v1/users/'+target.username).expect(200);assert.equal(publicProfile.body.discoverByEmail,undefined);assert.equal(publicProfile.body.phoneVerifiedAt,undefined);
});

test('announcement placement and devices are independent and the first eligible card is selected',async()=>{
 await db.discoveryCard.updateMany({data:{enabled:false}});const base={kind:'ANNOUNCEMENT',body:'A small announcement',href:'/about',enabled:true,startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),position:0};
 const side=crypto.randomUUID(),feed=crypto.randomUUID();await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+side).set(dmAuth(staffToken)).send({...base,title:'Mobile sidebar',sidebar:true,feed:false,mobile:true,desktop:false}).expect(200);await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+feed).set(dmAuth(staffToken)).send({...base,title:'Desktop feed',sidebar:false,feed:true,mobile:false,desktop:true}).expect(200);
 assert.equal((await request(app.getHttpServer()).get('/api/v1/discovery/sidebar?placement=sidebar&device=mobile').expect(200)).body.announcement.id,side);assert.equal((await request(app.getHttpServer()).get('/api/v1/discovery/sidebar?placement=feed&device=desktop').expect(200)).body.announcement.id,feed);assert.equal((await request(app.getHttpServer()).get('/api/v1/discovery/sidebar?placement=feed&device=mobile').expect(200)).body.announcement,null);assert.equal((await request(app.getHttpServer()).get('/api/v1/discovery/sidebar?placement=sidebar&device=desktop').expect(200)).body.announcement,null);
 await request(app.getHttpServer()).get('/api/v1/discovery/sidebar?device=phone').expect(400);await request(app.getHttpServer()).put('/api/v1/admin/discovery/'+feed).set(dmAuth(staffToken)).send({...base,title:'Nowhere',sidebar:false,feed:false,desktop:true,mobile:true}).expect(400);
});

test('sports logos and rosters are private in drafts, public when published, and use optional football identities without creating accounts',async()=>{
 const image=await sharp({create:{width:128,height:128,channels:3,background:'#15803d'}}).png().toBuffer();await request(app.getHttpServer()).post('/api/v1/media/sport').set(dmAuth(dmAToken)).attach('file',image,{filename:'logo.png',contentType:'image/png'}).expect(403);
 const logo=await request(app.getHttpServer()).post('/api/v1/media/sport').set(dmAuth(staffToken)).attach('file',image,{filename:'logo.png',contentType:'image/png'}).expect(r=>{if(r.status!==201)throw Error(JSON.stringify(r.body))}).expect(201);
 const comp=await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions').set(dmAuth(staffToken)).send({...sportsCompetitionPayload,name:'Roster Cup',format:'LEAGUE'}).expect(201);
 const home=await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions/'+comp.body.id+'/teams').set(dmAuth(staffToken)).send({name:'Computer Engineering',groupName:'',logoMediaId:logo.body.id}).expect(201);const away=await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions/'+comp.body.id+'/teams').set(dmAuth(staffToken)).send({name:'SLT',groupName:''}).expect(201);
 const linked=await db.user.findUniqueOrThrow({where:{id:dmC}});const count=await db.user.count();const player=await request(app.getHttpServer()).post('/api/v1/sports-desk/teams/'+home.body.id+'/players').set(dmAuth(staffToken)).send({name:'Goal Machine',shirtNumber:9,username:linked.username,photoMediaId:logo.body.id}).expect(201);const manual=await request(app.getHttpServer()).post('/api/v1/sports-desk/teams/'+away.body.id+'/players').set(dmAuth(staffToken)).send({name:'Captain SLT',shirtNumber:10}).expect(201);assert.equal(await db.user.count(),count);
 await request(app.getHttpServer()).post('/api/v1/sports-desk/teams/'+home.body.id+'/players').set(dmAuth(staffToken)).send({name:'Duplicate shirt',shirtNumber:9}).expect(409);await request(app.getHttpServer()).get('/api/v1/sports/teams/'+home.body.id+'/players').expect(404);await request(app.getHttpServer()).get('/api/v1/media/'+logo.body.id).expect(404);await request(app.getHttpServer()).get('/api/v1/media/'+logo.body.id).set(dmAuth(staffToken)).expect(200);
 await request(app.getHttpServer()).put('/api/v1/sports-desk/competitions/'+comp.body.id).set(dmAuth(staffToken)).send({...sportsCompetitionPayload,name:'Roster Cup',format:'LEAGUE',published:true,revision:0}).expect(200);const roster=await request(app.getHttpServer()).get('/api/v1/sports/teams/'+home.body.id+'/players').expect(200);assert.equal(roster.body[0].name,'Goal Machine');assert.equal(roster.body[0].user.id,linked.id);assert.equal(roster.body[0].user.email,undefined);await request(app.getHttpServer()).get('/api/v1/media/'+logo.body.id).expect(200);
 const fixture=await request(app.getHttpServer()).post('/api/v1/sports-desk/competitions/'+comp.body.id+'/matches').set(dmAuth(staffToken)).send({homeId:home.body.id,awayId:away.body.id,stage:'LEAGUE',kickoffAt:new Date().toISOString(),venue:'Campus',featured:true,featuredSidebar:false,featuredFeed:true,featuredMobile:true,featuredDesktop:false,note:'Roster fixture'}).expect(201);
 const featured=await request(app.getHttpServer()).get('/api/v1/sports/featured?placement=feed&device=mobile').expect(200);assert.equal(featured.body.id,fixture.body.id);assert.equal(featured.body.home.logoMediaId,logo.body.id);
 await request(app.getHttpServer()).put('/api/v1/sports/matches/'+fixture.body.id+'/score').set(dmAuth(staffToken)).send({revision:1,status:'LIVE',homeScore:1,awayScore:0,minute:20,confirmed:false,note:'Home scored'}).expect(200);
 const goal={revision:2,teamId:home.body.id,playerId:player.body.id,requestId:crypto.randomUUID(),minute:20,kind:'GOAL',note:'Goal Machine scores for Computer Engineering'};
 await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(otherToken)).send(goal).expect(403);const recorded=await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(staffToken)).send(goal).expect(201);const retry=await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(staffToken)).send(goal).expect(201);assert.equal(recorded.body.id,retry.body.id);
 await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(staffToken)).send({...goal,note:'Different event with reused request'}).expect(409);await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(staffToken)).send({...goal,requestId:crypto.randomUUID()}).expect(409);await request(app.getHttpServer()).post('/api/v1/sports/matches/'+fixture.body.id+'/goals').set(dmAuth(staffToken)).send({...goal,revision:3,requestId:crypto.randomUUID(),playerId:manual.body.id}).expect(400);
 const goals=await request(app.getHttpServer()).get('/api/v1/sports/matches/'+fixture.body.id+'/goals').expect(200);assert.equal(goals.body.length,1);assert.equal(goals.body[0].scorerName,'Goal Machine');assert.equal(goals.body[0].player.user.email,undefined);assert.equal((await db.sportsMatch.findUniqueOrThrow({where:{id:fixture.body.id}})).homeScore,1);
 await request(app.getHttpServer()).put('/api/v1/sports/matches/'+fixture.body.id+'/goals/'+recorded.body.id+'/void').set(dmAuth(staffToken)).send({revision:3,note:'Corrected scorer log'}).expect(200);assert.equal((await request(app.getHttpServer()).get('/api/v1/sports/matches/'+fixture.body.id+'/goals').expect(200)).body.length,0);assert.ok(await db.auditLog.findFirst({where:{targetId:recorded.body.id,action:'sports.goal.void'}}));
});

test('conversation people include actual ancestor authors and reply participants in context order',async()=>{
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'People context root'}).expect(201);const answer=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'People context answer',parentId:root.body.id}).expect(201);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmAToken)).send({body:'People context child',parentId:answer.body.id}).expect(201);
 const people=await request(app.getHttpServer()).get('/api/v1/posts/'+answer.body.id+'/people').set(dmAuth(otherToken)).expect(200);assert.deepEqual(people.body.map((u:{id:string})=>u.id),[dmC,staffId,dmA]);assert.equal(people.body[0].email,undefined);assert.equal(people.body[0].phoneNumber,undefined);assert.ok(people.body.every((u:{isFollowing:unknown})=>typeof u.isFollowing==='boolean'));
 const mention=await request(app.getHttpServer()).get('/api/v1/discovery/mentions').query({q:(await db.user.findUniqueOrThrow({where:{id:dmC}})).username}).set(dmAuth(staffToken)).expect(200);assert.ok(Object.hasOwn(mention.body[0],'avatarMediaId'));
 const navigation=await request(app.getHttpServer()).get('/api/v1/navigation').set(dmAuth(staffToken)).expect(200);assert.ok(navigation.body.some((m:{path:string;label:string})=>m.path==='/people'&&m.label==='Follow'));
});

test('desktop sync supplies a real actor and safe content preview with an actionable local destination',async()=>{
 const root=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Actual desktop preview text'}).expect(201);const initial=await request(app.getHttpServer()).get('/api/v1/notifications/sync?grouped=true').set(dmAuth(staffToken)).expect(200);await request(app.getHttpServer()).put('/api/v1/social/posts/'+root.body.id+'/likes').set(dmAuth(dmCToken)).expect(200);
 const sync=await request(app.getHttpServer()).get('/api/v1/notifications/sync').query({grouped:'true',cursor:initial.body.cursor}).set(dmAuth(staffToken)).expect(200);assert.equal(sync.body.desktop.actor.id,dmC);assert.equal(sync.body.desktop.kind,'LIKE');assert.equal(sync.body.desktop.preview,'Actual desktop preview text');assert.equal(sync.body.desktop.href,'/posts/'+root.body.id);assert.equal(sync.body.desktop.actor.email,undefined);
});

test('feature releases enforce API access, preserve historical content and atomically apply the text-first preset',async()=>{
 const endpoint=request(app.getHttpServer());const enabled={postImages:true,sports:true,messages:true,articlePublishing:true};assert.deepEqual((await endpoint.get('/api/v1/features').expect(200)).body,{...enabled,uploadsAvailable:true});
 await request(app.getHttpServer()).put('/api/v1/features').set(dmAuth(otherToken)).send({key:'sports',enabled:false}).expect(403);await request(app.getHttpServer()).put('/api/v1/features').set(dmAuth(staffToken)).send({key:'unknown',enabled:false}).expect(400);
 const menuOnly=await db.role.create({data:{key:'menu_only_'+runId,name:'Menu only',permissions:['menus.manage']}});await db.userRole.create({data:{userId:(await request(app.getHttpServer()).get('/api/v1/auth/me').set(dmAuth(otherToken)).expect(200)).body.id,roleId:menuOnly.id}});await request(app.getHttpServer()).put('/api/v1/features').set(dmAuth(otherToken)).send({key:'sports',enabled:false}).expect(403);await db.userRole.deleteMany({where:{roleId:menuOnly.id}});await db.role.delete({where:{id:menuOnly.id}});
 const oldPost=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Text-first historical post'}).expect(201);const oldCount=await db.post.count();
 await request(app.getHttpServer()).put('/api/v1/features/text-first').set(dmAuth(staffToken)).expect(200);assert.deepEqual((await request(app.getHttpServer()).get('/api/v1/features').expect(200)).body,{...enabled,postImages:false,sports:false,messages:false,uploadsAvailable:true});
 await request(app.getHttpServer()).get('/api/v1/sports').expect(403);await request(app.getHttpServer()).get('/api/v1/sports/featured').expect(403);await request(app.getHttpServer()).get('/api/v1/messages/count').set(dmAuth(staffToken)).expect(403);await request(app.getHttpServer()).post('/api/v1/media/POST').set(dmAuth(staffToken)).expect(403);await request(app.getHttpServer()).post('/api/v1/media/%70ost').set(dmAuth(staffToken)).expect(403);
 await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Image bypass',imageMediaId:crypto.randomUUID()}).expect(403);await request(app.getHttpServer()).post('/api/v1/posts/thread').set(dmAuth(staffToken)).send({body:'Thread image bypass',imageMediaId:crypto.randomUUID(),continuations:['Next'],requestId:crypto.randomUUID()}).expect(403);
 assert.equal(await db.post.count(),oldCount);await request(app.getHttpServer()).get('/api/v1/posts/'+oldPost.body.id).expect(200);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Plain text remains available'}).expect(201);
 await request(app.getHttpServer()).put('/api/v1/features').set(dmAuth(staffToken)).send({key:'articlePublishing',enabled:false}).expect(200);await request(app.getHttpServer()).get('/api/v1/editorial').set(dmAuth(staffToken)).expect(403);assert.ok(await db.auditLog.findFirst({where:{action:'features.text-first'}}));
 await assert.rejects(()=>app.get(PublishingService).perform(crypto.randomUUID(),{version:0,action:'publish'},staffId),/publishing is paused/);
 for(const key of Object.keys(enabled))await request(app.getHttpServer()).put('/api/v1/features').set(dmAuth(staffToken)).send({key,enabled:true}).expect(200);await request(app.getHttpServer()).get('/api/v1/sports').expect(200);
});
test('from username search is author scoped, filters phrases and returns a safe visible profile post count',async()=>{
 const u=await db.user.findUniqueOrThrow({where:{id:dmC}});const notificationsBefore=await db.notification.count({where:{recipientId:dmC}});await request(app.getHttpServer()).put('/api/v1/profile').set(dmAuth(staffToken)).send({displayName:'Test Staff',bio:'Reference @'+u.username+' #Ilaro https://example.com'}).expect(200);assert.equal(await db.notification.count({where:{recipientId:dmC}}),notificationsBefore);const a=await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(dmCToken)).send({body:'Scoped needle author post'}).expect(201);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Scoped needle another author'}).expect(201);await request(app.getHttpServer()).put('/api/v1/social/posts/'+a.body.id+'/reposts').set(dmAuth(staffToken)).expect(200);
 const matches=await request(app.getHttpServer()).get('/api/v1/posts').query({q:'from:'+u.username+' Scoped needle',limit:50}).set(dmAuth(staffToken)).expect(200);assert.equal(matches.body.data.length,1);assert.equal(matches.body.data[0].id,a.body.id);assert.equal((await request(app.getHttpServer()).get('/api/v1/posts').query({q:'from:nonexistent_handle_here'}).expect(200)).body.data.length,0);
 const before=await request(app.getHttpServer()).get('/api/v1/users/'+u.username).set(dmAuth(staffToken)).expect(200);assert.equal(before.body.postCount,await db.post.count({where:{authorId:dmC,parentId:null,status:'PUBLISHED',deletedAt:null}}));await db.post.update({where:{id:a.body.id},data:{status:'HIDDEN'}});const after=await request(app.getHttpServer()).get('/api/v1/users/'+u.username).set(dmAuth(staffToken)).expect(200);assert.equal(after.body.postCount,before.body.postCount-1);assert.equal((await request(app.getHttpServer()).get('/api/v1/posts').query({q:'from:'+u.username+' Scoped needle'}).set(dmAuth(staffToken)).expect(200)).body.data.length,0);
});

test('ephemeral staging can pause every new upload while text and availability stay usable',async()=>{const previous=process.env.MEDIA_UPLOADS_DISABLED;try{process.env.MEDIA_UPLOADS_DISABLED='true';assert.equal((await request(app.getHttpServer()).get('/api/v1/features').expect(200)).body.uploadsAvailable,false);for(const kind of ['avatar','profile','cover','post','SPORT'])await request(app.getHttpServer()).post('/api/v1/media/'+kind).set(dmAuth(dmAToken)).expect(403);await request(app.getHttpServer()).post('/api/v1/posts').set(dmAuth(staffToken)).send({body:'Staging text is still available'}).expect(201);}finally{if(previous===undefined)delete process.env.MEDIA_UPLOADS_DISABLED;else process.env.MEDIA_UPLOADS_DISABLED=previous;}});

test('For you mixes outside communities, keeps a stable snapshot and rechecks visibility on later pages',async()=>{
 const make=async(label:string)=>{const u=await db.user.create({data:{username:runId+'rank'+label,email:runId+'rank'+label+'@example.test',displayName:'Rank '+label,passwordHash:'unused',emailVerifiedAt:new Date()}});ids.push(u.id);const token=newToken();await db.session.create({data:{userId:u.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});return {...u,token};};
 const viewer=await make('viewer'),outsideAuthor=await make('author');const community=await db.community.findFirstOrThrow({where:{active:true}});await db.communityMember.create({data:{userId:viewer.id,communityId:community.id}});
 const outside=await db.post.create({data:{authorId:outsideAuthor.id,body:'Outside selected communities'}});for(let i=0;i<5;i++)await db.post.create({data:{authorId:outsideAuthor.id,body:'Ranked outside '+i}});await db.post.create({data:{authorId:viewer.id,body:'Inside selected community',communityId:community.id}});
 const endpoint=request(app.getHttpServer());const first=await endpoint.get('/api/v1/posts').query({mode:'for-you',limit:1}).set(dmAuth(viewer.token)).expect(200);assert.ok(first.body.nextCursor);assert.ok(Number.isFinite(Date.parse(first.body.feedAsOf)));
 const decoded=JSON.parse(Buffer.from(first.body.nextCursor,'base64url').toString());const snapshot=await db.feedSnapshot.findUniqueOrThrow({where:{id:decoded.id}});assert.equal(snapshot.userId,viewer.id);const eventIds=snapshot.eventIds as string[];const outsideEvent=await db.feedEvent.findFirstOrThrow({where:{postId:outside.id}});assert.ok(eventIds.includes(outsideEvent.id));
 const cursor=first.body.nextCursor;const before=await endpoint.get('/api/v1/posts').query({mode:'for-you',cursor,limit:5}).set(dmAuth(viewer.token)).expect(200);
 await db.like.create({data:{userId:viewer.id,postId:outside.id}});const again=await endpoint.get('/api/v1/posts').query({mode:'for-you',cursor,limit:5}).set(dmAuth(viewer.token)).expect(200);assert.deepEqual(again.body.data.map((p:any)=>p.feedId),before.body.data.map((p:any)=>p.feedId));
 await endpoint.get('/api/v1/posts').query({mode:'for-you',cursor}).set(dmAuth(outsideAuthor.token)).expect(400);
 assert.ok(before.body.data.length);const hidden=before.body.data[0].id;await db.post.update({where:{id:hidden},data:{status:'HIDDEN'}});const checked=await endpoint.get('/api/v1/posts').query({mode:'for-you',cursor,limit:5}).set(dmAuth(viewer.token)).expect(200);assert.ok(!checked.body.data.some((p:any)=>p.id===hidden));await db.post.update({where:{id:hidden},data:{status:'PUBLISHED'}});
 await db.feedSnapshot.update({where:{id:snapshot.id},data:{expiresAt:new Date(0)}});await endpoint.get('/api/v1/posts').query({mode:'for-you',cursor}).set(dmAuth(viewer.token)).expect(400);
});

test('optional registration details remain private where appropriate and onboarding never requires topics or five follows',async()=>{
 const name='join'+Date.now();const payload={email:name+'@example.test',username:name,displayName:'New Community Member',password:'registration password 123',gender:'FEMALE',occupation:'Solar technician',skills:['Solar installation','Writing']};
 await request(app.getHttpServer()).post('/api/v1/auth/register').send({...payload,gender:'INVALID'}).expect(400);await request(app.getHttpServer()).post('/api/v1/auth/register').send({...payload,skills:Array.from({length:9},(_,i)=>'Skill '+i)}).expect(400);
 const response=await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload).expect(201);const id=response.body.user.id;ids.push(id);const headers={Authorization:'Bearer '+response.body.accessToken};assert.equal(response.body.user.gender,undefined);assert.equal(response.body.user.occupation,payload.occupation);
 const me=await request(app.getHttpServer()).get('/api/v1/auth/me').set(headers).expect(200);assert.equal(me.body.gender,'FEMALE');assert.equal(me.body.onboardingStage,'TOPICS');assert.deepEqual(me.body.skills,payload.skills);
 const profile=await request(app.getHttpServer()).get('/api/v1/users/'+name).expect(200);assert.equal(profile.body.gender,undefined);assert.equal(profile.body.onboardingStage,undefined);assert.equal(profile.body.phoneNumber,undefined);assert.equal(profile.body.occupation,payload.occupation);
 await request(app.getHttpServer()).put('/api/v1/profile/onboarding').set(headers).send({stage:'PEOPLE'}).expect(200);await request(app.getHttpServer()).put('/api/v1/profile/onboarding').set(headers).send({stage:'DONE'}).expect(200);assert.equal(await db.follow.count({where:{followerId:id}}),0);assert.equal(await db.userInterest.count({where:{userId:id}}),0);
 await request(app.getHttpServer()).put('/api/v1/profile').set(headers).send({displayName:payload.displayName,bio:'',gender:null,occupation:'Researcher',skills:['Python']}).expect(200);const updated=await request(app.getHttpServer()).get('/api/v1/users/'+name).expect(200);assert.equal(updated.body.occupation,'Researcher');assert.deepEqual(updated.body.skills,['Python']);await request(app.getHttpServer()).put('/api/v1/profile/onboarding').set(headers).send({stage:'FORCED'}).expect(400);
});

test('batched live engagements count real activity without exposing bookmark identities or restricted posts',async()=>{
 const make=async(label:string)=>{const u=await db.user.create({data:{username:'live'+Date.now()+label,email:'live'+Date.now()+label+'@example.test',displayName:'Live '+label,passwordHash:'unused',emailVerifiedAt:new Date()}});ids.push(u.id);const token=newToken();await db.session.create({data:{userId:u.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});return {...u,token};};const author=await make('author'),reader=await make('reader');const headers={Authorization:'Bearer '+reader.token};const root=await db.post.create({data:{authorId:author.id,body:'Live counts fixture'}});const hidden=await db.post.create({data:{authorId:author.id,body:'Hidden live fixture',status:'HIDDEN'}});
 const before=await request(app.getHttpServer()).get('/api/v1/social/engagements').query({ids:root.id}).set(headers).expect(200);assert.equal(before.body.data[0]._count.likes,0);assert.equal(before.body.data[0].viewer.bookmarked,false);
 await db.like.create({data:{postId:root.id,userId:reader.id}});await db.bookmark.create({data:{postId:root.id,userId:reader.id}});const next=await request(app.getHttpServer()).get('/api/v1/social/engagements').query({ids:root.id+','+hidden.id}).set(headers).expect(200);assert.equal(next.body.data.length,1);assert.equal(next.body.data[0]._count.likes,1);assert.equal(next.body.data[0]._count.bookmarks,1);assert.equal(next.body.data[0].viewer.bookmarked,true);assert.equal(next.body.data[0].bookmarks,undefined);assert.equal(next.body.data[0].author,undefined);
 const guest=await request(app.getHttpServer()).get('/api/v1/social/engagements').query({ids:root.id}).expect(200);assert.equal(guest.body.data[0].viewer.bookmarked,false);await db.block.create({data:{blockerId:author.id,blockedId:reader.id}});assert.deepEqual((await request(app.getHttpServer()).get('/api/v1/social/engagements').query({ids:root.id}).set(headers).expect(200)).body.data,[]);
 await request(app.getHttpServer()).get('/api/v1/social/engagements?ids=invalid').expect(400);await request(app.getHttpServer()).get('/api/v1/social/engagements').query({ids:Array.from({length:21},()=>crypto.randomUUID()).join(',')}).expect(400);
});
