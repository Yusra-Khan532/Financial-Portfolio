const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export const CMS_TOKEN_KEY = "cms_admin_token";

export function getCmsToken() {
  return sessionStorage.getItem(CMS_TOKEN_KEY);
}

export function clearCmsToken() {
  sessionStorage.removeItem(CMS_TOKEN_KEY);
}

export function hasCmsSession() {
  const token = getCmsToken();
  if (!token) return false;
  try {
    const segment = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, "=")));
    return payload.role === "admin" && (!payload.exp || payload.exp * 1000 > Date.now());
  } catch {
    return false;
  }
}

export async function cmsRequest(path, options = {}) {
  const token = getCmsToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearCmsToken();
    const error = new Error("Your administrator session has expired.");
    error.status = 401;
    throw error;
  }

  if (!response.ok) {
    let detail = "The request could not be completed.";
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Keep the safe fallback when the server did not return JSON.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
}

export function formatCmsDate(value, fallback = "—") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCmsDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
