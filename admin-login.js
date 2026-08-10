const cfg = window.MERCH_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);

const sb = configured
  ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const $ = id => document.getElementById(id);

function setMessage(message, type = "error") {
  const el = $("loginMessage");
  el.textContent = message || "";
  el.dataset.type = type;
}

function friendlyAuthError(error) {
  const raw = String(error?.message || "").toLowerCase();
  if (raw.includes("invalid login credentials")) return "Incorrect email or password.";
  if (raw.includes("email not confirmed")) return "Please confirm your email address first, then try again.";
  if (raw.includes("rate limit")) return "Too many login attempts. Please wait a moment and try again.";
  if (raw.includes("failed to fetch") || raw.includes("network")) return "Could not connect to the login server. Check your internet connection.";
  return error?.message || "Unable to sign in. Please try again.";
}

async function isAuthorizedAdmin(userId) {
  const { data, error } = await sb
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Admin access check failed:", error);
    throw new Error("Could not verify admin access.");
  }
  return Boolean(data?.user_id);
}

async function redirectExistingAdminSession() {
  if (!sb) return;

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return;

  try {
    const allowed = await isAuthorizedAdmin(data.user.id);
    if (allowed) {
      window.location.replace("admin-dashboard.html");
    } else {
      await sb.auth.signOut();
    }
  } catch (error) {
    console.error(error);
  }
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!configured || !sb) {
    setMessage("The admin portal is temporarily unavailable.");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("loginButton");

  button.disabled = true;
  button.textContent = "Signing in…";
  setMessage("");

  try {
    const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
      throw userError || new Error("Could not verify this account.");
    }

    const allowed = await isAuthorizedAdmin(userData.user.id);

    if (!allowed) {
      await sb.auth.signOut();
      setMessage("This account is not authorized for the merch admin dashboard.");
      return;
    }

    setMessage("Signed in. Opening dashboard…", "success");
    window.location.replace("admin-dashboard.html");
  } catch (error) {
    console.error(error);
    setMessage(friendlyAuthError(error));
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  $("togglePassword").textContent = showing ? "Show" : "Hide";
  $("togglePassword").setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

redirectExistingAdminSession();
