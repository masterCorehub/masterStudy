import { createClient } from "@supabase/supabase-js";
import { readAuthRedirect } from "../domain/authRedirect";
import {
  prepareStudyStateForCloud,
  cloudStateSizeBytes,
  STUDY_STATE_SCHEMA_VERSION,
} from "./account-sync";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "",
).trim();
const configuredPublicUrl = String(
  import.meta.env.VITE_PUBLIC_APP_URL || "",
).trim();

export const collaborationCloudConfigured = Boolean(url && publishableKey);

const browserOrigin = () => {
  if (configuredPublicUrl) return configuredPublicUrl.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  return /^https?:$/i.test(window.location.protocol)
    ? window.location.origin
    : "";
};

export const initialAuthRedirect = readAuthRedirect(
  typeof window !== "undefined" ? window.location : {},
);

const client = collaborationCloudConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: initialAuthRedirect.flowType,
      },
    })
  : null;

// Recovery emails must work when the request and callback use different origins.
// This client only sends emails; it neither stores a session nor reads callbacks.
const recoveryClient = collaborationCloudConfigured
  ? createClient(url, publishableKey, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "studyhub-recovery-request",
      },
    })
  : null;

const assertClient = () => {
  if (!client) {
    throw new Error("O servidor de colaboração não está configurado.");
  }
  return client;
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const missingBackendCapability = (error) =>
  ["PGRST202", "PGRST204", "42703", "42883", "42P01"].includes(error?.code) ||
  /schema cache|does not exist|could not find|unknown function/i.test(
    String(error?.message || ""),
  );

const normalizeRpcRow = (data) =>
  Array.isArray(data) ? data[0] || null : data || null;

const safeFileName = (value = "arquivo") => {
  const normalized = String(value || "arquivo")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._,'!&$@=;+?() -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 140);
  return normalized || "arquivo";
};

const createClientId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};

const fileMimeType = (file) => {
  if (file?.type && file.type !== "application/octet-stream") return file.type;
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] || "";
};

const requireSession = async (message = "Faça login para continuar.") => {
  const session = await collaborationCloud.getSession();
  if (!session?.user?.id) throw new Error(message);
  return session;
};

