import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/shared/store/auth";

export const api = axios.create({
  baseURL: "/api/v2",
  timeout: 30_000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { token } = useAuth.getState();
  if (token) {
    // We send via X-AIBA-Token (a custom header) INSTEAD OF the canonical
    // `Authorization: Bearer`. Reason: at least one Chrome extension in
    // the wild (a NextCloud/AdGuard-style autofill) overrides the
    // Authorization header on every request with `Bearer aextk_...`, which
    // wipes our JWT before it ever leaves the browser. A custom header is
    // off the extension's radar. Backend reads either header.
    config.headers["X-AIBA-Token"] = token;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    // Only logout if the user already has a token AND the failed request
    // actually sent that token. Otherwise we trash freshly-set credentials
    // when an in-flight request from before login lands a 401 (the bug
    // that booted users right after a successful /auth/login).
    if (err.response?.status === 401) {
      const sentToken = err.config?.headers?.["X-AIBA-Token"];
      const url = err.config?.url || "";
      const wasLoginCall = url.includes("/auth/login");
      const stored = useAuth.getState();
      if (!wasLoginCall && sentToken && stored.token && String(sentToken) === stored.token) {
        // Stored token was actively rejected → it really is invalid/expired.
        useAuth.getState().logout();
      }
    }
    return Promise.reject(err);
  }
);

export type ApiError = {
  detail?: string;
  message?: string;
};
