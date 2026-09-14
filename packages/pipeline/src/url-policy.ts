import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { PipelineError } from "./errors";

export type AddressResolver = (hostname: string) => Promise<string[]>;

export interface UrlSafetyPolicyOptions {
  allowLocalhost?: boolean;
  resolveAddresses?: boolean;
  resolver?: AddressResolver;
}

export interface UrlSafetyPolicy {
  assertAllowed(rawUrl: string): Promise<URL>;
}

export function createUrlSafetyPolicy(options: UrlSafetyPolicyOptions = {}): UrlSafetyPolicy {
  const allowLocalhost = options.allowLocalhost ?? false;
  const resolveAddresses = options.resolveAddresses ?? true;
  const resolver = options.resolver ?? defaultResolver;

  return {
    async assertAllowed(rawUrl: string): Promise<URL> {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch (error) {
        throw new PipelineError("UNSAFE_URL", "Company URL is invalid.", error);
      }

      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new PipelineError("UNSAFE_URL", "Only credential-free HTTP(S) URLs can be retrieved.");
      }

      const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
      if (isLocalHostname(hostname)) {
        if (allowLocalhost) return url;
        throw new PipelineError("UNSAFE_URL", "Local and loopback URLs are not allowed.");
      }

      if (isForbiddenAddress(hostname)) {
        throw new PipelineError("UNSAFE_URL", "Private, loopback, or reserved IP addresses are not allowed.");
      }

      if (resolveAddresses) {
        let addresses: string[];
        try {
          addresses = await resolver(hostname);
        } catch (error) {
          throw new PipelineError("UNSAFE_URL", "Company hostname could not be resolved.", error);
        }
        if (addresses.length === 0 || addresses.some(isForbiddenAddress)) {
          throw new PipelineError("UNSAFE_URL", "Company hostname resolves to a private or reserved address.");
        }
      }
      return url;
    }
  };
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

export function isForbiddenAddress(value: string): boolean {
  const address = value.toLowerCase();
  if (isIP(address) === 4) return isForbiddenIpv4(address);
  if (isIP(address) === 6) return isForbiddenIpv6(address);
  return false;
}

function isForbiddenIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

function isForbiddenIpv6(address: string): boolean {
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe8") || address.startsWith("fe9") || address.startsWith("fea") || address.startsWith("feb")) return true;
  const mappedV4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mappedV4 ? isForbiddenIpv4(mappedV4[1]) : false;
}
