import {createHash} from 'node:crypto';
import nodemailer from 'nodemailer';
const subjects={'verify-email':'Verify your Continua email','confirm-email-change':'Confirm your Continua email change','password-recovery':'Reset your Continua password'};
const emailPattern=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function createBrevoAuthMail({enabled=false,smtpUser,smtpKey,sender,authOrigin,database,transportFactory=nodemailer.createTransport}) {
 let transport;
 return async function sendAuthMail({kind,to,url}) {
  if(enabled!==true)throw Error('Authentication email delivery has not been activated');
  if(!subjects[kind]||!emailPattern.test(to??'')||!emailPattern.test(sender??'')||typeof smtpKey!=='string'||!smtpKey||typeof smtpUser!=='string'||!smtpUser||!database)throw Error('Authentication email configuration is incomplete');
  const link=new URL(url),recovery=new URLSearchParams(link.hash.slice(1));
  const validPath=kind==='password-recovery'?link.pathname==='/auth'&&!link.search&&[...recovery.keys()].length===1&&/^[A-Za-z0-9_-]{8,256}$/.test(recovery.get('recovery_token')??''):/^\/api\/auth\/verify-email$/.test(link.pathname)&&!link.hash;
  if(link.origin!==new URL(authOrigin).origin||link.protocol!=='https:'||link.username||link.password||!validPath)throw Error('Invalid authentication email link');
  const reservation=await database.query(`INSERT INTO app_identity.daily_email_budget(day,attempts) VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET attempts=app_identity.daily_email_budget.attempts+1 WHERE app_identity.daily_email_budget.attempts<250 RETURNING attempts`);
  if(!reservation.rowCount)throw Error('Daily authentication email allowance reached');
  const idempotency=createHash('sha256').update(kind+'\0'+to+'\0'+link.href).digest('hex');
  transport??=transportFactory({host:'smtp-relay.brevo.com',port:2525,secure:false,requireTLS:true,
   tls:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername:'smtp-relay.brevo.com'},
   auth:{user:smtpUser,pass:smtpKey},pool:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
   logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,maxRecipients:1});
  try{const result=await transport.sendMail({from:{name:'Continua',address:sender},to:{address:to},
   subject:subjects[kind],text:subjects[kind]+'\n\n'+link.href+'\n\nIf you did not request this, you can ignore this message.',
   messageId:'<'+idempotency+'@continua-auth.invalid>',disableFileAccess:true,disableUrlAccess:true});
   if(result.rejected?.length||!result.accepted?.length)throw Error('not accepted');
  }catch{throw Error('Authentication email delivery is temporarily unavailable');}
 };
}
