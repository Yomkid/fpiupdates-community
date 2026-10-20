import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
export type MediaLocation={storageProvider:string;storageBucket:string|null;storageKey:string|null};
export const mediaDirectory=()=>resolve(process.env.MEDIA_DIRECTORY||'.uploads');
let client:S3Client|undefined;
function r2(){
 const account=process.env.R2_ACCOUNT_ID;const accessKeyId=process.env.R2_ACCESS_KEY_ID;const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
 if(!account||!/^[a-f0-9]{32}$/i.test(account)||!accessKeyId||!secretAccessKey)throw new Error('R2 storage configuration is incomplete');
 return client??=new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey},maxAttempts:2,requestHandler:{connectionTimeout:5000,requestTimeout:15000}});
}
export async function storeImage(id:string,data:Buffer):Promise<MediaLocation>{
 const provider=process.env.MEDIA_STORAGE_PROVIDER||'local';
 if(provider==='local'){await mkdir(mediaDirectory(),{recursive:true,mode:0o700});await writeFile(join(mediaDirectory(),id+'.webp'),data,{flag:'wx',mode:0o600});return {storageProvider:'local',storageBucket:null,storageKey:null};}
 if(provider!=='r2')throw new Error('Unknown media storage provider');
 const bucket=process.env.R2_BUCKET;if(!bucket||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw new Error('Set a valid R2_BUCKET');
 const key='images/'+id+'.webp';await r2().send(new PutObjectCommand({Bucket:bucket,Key:key,Body:data,ContentType:'image/webp'}));return {storageProvider:'r2',storageBucket:bucket,storageKey:key};
}
export async function loadImage(id:string,location:MediaLocation):Promise<Buffer>{
 if(location.storageProvider==='local')return readFile(join(mediaDirectory(),id+'.webp'));
 if(location.storageProvider!=='r2'||!location.storageBucket||!location.storageKey)throw new Error('Invalid media location');
 const result=await r2().send(new GetObjectCommand({Bucket:location.storageBucket,Key:location.storageKey}));if(!result.Body)throw new Error('Image unavailable');return Buffer.from(await result.Body.transformToByteArray());
}
export async function removeStoredImage(id:string,location:MediaLocation){
 if(location.storageProvider==='local')return unlink(join(mediaDirectory(),id+'.webp'));
 if(location.storageProvider!=='r2'||!location.storageBucket||!location.storageKey)throw new Error('Invalid media location');
 await r2().send(new DeleteObjectCommand({Bucket:location.storageBucket,Key:location.storageKey}));
}
