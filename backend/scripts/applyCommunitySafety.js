import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
dotenv.config({ path: '.env.local', quiet: true });
const version = '20261012030000', name = 'community_safety';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
let active = false;
async function asUser(id) { await client.query('RESET ROLE'); await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated' })]); await client.query('SET LOCAL ROLE authenticated'); }
async function denied(sql, args) { await client.query('SAVEPOINT denied_probe'); let failed = false; try {
    await client.query(sql, args);
}
catch {
    failed = true;
} await client.query('ROLLBACK TO SAVEPOINT denied_probe'); if (!failed)
    throw new Error('Expected access rejection'); }
try {
    if (!process.env.DATABASE_URL)
        throw new Error('Database not configured');
    await client.connect();
    await client.query('BEGIN');
    active = true;
    await client.query('SELECT pg_advisory_xact_lock(20261012,30000)');
    const prior = await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1', [version]);
    if (!prior.rowCount) {
        const sql = await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, name, [sql]]);
    }
    // All synthetic accounts, posts, reports and relationship changes roll back.
    await client.query('SAVEPOINT fixture_probe');
    const a = randomUUID(), b = randomUUID(), c = randomUUID(), post = randomUUID();
    for (const id of [a, b, c])
        await client.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)", [id, `safety-${id}@example.invalid`, JSON.stringify({ full_name: 'Safety regression fixture' })]);
    await client.query('INSERT INTO public.posts(id,user_id,content) VALUES($1,$2,$3)', [post, b, 'Synthetic safety regression post']);
    await asUser(a);
    await client.query('INSERT INTO public.user_follows(follower_id,following_id) VALUES($1,$2)', [a, b]);
    await client.query("SELECT public.community_submit_report('post',$1,'Spam or scam','Synthetic probe')", [post]);
    await client.query("SELECT public.community_submit_report('post',$1,'Spam or scam','Retry')", [post]);
    await client.query("SELECT public.community_submit_report('user',$1,'Harassment or hate','Synthetic probe')", [b]);
    await denied("SELECT public.community_submit_report('user',$1,'Other','')", [a]);
    await client.query("SELECT public.community_set_safety($1,'block',true)", [b]);
    await client.query("SELECT public.community_set_safety($1,'block',true)", [b]);
    const visible = await client.query('SELECT id FROM public.posts WHERE id=$1', [post]);
    if (visible.rowCount)
        throw new Error('Blocked post visible');
    await denied('INSERT INTO public.post_reactions(post_id,user_id,reaction) VALUES($1,$2,$3)', [post, a, 'bullish']);
    await denied('INSERT INTO public.post_comments(post_id,user_id,content) VALUES($1,$2,$3)', [post, a, 'Blocked comment']);
    await denied('INSERT INTO public.user_follows(follower_id,following_id) VALUES($1,$2)', [a, b]);
    await asUser(b);
    const reverse = await client.query('SELECT public.community_can_interact($1) AS allowed', [a]);
    if (reverse.rows[0].allowed)
        throw new Error('Reverse block not enforced');
    await asUser(c);
    const reports = await client.query('SELECT id FROM public.account_reports');
    if (reports.rowCount)
        throw new Error('Reports leaked');
    await client.query('RESET ROLE');
    const count = await client.query('SELECT count(*)::int AS n FROM public.post_reports WHERE post_id=$1', [post]);
    if (count.rows[0].n !== 1)
        throw new Error('Duplicate report created');
    const follows = await client.query('SELECT 1 FROM public.user_follows WHERE follower_id=$1 AND following_id=$2', [a, b]);
    if (follows.rowCount)
        throw new Error('Blocked follow retained');
    await asUser(a);
    await client.query("SELECT public.community_set_safety($1,'block',false)", [b]);
    const unblocked = await client.query('SELECT id FROM public.posts WHERE id=$1', [post]);
    if (unblocked.rowCount !== 1)
        throw new Error('Unblock did not restore visibility');
    await client.query("SELECT public.community_set_safety($1,'mute',true)", [b]);
    await client.query("SELECT public.community_set_safety($1,'mute',false)", [b]);
    await client.query('ROLLBACK TO SAVEPOINT fixture_probe');
    const apply = process.argv.includes('--apply');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    active = false;
    console.log(JSON.stringify({ migration: version, applied: apply, alreadyApplied: !!prior.rowCount, verified: true, fixturesRolledBack: true }));
}
catch (e) {
    if (active)
        await client.query('ROLLBACK').catch(() => { });
    console.log(JSON.stringify({ applied: false, errorCode: e.code ?? 'community_safety_verification_failed', stageMessage: e instanceof Error && !('code' in e) ? e.message : undefined }));
    process.exitCode = 1;
}
finally {
    await client.end().catch(() => { });
}
