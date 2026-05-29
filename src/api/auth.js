// auth.js — signup / signin using email + SHA-256 password hash.
// No Supabase Auth — identity is a UUID stored in localStorage.

import { supabase } from './supabase.js';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Create a new user row. Throws if email is already taken. */
export async function signUp(userId, { name, email, password }) {
  const password_hash = await sha256(password);

  // Check if email already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (existing) throw new Error('An account with this email already exists.');

  const { error } = await supabase.from('users').upsert(
    {
      id: userId,
      name,
      email:        email.toLowerCase().trim(),
      password_hash,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
}

/**
 * Verify credentials and return the stored user row.
 * Call this on login — the returned user.id should be restored to localStorage
 * so AppContext re-initialises with the correct UUID.
 */
export async function signIn(email, password) {
  const password_hash = await sha256(password);
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, school')
    .eq('email', email.toLowerCase().trim())
    .eq('password_hash', password_hash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!user) throw new Error('Incorrect email or password.');
  return user;
}

// rebuild
