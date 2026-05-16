import { getApiBaseUrl } from "@/api/client";

function resolveSsoBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_MOCK_SSO_URL as string | undefined)?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "https://tcetcercd.in/login";
  }

  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getMockSsoLoginUrl(): string {
  if (typeof window === "undefined") {
    return "https://tcetcercd.in/login";
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
