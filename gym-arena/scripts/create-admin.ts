/**
 * One-time bootstrap: create the first admin (DATABASE_SCHEMA profiles, D2).
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… npm run create-admin
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
 * (load .env.local first, e.g. `node --env-file=.env.local`). Never hard-code values.
 */
import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const fullName = required("ADMIN_NAME");
  if (password.length < 10) {
    console.error("ADMIN_PASSWORD must be at least 10 characters");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) > 0) {
    console.error("An admin already exists — refusing to create another. (This script is one-time.)");
    process.exit(1);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    console.error(`Failed to create auth user: ${error?.message ?? "unknown error"}`);
    process.exit(1);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, full_name: fullName, role: "admin", is_active: true });
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
    console.error(`Failed to create profile (auth user rolled back): ${profileError.message}`);
    process.exit(1);
  }

  console.log(`Admin created: ${email}`);
}

void main();
