// auth.ts — sign-in / sign-up via Supabase Auth (GoTrue), with lazy migration of legacy
// SHA-256 accounts. Establishes a real session (so `auth.uid()` is available for RLS) and
// returns the public.users profile. App identity stays the profile's text `id` (fschool_uid).
//
// • New signup  → POST /api/auth-migrate?action=signup  (creates GoTrue user + profile),
//                  then signInWithPassword to start the session.
// • Login       → signInWithPassword. If it fails, the account may be a pre-Auth legacy row
//                  (password_hash, no auth_id): POST /api/auth-migrate?action=migrate verifies
//                  the old hash + creates the GoTrue user, then we retry. A genuinely wrong
//                  password makes migrate fail too → same "incorrect" error (no user enumeration).

import { supabase } from './supabase';

export type Profile = { id: string; name?: string; school?: string };

/** The public.users profile for the current GoTrue session (mapped via auth_id). */
export async function currentProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase
    .from('users').select('id, name, school')
    .eq('auth_id', session.user.id).maybeSingle();
  return (data as Profile) ?? null;
}

/** Sign in via Supabase Auth, lazily migrating a pre-Auth account if needed. */
export async function signIn(email: string, password: string): Promise<Profile> {
  const e = (email || '').toLowerCase().trim();

  let { error } = await supabase.auth.signInWithPassword({ email: e, password });

  if (error) {
    // Legacy account not yet in GoTrue → migrate (verifies the old SHA-256 hash
    // server-side), then retry. Wrong password makes migrate fail too → same error.
    const mig = await fetch('/api/auth-migrate?action=migrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password }),
    });
    if (!mig.ok) throw new Error('Incorrect email or password.');
    ({ error } = await supabase.auth.signInWithPassword({ email: e, password }));
    if (error) throw new Error('Incorrect email or password.');
  }

  const profile = await currentProfile();
  if (!profile) throw new Error('Signed in, but no profile was found for this account.');
  return profile;
}

/** Create a Supabase Auth account + profile (server-side), then establish the session. */
export async function signUp({ name, email, password }: { name: string; email: string; password: string }): Promise<Profile> {
  const e = (email || '').toLowerCase().trim();

  const res = await fetch('/api/auth-migrate?action=signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: e, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create your account.');

  const { error } = await supabase.auth.signInWithPassword({ email: e, password });
  if (error) throw new Error('Account created — please sign in.');

  return { id: data.userId, name };
}

export async function signOut(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* clear local state regardless */ }
}
