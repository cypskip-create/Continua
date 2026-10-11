export type ResearchAccessState = 'loading' | 'unavailable' | 'paid' | 'free';
export function researchAccessState(input:{signedIn:boolean;loading:boolean;plan?:string|null;expiresAt?:string|null;hasProfile:boolean;error?:unknown},now=Date.now()):ResearchAccessState {
  if(input.loading)return 'loading';
  if(input.signedIn&&!input.hasProfile)return 'unavailable';
  const expires=input.expiresAt?Date.parse(input.expiresAt):null;
  if(input.signedIn && ['premium','premium_plus'].includes(input.plan??'') &&
    (expires===null || (Number.isFinite(expires)&&expires>now)))return 'paid';
  return 'free';
}
