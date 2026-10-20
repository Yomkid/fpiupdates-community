import {BadRequestException,Body,Controller,Delete,Get,Injectable,Logger,OnModuleDestroy,OnModuleInit,Post,Put,Query,Req,ServiceUnavailableException,UseGuards} from '@nestjs/common';
import {IsIn,IsString,IsUUID,Matches,MaxLength} from 'class-validator';
import webpush from 'web-push';
import {ECDH} from 'node:crypto';
import {AuthRequest,SessionGuard,BrowserOriginGuard} from './auth';
import {Database} from './database';
import {PermissionGuard,RequirePermission} from './permissions';
import {notificationVisibility} from './notifications';
import {publicPage} from './public-pages';
export function allowedPushEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
class DeviceDto { @IsString() @MaxLength(2048) endpoint!:string; @Matches(/^[A-Za-z0-9_-]{87}$/) p256dh!:string; @Matches(/^[A-Za-z0-9_-]{22}$/) auth!:string; }
class EndpointDto { @IsString() @MaxLength(2048) endpoint!:string; }
class InstallDto { @IsUUID('4') id!:string; @IsIn(['android','ios','desktop','other']) platform!:string; @IsIn(['installed','launch']) event!:string; }
@Injectable()
export class PushService implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private running=false;private logger=new Logger('WebPush');
 constructor(private readonly db:Database){}
 get enabled(){return process.env.WEB_PUSH_ENABLED==='true'&&!!process.env.VAPID_PUBLIC_KEY&&!!process.env.VAPID_PRIVATE_KEY&&!!process.env.VAPID_SUBJECT;}
 onModuleInit(){if(process.env.WEB_PUSH_ENABLED!=='true')return;if(!this.enabled)throw Error('Web Push requires all VAPID settings');webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);this.timer=setInterval(()=>void this.tick(),15000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async send(device:{endpoint:string;p256dh:string;auth:string},count:number){if(!this.enabled)throw new ServiceUnavailableException('Background notifications are not configured yet');if(!allowedPushEndpoint(device.endpoint))throw new BadRequestException('Unsupported push service');await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify({body:count?'New activity on FpiUpdates. Open your notifications to catch up.':'Background notifications are connected.'}),{TTL:300,urgency:'normal',timeout:10000});}
 async tick(){if(this.running||!this.enabled)return;this.running=true;try{
  const devices=await this.db.pushDevice.findMany({where:{nextAttempt:{lte:new Date()}},orderBy:{nextAttempt:'asc'},take:50});
  for(const d of devices){const now=new Date();const claim=await this.db.pushDevice.updateMany({where:{id:d.id,nextAttempt:{lte:now}},data:{nextAttempt:new Date(Date.now()+60000)}});if(!claim.count)continue;
   if(!await this.db.session.findFirst({where:{id:d.sessionId,userId:d.userId,expiresAt:{gt:now},user:{status:'ACTIVE'}},select:{id:true}})){await this.db.pushDevice.deleteMany({where:{id:d.id}});continue;}
   const through=new Date(Date.now()-2000);
   const count=await this.db.notification.count({where:{AND:[notificationVisibility(d.userId),{readAt:null,createdAt:{gt:d.cursor,lte:through}}]}});
   try{if(count)await this.send(d,count);await this.db.pushDevice.updateMany({where:{id:d.id},data:{cursor:through,failures:0,nextAttempt:new Date(Date.now()+15000)}});}catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await this.db.pushDevice.deleteMany({where:{id:d.id}});else{await this.db.pushDevice.updateMany({where:{id:d.id},data:{failures:{increment:1},nextAttempt:new Date(Date.now()+Math.min(3600000,30000*2**Math.min(d.failures,7)))}});this.logger.warn('Push delivery deferred; endpoint and payload withheld');}}
  }
 }catch{this.logger.warn('Push dispatch unavailable; retrying next cycle');}finally{this.running=false;}}
}
@Controller('push')
export class PushController {
 constructor(private readonly db:Database,private readonly push:PushService){}
 @Get('config') config(){return {enabled:this.push.enabled,publicKey:this.push.enabled?process.env.VAPID_PUBLIC_KEY:null};}
 @Put('subscription') @UseGuards(SessionGuard) async subscribe(@Body()d:DeviceDto,@Req()req:AuthRequest){if(!this.push.enabled)throw new ServiceUnavailableException('Background notifications are not configured yet');if(!allowedPushEndpoint(d.endpoint))throw new BadRequestException('Unsupported push service');try{ECDH.convertKey(Buffer.from(d.p256dh,'base64url'),'prime256v1');}catch{throw new BadRequestException('Invalid push encryption key');}const existing=await this.db.pushDevice.findUnique({where:{endpoint:d.endpoint}});if(!existing&&await this.db.pushDevice.count({where:{userId:req.account.id}})>=10)throw new BadRequestException('Ten notification devices are already connected');return this.db.pushDevice.upsert({where:{endpoint:d.endpoint},create:{...d,userId:req.account.id,sessionId:req.sessionId},update:{...d,userId:req.account.id,sessionId:req.sessionId,cursor:new Date(),failures:0,nextAttempt:new Date()},select:{id:true}});}
 @Delete('subscription') @UseGuards(SessionGuard) async remove(@Body()d:EndpointDto,@Req()req:AuthRequest){await this.db.pushDevice.deleteMany({where:{endpoint:d.endpoint,userId:req.account.id}});return {ok:true};}
 @Post('test') @UseGuards(SessionGuard) async test(@Body()d:EndpointDto,@Req()req:AuthRequest){const device=await this.db.pushDevice.findFirst({where:{endpoint:d.endpoint,userId:req.account.id,sessionId:req.sessionId}});if(!device)throw new BadRequestException('Enable background notifications on this device first');await this.push.send(device,0);return {sent:true};}
}
@Controller('installation')
export class InstallationController {
 constructor(private readonly db:Database){}
 @Post('observe') @UseGuards(BrowserOriginGuard) async observe(@Body()d:InstallDto,@Req()req:{headers:Record<string,string|undefined>}){if(req.headers.dnt==='1'||req.headers['sec-gpc']==='1')return {ok:true};await this.db.installObservation.upsert({where:{id:d.id},create:{id:d.id,platform:d.platform,confirmed:d.event==='installed',launches:d.event==='launch'?1:0},update:{lastSeen:new Date(),...(d.event==='installed'?{confirmed:true}:{launches:{increment:1}})}});return {ok:true};}
 @Get('summary') @UseGuards(SessionGuard,PermissionGuard) @RequirePermission('analytics.view') async summary(){const [platforms,active,pushDevices]=await Promise.all([this.db.installObservation.groupBy({by:['platform'],_count:{_all:true},_sum:{launches:true}}),this.db.installObservation.count({where:{lastSeen:{gte:new Date(Date.now()-30*86400000)}}}),this.db.pushDevice.count()]);return {platforms,activeObserved30d:active,pushDevices,notice:'Observed browser installations, not exact devices. Reinstalls, browser storage resets and opt-outs affect totals.'};}
}
class PublicPageQuery { @IsString() @MaxLength(200) @Matches(/^\/(?!\/)[a-zA-Z0-9_/-]*$/) path!:string; }
@Controller('public')
export class PublicMetadataController {constructor(private readonly db:Database){} @Get('page') page(@Query()q:PublicPageQuery){return publicPage(this.db,q.path);}}
