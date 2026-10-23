import {useState} from 'react';
import {supabase} from '@/integrations/continua/browserClient';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

// A challenge is deliberately separate from an authenticated user/session.
export function PendingAuthenticator(){
 const {signOut}=useAuth();
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function verify(event){
  event.preventDefault();if(busy||!/^\d{6}$/.test(code))return;
  setBusy(true);setMessage('');
  try{const {error}=await supabase.auth.mfa.challengeAndVerify({code});if(error)throw error;setCode('');}
  catch{setMessage('That code could not be verified. Use the latest authenticator code or start sign-in again.');}
  finally{setBusy(false);}
 }
 return <main className="min-h-screen grid place-items-center p-6"><form onSubmit={verify} className="w-full max-w-sm space-y-4 rounded-2xl border p-6">
  <h1 className="text-xl font-semibold">Two-step verification</h1>
  <p className="text-sm text-muted-foreground">Enter the six-digit code from your authenticator to continue.</p>
  <label htmlFor="pending-totp" className="text-sm">Authenticator code</label>
  <Input id="pending-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/>
  <Button className="w-full" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify'}</Button>
  {message&&<p role="alert" className="text-sm">{message}</p>}
  <Button variant="outline" type="button" className="w-full" disabled={busy} onClick={()=>void signOut().catch(()=>setMessage('Sign-out could not complete. Please retry.'))}>Cancel sign-in</Button>
 </form></main>;
}
