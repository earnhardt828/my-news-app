import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "placeholder-anon-key";

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
) {
  console.warn("Supabase public env vars missing; using placeholder client during build/runtime bootstrap.");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
