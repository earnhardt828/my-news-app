import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

function isValidSupabaseUrl(value: string) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const isSupabaseConfigured =
  isValidSupabaseUrl(supabaseUrl) && Boolean(supabaseAnonKey);

export const SUPABASE_CONFIG_ERROR_MESSAGE =
  "Supabase is not configured. Add a valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.";

class MissingSupabaseConfigurationError extends Error {
  constructor() {
    super(SUPABASE_CONFIG_ERROR_MESSAGE);
    this.name = "MissingSupabaseConfigurationError";
  }
}

let hasLoggedSupabaseConfigurationError = false;

function logMissingSupabaseConfiguration(context: string) {
  if (hasLoggedSupabaseConfigurationError) {
    return;
  }

  hasLoggedSupabaseConfigurationError = true;
  console.error(`[supabase] ${context}: ${SUPABASE_CONFIG_ERROR_MESSAGE}`);
}

function createMissingConfigError() {
  return new MissingSupabaseConfigurationError();
}

function createDisabledQueryBuilderProxy(resultFactory: () => unknown) {
  let proxy: unknown;

  const thenableTarget = () => undefined;
  const handler: ProxyHandler<typeof thenableTarget> = {
    get(_target, property) {
      if (property === "then") {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resultFactory()).then(onFulfilled, onRejected);
      }

      if (property === "catch") {
        return (onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resultFactory()).catch(onRejected);
      }

      if (property === "finally") {
        return (onFinally?: () => void) =>
          Promise.resolve(resultFactory()).finally(onFinally);
      }

      return (..._args: unknown[]) => proxy;
    },
    apply() {
      return proxy;
    },
  };

  proxy = new Proxy(thenableTarget, handler);
  return proxy;
}

function createDisabledSupabaseClient(): SupabaseClient {
  logMissingSupabaseConfiguration("client bootstrap");

  const buildQueryErrorResult = () => ({
    data: null,
    error: createMissingConfigError(),
    count: null,
    status: 503,
    statusText: "Supabase configuration missing",
  });

  const queryProxy = () => createDisabledQueryBuilderProxy(buildQueryErrorResult);

  return {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: createMissingConfigError(),
      }),
      getSession: async () => ({
        data: { session: null },
        error: createMissingConfigError(),
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: createMissingConfigError(),
      }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: createMissingConfigError(),
      }),
      signOut: async () => ({
        error: createMissingConfigError(),
      }),
      resend: async () => ({
        data: { user: null, session: null },
        error: createMissingConfigError(),
      }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe() {
              return;
            },
          },
        },
      }),
    },
    from: () => queryProxy(),
    storage: {
      from: () => ({
        upload: async () => ({
          data: null,
          error: createMissingConfigError(),
        }),
        getPublicUrl: () => ({
          data: { publicUrl: "" },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDisabledSupabaseClient();
