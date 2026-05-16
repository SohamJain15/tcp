import { getApiBaseUrl } from "@/api/client";

function resolveSsoBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_MOCK_SSO_URL as string | undefined)?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getMockSsoLoginUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:4000/login?callbackUrl=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Fsso%2Fcallback%3FfrontendOrigin%3Dhttp%253A%252F%252Flocalhost%253A5173";
  }

  const backendBaseUrl = getApiBaseUrl();
  const frontendOrigin = window.location.origin;
  const callbackUrl = encodeURIComponent(
    `${backendBaseUrl}/api/auth/sso/callback?frontendOrigin=${encodeURIComponent(frontendOrigin)}`,
  );

  return `${resolveSsoBaseUrl()}/login?callbackUrl=${callbackUrl}`;
}

export function getSessionCloseUrl(): string {
  return `${getApiBaseUrl().replace(/\/+$/, "")}/api/logout`;
}
