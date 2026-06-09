import { InvalidUrlError } from "./errors";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

export function validateUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidUrlError("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError("URL must use http or https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new InvalidUrlError("URL must include a hostname");
  }

  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new InvalidUrlError("URL hostname is not allowed");
  }

  if (isPrivateIpv4(hostname)) {
    throw new InvalidUrlError("URL resolves to a private or reserved address");
  }

  return url;
}

export function originPatternForUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/*`;
}
