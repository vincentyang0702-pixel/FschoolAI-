// auth.ts — legacy SHA-256 signin / signup against the public.users table.
// Identity = the users row's text `id`, which callers store in localStorage as
// fschool_uid. Mirrors the inline flow in App.tsx. No Supabase Auth / GoTrue.

import { supabase } from './supabase';

async function sha256Hex(str: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Verify credentials against the legacy password_hash and return the profile row. */
export async function signIn(email, password) {
  const e = email.toLowerCase().trim();
  const password_hash = await sha256Hex(password);
  const { data: user } = await supabase
    .from('users').select('id, name, school')
    .eq('email', e).eq('password_hash', password_hash).maybeSingle();
  if (!user) throw new Error('Incorrect email or password.');
  return user;
}

/** Create a public.users row with the legacy SHA-256 hash. Returns the new profile id. */
export async function signUp({ name, email, password }) {
  const e = email.toLowerCase().trim();
  const password_hash = await sha256Hex(password);
  const { data: existing } = await supabase
    .from('users').select('id').eq('email', e).maybeSingle();
  if (existing) throw new Error('An account with this email already exists. Please sign in instead.');
  const id = crypto.randomUUID();
  const { error } = await supabase.from('users').insert({ id, name, email: e, password_hash });
  if (error) throw new Error('Could not create your account.');
  return id;
}
