const API_BASE_URL = "http://localhost:3000";

export async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || "Request failed");
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }

  return data;
}

export function money(value) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("bg-BG");
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("bg-BG");
}
