const ADMIN_SESSION_KEY = "economizafacil_admin_session";

function readAdminPassword() {
  return String(import.meta.env.VITE_ADMIN_PASSWORD || "").trim();
}

export function isAdminConfigured() {
  return readAdminPassword().length > 0;
}

export function isAdminAuthenticated() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(ADMIN_SESSION_KEY) === "granted";
}

export function loginAdmin(password: string) {
  const expectedPassword = readAdminPassword();
  if (!expectedPassword || password !== expectedPassword) {
    return false;
  }

  window.localStorage.setItem(ADMIN_SESSION_KEY, "granted");
  return true;
}

export function logoutAdmin() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}
