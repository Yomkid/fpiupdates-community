import nodemailer from 'nodemailer';
import {OAuth2Client} from 'google-auth-library';
export type EmailMessage={to:string;subject:string;text:string};
// Keep mail-sending consent separate from members' Google sign-in consent.
export async function deliverEmail(message:EmailMessage){
 const transport=process.env.EMAIL_TRANSPORT??'smtp';
 if(transport==='gmail-api'){
  const {GMAIL_CLIENT_ID:clientId,GMAIL_CLIENT_SECRET:clientSecret,GMAIL_REFRESH_TOKEN:refreshToken,SMTP_FROM:from}=process.env;
  if(!clientId||!clientSecret||!refreshToken||!from)throw new Error('Gmail API configuration is incomplete');
  const mime=await nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'}).sendMail({from,...message});
  if(!Buffer.isBuffer(mime.message))throw new Error('Unable to prepare email');
  const client=new OAuth2Client({clientId,clientSecret});client.setCredentials({refresh_token:refreshToken});
  await client.request({url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',method:'POST',data:{raw:mime.message.toString('base64url')},timeout:15000,retry:false});return;
 }
 if(transport!=='smtp')throw new Error('Unknown email transport');
 if(!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw new Error('Missing SMTP configuration');
 const port=Number(process.env.SMTP_PORT??587);
 const sender=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,connectionTimeout:10000,socketTimeout:15000,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
 await sender.sendMail({from:process.env.SMTP_FROM,...message});
}