export const collaborationCloud = {
  isConfigured: () => collaborationCloudConfigured,

  getSession: async () => {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  },

  onAuthStateChange: (callback) => {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) =>
      callback(session, event),
    );
    return () => data.subscription.unsubscribe();
  },

  subscribeAccountState: (userId, callback) => {
    if (!client || !userId) return () => {};
    const subscriptionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = client
      .channel(`account-state-${userId}-${subscriptionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "account_state",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => callback(payload.new, payload),
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  subscribeMyInvitations: (email, callback) => {
    if (!client || !email) return () => {};
    const normalizedEmail = String(email).trim().toLowerCase();
    const channel = client
      .channel(`share-invitations-${createClientId()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "share_invitations",
          filter: `email=eq.${normalizedEmail}`,
        },
        callback,
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  subscribeSharedEntity: (sharedEntityId, callback) => {
    if (!client || !sharedEntityId) return () => {};
    const channel = client
      .channel(`shared-entity-${sharedEntityId}-${createClientId()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shared_entities",
          filter: `id=eq.${sharedEntityId}`,
        },
        (payload) => callback(payload.new, payload),
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  subscribeSharedComments: (sharedEntityId, callback) => {
    if (!client || !sharedEntityId) return () => {};
    const channel = client
      .channel(`shared-comments-${sharedEntityId}-${createClientId()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_comments",
          filter: `shared_entity_id=eq.${sharedEntityId}`,
        },
        callback,
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  subscribeInvitationForEntity: (sharedEntityId, callback) => {
    if (!client || !sharedEntityId) return () => {};
    const channel = client
      .channel(`shared-access-${sharedEntityId}-${createClientId()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "share_invitations",
          filter: `shared_entity_id=eq.${sharedEntityId}`,
        },
        (payload) => callback(payload.new, payload),
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  signIn: async ({ email, password }) =>
    unwrap(
      await assertClient().auth.signInWithPassword({
        email: String(email || "").trim().toLowerCase(),
        password,
      }),
    ),

  signUp: async ({ email, password, name, captchaToken }) => {
    const options = {
      data: { display_name: String(name || "").trim() },
      ...(captchaToken ? { captchaToken } : {}),
    };
    const redirectBase = browserOrigin();
    if (redirectBase) options.emailRedirectTo = `${redirectBase}/?auth=confirmed`;
    return unwrap(
      await assertClient().auth.signUp({
        email: String(email || "").trim().toLowerCase(),
        password,
        options,
      }),
    );
  },

  resendConfirmation: async (email) => {
    const redirectBase = browserOrigin();
    return unwrap(
      await assertClient().auth.resend({
        type: "signup",
        email: String(email || "").trim().toLowerCase(),
        options: redirectBase
          ? { emailRedirectTo: `${redirectBase}/?auth=confirmed` }
          : undefined,
      }),
    );
  },

  requestPasswordReset: async (email) => {
    const redirectBase = browserOrigin();
    if (!redirectBase) {
      throw new Error("Este aplicativo foi gerado sem o endereço de recuperação. Configure VITE_PUBLIC_APP_URL e atualize o aplicativo.");
    }
    return unwrap(
      await (recoveryClient || assertClient()).auth.resetPasswordForEmail(
        String(email || "").trim().toLowerCase(),
        redirectBase
          ? { redirectTo: `${redirectBase}/?auth=recovery` }
          : undefined,
      ),
    );
  },

  updatePassword: async (password) =>
    unwrap(await assertClient().auth.updateUser({ password })),

  updateProfile: async ({ name, avatarUrl = "" }) => {
    const session = await requireSession();
    const displayName = String(name || "").trim();
    unwrap(
      await assertClient().auth.updateUser({
        data: { display_name: displayName },
      }),
    );
    return unwrap(
      await assertClient()
        .from("profiles")
        .upsert(
          {
            id: session.user.id,
            display_name: displayName,
            avatar_url: String(avatarUrl || "").trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select()
        .single(),
    );
  },

  signOut: async () => unwrap(await assertClient().auth.signOut()),

  deleteAccount: async () => {
    await requireSession();
    const result = await assertClient().functions.invoke("delete-account", {
      body: { confirmation: "DELETE_MY_ACCOUNT" },
    });
    if (result.error) throw result.error;
    await assertClient().auth.signOut({ scope: "local" });
    return result.data;
  },

  loadAccountState: async () => {
    const supabase = assertClient();
    const session = await collaborationCloud.getSession();
    if (!session?.user?.id) return null;

    const modern = await supabase
      .from("account_state")
      .select("state, updated_at, revision, schema_version, device_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!modern.error) return modern.data || null;
    if (!missingBackendCapability(modern.error)) throw modern.error;

    const legacy = unwrap(
      await supabase
        .from("account_state")
        .select("state, updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle(),
    );
    return legacy ? { ...legacy, revision: null, legacy: true } : null;
  },

  saveAccountState: async (
    state,
    { expectedRevision = null, deviceId = null } = {},
  ) => {
    const supabase = assertClient();
    const session = await collaborationCloud.getSession();
    if (!session?.user?.id) return null;
    const serialized = prepareStudyStateForCloud(state);
    if (cloudStateSizeBytes(serialized) > 7.5 * 1024 * 1024) {
      throw new Error(
        "Sua conta ultrapassou o limite seguro de sincronização. Remova anexos incorporados ou divida materiais muito grandes.",
      );
    }
    const rpcResult = await supabase.rpc("save_account_state", {
      next_state: serialized,
      expected_revision: expectedRevision,
      client_device_id: deviceId,
      client_schema_version: STUDY_STATE_SCHEMA_VERSION,
    });

    if (!rpcResult.error) return normalizeRpcRow(rpcResult.data);
    if (!missingBackendCapability(rpcResult.error)) throw rpcResult.error;

    const legacy = unwrap(
      await supabase
        .from("account_state")
        .upsert(
          {
            user_id: session.user.id,
            state: serialized,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select("state, updated_at")
        .single(),
    );
    return {
      applied: true,
      conflict: false,
      revision: null,
      state: legacy.state,
      updated_at: legacy.updated_at,
      legacy: true,
    };
  },

  listAccountBackups: async () => {
    await requireSession();
    const result = await assertClient()
      .from("account_state_history")
      .select("revision, schema_version, device_id, archived_at")
      .order("revision", { ascending: false })
      .limit(30);
    if (result.error && missingBackendCapability(result.error)) return [];
    return unwrap(result) || [];
  },

  restoreAccountBackup: async (revision) => {
    await requireSession();
    return normalizeRpcRow(
      unwrap(
        await assertClient().rpc("restore_account_state", {
          target_revision: Number(revision),
        }),
      ),
    );
  },

  ensureDefaultWorkspace: async ({ name = "Meu StudyHub" } = {}) => {
    const supabase = assertClient();
    const session = await requireSession("Faça login para compartilhar.");
    const rpcResult = await supabase.rpc("ensure_default_workspace", {
      workspace_name: name,
    });
    if (!rpcResult.error) return normalizeRpcRow(rpcResult.data);
    if (!missingBackendCapability(rpcResult.error)) throw rpcResult.error;

    const existing = unwrap(
      await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(*)")
        .eq("user_id", session.user.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle(),
    );
    if (existing?.workspace_id) return existing.workspaces;
    const workspace = unwrap(
      await supabase
        .from("workspaces")
        .insert({ name, kind: "personal", owner_id: session.user.id })
        .select()
        .single(),
    );
    unwrap(
      await supabase.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: session.user.id,
        role: "owner",
      }),
    );
    return workspace;
  },

  createInvitation: async ({
    entityType,
    entityId,
    title,
    payload = {},
    permission = "viewer",
    email,
  }) => {
    const supabase = assertClient();
    const allowedTypes = new Set([
      "note",
      "whiteboard",
      "resource",
      "subject",
      "project",
      "task",
      "course",
      "lesson",
    ]);
    if (!allowedTypes.has(entityType)) throw new Error("Tipo de conteúdo inválido.");
    if (!["viewer", "commenter", "editor"].includes(permission)) {
      throw new Error("Permissão de compartilhamento inválida.");
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Informe o e-mail da pessoa convidada.");
    const session = await requireSession("Faça login para compartilhar.");
    if (normalizedEmail === String(session.user.email || "").toLowerCase()) {
      throw new Error("Use o e-mail de outra pessoa para compartilhar.");
    }

    const workspace = await collaborationCloud.ensureDefaultWorkspace();
    const entity = unwrap(
      await supabase
        .from("shared_entities")
        .upsert(
          {
            workspace_id: workspace.id,
            entity_type: entityType,
            entity_id: String(entityId),
            title: String(title || "").slice(0, 240),
            payload: prepareStudyStateForCloud(payload),
          },
          { onConflict: "workspace_id,entity_type,entity_id" },
        )
        .select()
        .single(),
    );
    const sharedObjectPath =
      payload?.cloudObjectPath ||
      payload?.resource?.cloudObjectPath ||
      payload?.file?.cloudObjectPath ||
      null;
    if (entityType === "resource" && sharedObjectPath) {
      unwrap(
        await supabase
          .from("file_objects")
          .update({ shared_entity_id: entity.id })
          .eq("object_path", sharedObjectPath),
      );
    }
    const invitation = unwrap(
      await supabase
        .from("share_invitations")
        .upsert(
          {
            workspace_id: workspace.id,
            shared_entity_id: entity.id,
            email: normalizedEmail,
            permission,
            status: "pending",
            accepted_by: null,
            accepted_at: null,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          },
          { onConflict: "shared_entity_id,email" },
        )
        .select()
        .single(),
    );
    return { ...invitation, shared_entities: entity };
  },

  listSentInvitations: async ({ entityType, entityId }) => {
    await requireSession("Faça login para consultar os convites enviados.");
    const entity = unwrap(
      await assertClient()
        .from("shared_entities")
        .select("*, share_invitations(*)")
        .eq("entity_type", entityType)
        .eq("entity_id", String(entityId))
        .maybeSingle(),
    );
    return {
      entity: entity || null,
      invitations: entity?.share_invitations || [],
    };
  },

  listSharedEntities: async () =>
    unwrap(
      await assertClient()
        .from("shared_entities")
        .select("*, share_invitations(*)")
        .order("updated_at", { ascending: false }),
    ),

  listMyInvitations: async () => {
    const session = await requireSession("Faça login para ver seus convites.");
    return unwrap(
      await assertClient()
        .from("share_invitations")
        .select("*, shared_entities(*)")
        .eq("email", String(session.user.email || "").toLowerCase())
        .order("created_at", { ascending: false }),
    );
  },

  respondToInvitation: async ({ invitationId, accept }) => {
    const session = await requireSession("Faça login para responder ao convite.");
    const rpc = await assertClient().rpc("respond_to_share_invitation", {
      target_invitation_id: invitationId,
      accept_invitation: Boolean(accept),
    });
    let result;
    if (!rpc.error) {
      result = normalizeRpcRow(rpc.data);
    } else if (missingBackendCapability(rpc.error)) {
      const fallback = await assertClient()
        .from("share_invitations")
        .update({
          status: accept ? "accepted" : "declined",
          accepted_by: accept ? session.user.id : null,
          accepted_at: accept ? new Date().toISOString() : null,
        })
        .eq("id", invitationId)
        .eq("email", String(session.user.email || "").toLowerCase())
        .eq("status", "pending")
        .select("id, status, permission, shared_entity_id, accepted_at")
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      result = fallback.data;
    } else {
      throw rpc.error;
    }
    if (accept && result?.status !== "accepted") {
      throw new Error(
        result?.status === "expired"
          ? "Este convite expirou. Peça um novo convite."
          : "O convite não pôde ser aceito.",
      );
    }
    return result;
  },

  getSharedEntity: async (sharedEntityId) => {
    await requireSession("Faça login para abrir o conteúdo compartilhado.");
    return unwrap(
      await assertClient()
        .from("shared_entities")
        .select("*")
        .eq("id", sharedEntityId)
        .single(),
    );
  },

  getMyInvitationForEntity: async (sharedEntityId) => {
    const session = await requireSession(
      "Faça login para consultar a permissão do conteúdo.",
    );
    return unwrap(
      await assertClient()
        .from("share_invitations")
        .select("id, shared_entity_id, permission, status, expires_at, accepted_at")
        .eq("shared_entity_id", sharedEntityId)
        .eq("email", String(session.user.email || "").toLowerCase())
        .maybeSingle(),
    );
  },

  updateSharedEntity: async ({
    sharedEntityId,
    title,
    payload,
    expectedRevision = null,
  }) => {
    await requireSession("Faça login para editar o conteúdo compartilhado.");
    let query = assertClient()
      .from("shared_entities")
      .update({
        title: String(title || "Conteúdo compartilhado").slice(0, 240),
        payload: prepareStudyStateForCloud(payload || {}),
      })
      .eq("id", sharedEntityId);
    if (
      expectedRevision !== null &&
      expectedRevision !== undefined &&
      Number.isFinite(Number(expectedRevision))
    ) {
      query = query.eq("revision", Number(expectedRevision));
    }
    const result = await query.select().maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      throw new Error(
        "A nota foi alterada em outro dispositivo. Aguarde a atualização e tente novamente.",
      );
    }
    return result.data;
  },

  listSharedComments: async (sharedEntityId) => {
    await requireSession("Faça login para consultar os comentários.");
    return unwrap(
      await assertClient()
        .from("shared_comments")
        .select("*")
        .eq("shared_entity_id", sharedEntityId)
        .order("created_at", { ascending: true }),
    );
  },

  addSharedComment: async ({ sharedEntityId, body }) => {
    const session = await requireSession("Faça login para comentar.");
    const normalizedBody = String(body || "").trim();
    if (!normalizedBody) throw new Error("Escreva um comentário.");
    if (normalizedBody.length > 10_000) {
      throw new Error("O comentário deve ter no máximo 10.000 caracteres.");
    }
    const authorName = String(
      session.user.user_metadata?.display_name ||
        session.user.email?.split("@")[0] ||
        "Participante",
    ).slice(0, 120);
    const result = await assertClient()
      .from("shared_comments")
      .insert({
        shared_entity_id: sharedEntityId,
        user_id: session.user.id,
        author_name: authorName,
        body: normalizedBody,
      })
      .select()
      .single();
    if (!result.error) return result.data;
    if (!missingBackendCapability(result.error)) throw result.error;
    return unwrap(
      await assertClient()
        .from("shared_comments")
        .insert({
          shared_entity_id: sharedEntityId,
          user_id: session.user.id,
          body: normalizedBody,
        })
        .select()
        .single(),
    );
  },

  deleteSharedComment: async (commentId) => {
    await requireSession("Faça login para excluir o comentário.");
    return unwrap(
      await assertClient()
        .from("shared_comments")
        .delete()
        .eq("id", commentId)
        .select()
        .maybeSingle(),
    );
  },

  revokeInvitation: async (invitationId) => {
    await requireSession();
    const rpc = await assertClient().rpc("revoke_share_invitation", {
      target_invitation_id: invitationId,
    });
    if (!rpc.error) return normalizeRpcRow(rpc.data);
    if (!missingBackendCapability(rpc.error)) throw rpc.error;
    return unwrap(
      await assertClient()
        .from("share_invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId)
        .select("id, status, permission, shared_entity_id")
        .maybeSingle(),
    );
  },

  uploadAccountFile: async (file, { workspaceId = null } = {}) => {
    const session = await requireSession("Faça login para enviar arquivos.");
    if (!file) throw new Error("Selecione um arquivo.");
    if (Number(file.size || 0) > 50 * 1024 * 1024) {
      throw new Error("O arquivo excede o limite de 50 MB.");
    }
    const mimeType = fileMimeType(file);
    if (!mimeType) throw new Error("Este tipo de arquivo não é suportado.");

    const objectId = createClientId();
    const folder = workspaceId
      ? `workspaces/${workspaceId}`
      : `users/${session.user.id}`;
    const objectPath = `${folder}/${objectId}-${safeFileName(file.name)}`;
    const supabase = assertClient();
    const upload = await supabase.storage
      .from("studyhub-files")
      .upload(objectPath, file, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });
    if (upload.error) throw upload.error;

    const metadata = await supabase
      .from("file_objects")
      .insert({
        owner_id: session.user.id,
        workspace_id: workspaceId,
        bucket_id: "studyhub-files",
        object_path: objectPath,
        original_name: file.name,
        mime_type: mimeType,
        size_bytes: Number(file.size || 0),
      })
      .select()
      .single();
    if (metadata.error) {
      await supabase.storage.from("studyhub-files").remove([objectPath]);
      throw metadata.error;
    }

    return {
      ...metadata.data,
      objectPath,
      bucketId: "studyhub-files",
      mimeType,
    };
  },

  createSignedFileUrl: async (objectPath, { downloadName } = {}) => {
    await requireSession("Faça login para abrir este arquivo.");
    if (!objectPath) throw new Error("Arquivo remoto não encontrado.");
    const result = await assertClient()
      .storage.from("studyhub-files")
      .createSignedUrl(
        objectPath,
        15 * 60,
        downloadName ? { download: downloadName } : undefined,
      );
    return unwrap(result).signedUrl;
  },

  removeAccountFile: async ({ objectPath, fileObjectId } = {}) => {
    await requireSession("Faça login para excluir este arquivo.");
    if (!objectPath) return;
    const supabase = assertClient();
    unwrap(await supabase.storage.from("studyhub-files").remove([objectPath]));
    const query = supabase.from("file_objects").delete();
    unwrap(
      await (fileObjectId
        ? query.eq("id", fileObjectId)
        : query.eq("object_path", objectPath)),
    );
  },
};
