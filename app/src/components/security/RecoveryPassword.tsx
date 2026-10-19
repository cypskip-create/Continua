import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function RecoveryPassword(){
 const {signOut}=useAuth();const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[nonce,setNonce]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(busy||password.length<12||password!==confirm)return;setBusy(true);setMessage('');
  const {error}=await supabase.auth.updateUser({password,...(nonce?{nonce}: {})});setBusy(false);
  if(error){setMessage(error.message);return;}setPassword('');setConfirm('');setMessage('Password updated. Sign out, then sign in with your new password.');
 };
 const sendNonce=async()=>{const {error}=await supabase.auth.reauthenticate();setMessage(error?'The confirmation code could not be sent. Retry shortly.':'Check your verified email for a confirmation code.');};
 return <main className="min-h-screen grid place-items-center p-6"><form className="w-full max-w-sm space-y-4 rounded-2xl border p-6" onSubmit={save}><h1 className="text-xl font-semibold">Choose a new password</h1><p className="text-sm text-muted-foreground">Use at least 12 characters and a password you do not use elsewhere.</p>
  <label className="block text-sm">New password<Input type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <label className="block text-sm">Confirm new password<Input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
  <details><summary className="cursor-pointer text-sm">Email confirmation code, if requested</summary><Button type="button" variant="outline" onClick={()=>void sendNonce()}>Send confirmation code</Button><Input aria-label="Password change confirmation code" autoComplete="one-time-code" value={nonce} onChange={e=>setNonce(e.target.value)}/></details>
  <Button className="w-full" disabled={busy||password.length<12||password!==confirm}>{busy?'Updating…':'Update password'}</Button>{message&&<p role="status" className="text-sm">{message}</p>}
  <Button type="button" variant="outline" className="w-full" onClick={()=>void signOut().catch(()=>setMessage('Sign-out could not complete. Please retry.'))}>Sign out</Button>
 </form></main>;
}
