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

  let { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (!profile) {
    const { data: profileFallback } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();
    profile = profileFallback || profile;
  }

  if (!profile) {
    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({ username })
      .select('id')
      .single();
    if (!createError && created) {
      return created.id;
    }

    const { data: retryProfile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();
    profile = retryProfile || profile;
  }

  return profile?.id || null;
}
