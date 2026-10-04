-- Preserve existing reactions while expanding the post and comment palette.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.post_reactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%reaction%'
  LOOP
    EXECUTE format('ALTER TABLE public.post_reactions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.post_reactions ADD CONSTRAINT post_reactions_reaction_check
  CHECK (reaction IN (
    'insightful','bullish','bearish','strong_hold','watch','fire','laugh','love',
    'thumbs_up','thumbs_down',
    'celebrate','trophy','heartbreak','shocked','thinking','cant_look','hopeful','mind_blown','cool','shark',
    'cautious','support','disagree',
    'rocket','diamond_hands','agree','question','warning','thank_you','sad','angry'
  ));

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.comment_reactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%reaction%'
  LOOP
    EXECUTE format('ALTER TABLE public.comment_reactions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.comment_reactions ADD CONSTRAINT comment_reactions_reaction_check
  CHECK (reaction IN (
    'insightful','bullish','bearish','strong_hold','watch','fire','laugh','love',
    'thumbs_up','thumbs_down',
    'celebrate','trophy','heartbreak','shocked','thinking','cant_look','hopeful','mind_blown','cool','shark',
    'cautious','support','disagree',
    'rocket','diamond_hands','agree','question','warning','thank_you','sad','angry'
  ));
