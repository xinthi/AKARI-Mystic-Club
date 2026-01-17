import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function resolveProfileId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string | null> {
  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  const username = xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
  if (!username) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  return profile?.id || null;
}
