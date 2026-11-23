/**
 * One-time bootstrap: create the first admin (DATABASE_SCHEMA profiles, D2).
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… npm run create-admin
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
 * (load .env.local first, e.g. `node --env-file=.env.local`). Never hard-code values.
 * When ADMIN_PASSWORD is empty and this runs in a terminal, the password is asked for twice
 * without echo, so it never has to be written into an env file. It is never printed.
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

/** Reads one line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve) => {
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          done();
          return resolve(value);
        }
        if (c === "\u0003") {
          done();
          process.exit(130); // Ctrl-C
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function adminPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) {
    console.error("Missing env var ADMIN_PASSWORD (or run in a terminal to be asked for it)");
    process.exit(1);
  }
  const first = await promptHidden("Admin password (min 10 characters, not shown): ");
  const second = await promptHidden("Repeat the password: ");
  if (first !== second) {
    console.error("The two passwords differ — nothing was created.");
    process.exit(1);
  }
  return first;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const email = required("ADMIN_EMAIL").toLowerCase();
  const fullName = required("ADMIN_NAME");
  const password = await adminPassword();
  if (password.length < 10) {
    console.error("ADMIN_PASSWORD must be at least 10 characters");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count, error: countError } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (countError || count === null) {
    console.error(`Could not read existing accounts (check the URL and service key): ${countError?.message ?? "no count returned"}`);
    process.exit(1);
  }
  if (count > 0) {
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
