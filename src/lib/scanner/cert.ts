import "server-only";
import tls from "tls";
import { guardedLookup, normalizeUrl } from "./safe-fetch";
import type { CertificateInfo } from "./security";

const TIMEOUT_MS = 5_000;

/**
 * Reads the TLS certificate a host presents on port 443. Goes through the
 * scanner's guarded DNS lookup, so it never connects to private or internal
 * addresses. Verification is reported rather than enforced, so self-signed and
 * expired certificates can be described. Returns undefined if the host can't
 * be reached in time: the check is informative, never a reason to fail a scan.
 */
export function fetchCertificate(host: string): Promise<CertificateInfo | undefined> {
  let hostname: string;
  try {
    hostname = normalizeUrl(host).hostname;
  } catch {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    let socket: tls.TLSSocket;
    const finish = (value: CertificateInfo | undefined) => {
      clearTimeout(deadline);
      socket?.destroy();
      resolve(value);
    };
    try {
      socket = tls.connect({ host: hostname, port: 443, servername: hostname, lookup: guardedLookup, rejectUnauthorized: false, timeout: TIMEOUT_MS });
    } catch {
      return resolve(undefined);
    }
    const deadline = setTimeout(() => finish(undefined), TIMEOUT_MS);
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      if (!peer?.valid_to) return finish(undefined);
      const issuer = peer.issuer ? [peer.issuer.O, peer.issuer.CN].flat().filter(Boolean)[0] ?? "" : "";
      const error = socket.authorizationError ? String(socket.authorizationError) : undefined;
      finish({ validTo: new Date(peer.valid_to), issuer: String(issuer), authorized: socket.authorized, ...(error ? { error } : {}) });
    });
    socket.once("timeout", () => finish(undefined));
    socket.once("error", () => finish(undefined));
  });
}
