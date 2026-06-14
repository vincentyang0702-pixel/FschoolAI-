// auth.js — signup / signin via Supabase Auth (GoTrue, bcrypt).
// NOTE: App.jsx implements its own auth inline (handleEnter) — these helpers mirror
// that flow for any other caller. Identity = public.users row keyed by auth_id; the
// app keys app data on the profile's text `id`, restored to localStorage as fschool_uid.

import { supabase } from './supabase.js';

/** Verify credentials and return the profile row. Lazy-migrates pre-Auth accounts. */
export async function signIn(email, password) {
  const e = email.toLowerCase().trim();
  let { error } = await supabase.auth.signInWithPassword({ email: e, password });
  if (error) {
    const res = await fetch('/api/auth-migrate?action=migrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password }),
    });
    if (!res.ok) throw new Error('Incorrect email or password.');
    ({ error } = await supabase.auth.signInWithPassword({ email: e, password }));
    if (error) throw new Error('Incorrect email or password.');
  }
  const { data: { session } } = await supabase.auth.getSession();
  const { data: user } = await supabase
    .from('users').select('id, name, school').eq('auth_id', session.user.id).maybeSingle();
  if (!user) throw new Error('Incorrect email or password.');
  return user;
}

/** Create a GoTrue user + public.users profile (server-side). Returns the profile id. */
export async function signUp({ name, email, password }) {
  const e = email.toLowerCase().trim();
  const res = await fetch('/api/auth-migrate?action=signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: e, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not create your account.');
  await supabase.auth.signInWithPassword({ email: e, password });
  return body.userId;
}
