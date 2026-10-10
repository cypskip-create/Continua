import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ImageViewer } from './ImageViewer';

export interface PostPoll { question: string; options: string[]; endsAt?: string; durationHours?: number }
export function PostAttachments({ post }: { post: { id: string; image_url?: string | null; image_urls?: string[]; poll?: PostPoll | null } }) {
  const images = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  const [viewer, setViewer] = useState(false);
  const [selected, setSelected] = useState(0);
  return <div onClick={event => event.stopPropagation()}>
    {!!images.length && <div className={`grid gap-2 my-3 overflow-hidden ${images.length === 1 ? 'grid-cols-1 rounded-xl' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {images.slice(0, 3).map((src,index) => <button key={src + index} aria-label={`Open image ${index + 1} of ${images.length}`} onClick={() => { setSelected(index); setViewer(true); }} className={`relative overflow-hidden rounded-xl ${images.length > 1 ? 'aspect-square' : ''}`}>
        <img src={src} alt={`Post image ${index + 1}`} loading="lazy" className={`w-full h-full object-cover ${images.length === 1 ? 'max-h-96' : ''}`} />
        {index === 2 && images.length > 3 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-3xl font-semibold">+{images.length - 3}</span>}
      </button>)}
    </div>}
    {viewer && <ImageViewer open={viewer} onOpenChange={setViewer} images={images} initialIndex={selected} />}
    {post.poll && <PostPollView postId={post.id} poll={post.poll} />}
  </div>;
}

function PostPollView({ postId, poll }: { postId: string; poll: PostPoll }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['continua','post-poll',user?.id,postId];
  const [busy,setBusy] = useState(false);
  const query = useQuery({ queryKey:key, enabled:!!user, staleTime:15000, queryFn:async () => {
    const {data,error} = await supabase.rpc('post_poll_result' as never,{p_post_id:postId} as never);
    if(error) throw error;
    return data as unknown as {counts:number[];choice:number|null};
  }});
  const counts = query.data?.counts ?? poll.options.map(() => 0);
  const total = counts.reduce((sum,n)=>sum+n,0);
  const ended = !!poll.endsAt && Date.parse(poll.endsAt) <= Date.now();
  const voted = query.data?.choice != null;
  const vote = async (choice:number) => {
    if(busy || voted || ended) return;
    if(!user) { toast.error('Sign in to vote'); return; }
    setBusy(true);
    try {
      const {data,error} = await supabase.rpc('post_poll_result' as never,{p_post_id:postId,p_choice:choice} as never);
      if(error) throw error;
      client.setQueryData(key,data);
      toast.success('Vote recorded');
    } catch { toast.error('Could not record your vote. Please retry.'); }
    finally { setBusy(false); }
  };
  return <section className="my-3 space-y-2" aria-label="Post poll">
    <h3 className="text-base font-semibold">{poll.question}</h3><p className="text-xs text-muted-foreground">Single answer</p>
    {poll.options.map((option,index) => <button key={index} disabled={busy || voted || ended || query.isLoading || query.isError} onClick={()=>void vote(index)} className="relative flex w-full justify-between overflow-hidden rounded-md border px-3 py-3 text-left text-sm">
      {(voted || ended) && <span className="absolute inset-y-0 left-0 bg-primary/15" style={{width:`${total ? counts[index]/total*100 : 0}%`}} />}
      <span className="relative">{option}{query.data?.choice === index ? ' ✓' : ''}</span>
      {(voted || ended) && <span className="relative">{total ? Math.round(counts[index]/total*100) : 0}%</span>}
    </button>)}
    <p className="text-xs text-muted-foreground">{query.isError ? 'Poll unavailable. Pull to refresh.' : `${total} votes · ${ended ? 'Ended' : poll.endsAt ? `Closes ${new Date(poll.endsAt).toLocaleString()}` : 'Open'}`}</p>
  </section>;
}
