import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = process.env.SUPABASE_STORAGE_BUCKET!;

console.log("SUPABASE_URL:", url);
console.log("KEY starts with:", key.slice(0, 5), "| length:", key.length);
console.log("Configured bucket:", bucket);

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.log("listBuckets ERROR:", error.message);
    return;
  }
  console.log("BUCKETS:", JSON.stringify(data?.map((b) => ({ name: b.name, public: b.public })), null, 2));
}

main().catch((e) => console.error("FATAL:", e));
