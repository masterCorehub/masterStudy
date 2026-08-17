import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return response({ error: "AUTH_REQUIRED" }, 401);

    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE_MY_ACCOUNT") {
      return response({ error: "CONFIRMATION_REQUIRED" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return response({ error: "SERVER_NOT_CONFIGURED" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return response({ error: "AUTH_INVALID" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = userData.user.id;

    const { data: ownedWorkspaces, error: workspaceError } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId);
    if (workspaceError) throw workspaceError;

    const fileQueries = [
      admin.from("file_objects").select("object_path").eq("owner_id", userId),
      ...(ownedWorkspaces || []).map((workspace) =>
        admin.from("file_objects").select("object_path").eq("workspace_id", workspace.id),
      ),
    ];
    const fileResults = await Promise.all(fileQueries);
    const paths = [
      ...new Set(
        fileResults.flatMap((result) => {
          if (result.error) throw result.error;
          return (result.data || []).map((file) => file.object_path).filter(Boolean);
        }),
      ),
    ];

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    const cleanupErrors: string[] = [];
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage
        .from("studyhub-files")
        .remove(paths.slice(index, index + 100));
      if (error) cleanupErrors.push(error.message);
    }

    return response({
      deleted: true,
      storageCleanupPending: cleanupErrors.length > 0,
    });
  } catch (error) {
    console.error("StudyHub account deletion failed", error);
    return response(
      {
        error: "ACCOUNT_DELETE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
