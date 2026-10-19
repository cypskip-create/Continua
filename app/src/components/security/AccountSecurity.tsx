import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {recentAuthentication} from '@/lib/recentAuthentication';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {AuthBotCheck,AUTH_BOT_CHECK_CONFIGURED} from './AuthBotCheck';

export function AccountSecurity(){
 const {user,session}=useAuth();const [factor,setFactor]=useState<string>(),[setup,setSetup]=useState<{id:string;qr:string;secret:string}>(),[code,setCode]=useState(''),[password,setPassword]=useState(''),[email,setEmail]=useState(''),[captcha,setCaptcha]=useState(''),[captchaAttempt,setCaptchaAttempt]=useState(0);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[recent,setRecent]=useState(false);
 const load=async()=>{const {data,error}=await supabase.auth.mfa.listFactors();if(error)throw error;setFactor(data.totp.find(f=>f.status==='verified')?.id);};
 useEffect(()=>{void load().catch(()=>setMessage('Security settings could not load. Retry after signing in.'));},[user?.id]);
 const act=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'This change could not complete. Please retry.');}finally{setBusy(false);}};
 const reauthenticate=()=>act(async()=>{if(!user?.email)throw Error('Sign in again first.');const id=user.id;const {data,error}=await supabase.auth.signInWithPassword({email:user.email,password,options:{captchaToken:captcha||undefined}});setPassword('');setCaptcha('');setCaptchaAttempt(v=>v+1);if(error||data.user?.id!==id)throw Error('Sign-in could not be verified. Check your password and bot verification.');setRecent(true);setMessage('Recent sign-in verified.');});
 const recovery=()=>act(async()=>{if(!user?.email)throw Error('Sign in first.');const {error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:window.location.origin+'/auth',captchaToken:captcha||undefined});setCaptcha('');setCaptchaAttempt(v=>v+1);if(error)throw error;setMessage('Check your verified email for a password reset link.');});
 const enroll=()=>act(async()=>{const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Continua authenticator'});if(error)throw error;setSetup({id:data.id,qr:data.totp.qr_code,secret:data.totp.secret});});
 const verify=()=>act(async()=>{const id=setup?.id??factor;if(!id)throw Error('Choose an authenticator first.');const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:id,code});if(error)throw Error('Authenticator code could not be verified.');setCode('');setSetup(undefined);setRecent(true);await load();setMessage('Two-step verification confirmed.');});
 const remove=()=>act(async()=>{if(!factor||!/^\d{6}$/.test(code))throw Error('Enter your current authenticator code.');const challenge=await supabase.auth.mfa.challengeAndVerify({factorId:factor,code});if(challenge.error)throw Error('Authenticator code could not be verified.');const result=await supabase.auth.mfa.unenroll({factorId:factor});if(result.error)throw result.error;setCode('');await load();setMessage('Authenticator removed.');});
 const changeEmail=()=>act(async()=>{const {error}=await supabase.auth.updateUser({email:email.trim()});if(error)throw error;setEmail('');setMessage('Check your email inboxes to confirm the address change. Your current address remains active until confirmation completes.');});
 return <section aria-label="Account security" className="space-y-4 rounded-xl border p-4"><h2 className="font-semibold">Account security</h2>
  <p className="text-xs text-muted-foreground">Your device App Lock protects this screen. Two-step verification protects your account sign-in.</p>
  <label className="block text-sm">Confirm your current password<Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <AuthBotCheck key={captchaAttempt} onToken={setCaptcha}/><Button type="button" variant="outline" disabled={busy||!password||(AUTH_BOT_CHECK_CONFIGURED&&!captcha)} onClick={reauthenticate}>Verify recent sign-in</Button><Button type="button" variant="outline" disabled={busy||(AUTH_BOT_CHECK_CONFIGURED&&!captcha)} onClick={recovery}>Email me a password reset link</Button>
  <p className="text-xs text-muted-foreground">For Google-only accounts, sign out and sign in with Google again before making sensitive changes. Keep access to your verified email for recovery.</p>
  <p className="text-sm">Authenticator: {factor?'Enabled':'Not enabled'}</p>
  {!factor&&!setup&&<Button type="button" disabled={busy||!(recent||recentAuthentication(session?.access_token))} onClick={enroll}>Set up two-step verification</Button>}
  {setup&&<div className="space-y-2"><p className="text-sm">Scan with your authenticator, then verify a code. Keep the setup secret private.</p><img alt="Authenticator setup QR code" className="h-48 w-48" src={setup.qr}/><details><summary>Manual setup secret</summary><code className="break-all text-xs">{setup.secret}</code></details></div>}
  {(factor||setup)&&<><label className="block text-sm">Authenticator code<Input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><Button type="button" disabled={busy||code.length!==6} onClick={verify}>Verify code</Button>{factor&&<Button type="button" variant="outline" disabled={busy||code.length!==6} onClick={remove}>Remove authenticator</Button>}</>}
  <label className="block text-sm">New email address<Input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><Button type="button" variant="outline" disabled={busy||!email||!(recent||recentAuthentication(session?.access_token))} onClick={changeEmail}>Request email change</Button>
  <p className="text-xs text-muted-foreground">Sensitive changes require a recent verified sign-in. If you lose your authenticator, use the account recovery/support process; a local screen unlock does not bypass verification.</p>
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
