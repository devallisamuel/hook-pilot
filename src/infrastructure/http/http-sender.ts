import dns, { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { LookupFunction } from 'node:net';
import { CallErrorCode, CallResult } from '../../domain/delivery/call-result';
import { EndpointUrl } from '../../domain/endpoint/endpoint-url';
import { isPublicAddress } from '../../domain/endpoint/network-address';

export interface SendRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
  allowPrivateNetworks: boolean;
}

class BlockedAddressError extends Error {
  readonly code = 'EHOOKPILOT_BLOCKED';
}

/**
 * Resolves the hostname and refuses non-public addresses. Because the check is
 * applied to the exact address the socket connects to, DNS-rebinding between
 * "validate" and "connect" cannot bypass it.
 */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err);
      const blocked = allowPrivate ? undefined : addresses.find((a) => !isPublicAddress(a.address));
      if (blocked) {
        return callback(new BlockedAddressError(`${hostname} resolves to non-public address ${blocked.address}`));
      }
      if (options.all) return callback(null, addresses);
      const [first] = addresses;
      if (!first) return callback(new Error(`No addresses found for ${hostname}`));
      return callback(null, first.address, first.family);
    });
  }) as LookupFunction;
}

/** POSTs a webhook. Never throws; redirects are not followed. */
export function sendWebhook(req: SendRequest): Promise<CallResult> {
  const started = Date.now();
  const result = (partial: Partial<CallResult>): CallResult => ({
    statusCode: null,
    responseBody: null,
    errorCode: null,
    error: null,
    ...partial,
    durationMs: Date.now() - started,
  });

  // Re-check the stored URL against the current rules before sending anything.
  let url: URL;
  try {
    url = new URL(EndpointUrl.create(req.url, { allowPrivateNetworks: req.allowPrivateNetworks }).value);
  } catch (err) {
    const reason = (err as Error).message;
    const code: CallErrorCode = /private|reserved|internal/.test(reason) ? 'blocked_address' : 'invalid_url';
    return Promise.resolve(result({ errorCode: code, error: reason }));
  }
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (partial: Partial<CallResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result(partial));
    };

    const request = transport.request(
      url,
      {
        method: 'POST',
        headers: { ...req.headers, 'content-length': String(Buffer.byteLength(req.body)) },
        lookup: guardedLookup(req.allowPrivateNetworks),
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let kept = 0;
        const done = () =>
          finish({ statusCode: res.statusCode ?? null, responseBody: Buffer.concat(chunks).toString('utf8') });
        res.on('data', (chunk: Buffer) => {
          if (kept < req.maxResponseBytes) {
            const slice = chunk.subarray(0, req.maxResponseBytes - kept);
            chunks.push(slice);
            kept += slice.length;
          }
          if (kept >= req.maxResponseBytes) {
            done();
            res.destroy();
          }
        });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );

    const timer = setTimeout(() => {
      finish({ errorCode: 'timeout', error: `Timed out after ${req.timeoutMs}ms` });
      request.destroy();
    }, req.timeoutMs);

    request.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof BlockedAddressError || err.code === 'EHOOKPILOT_BLOCKED') {
        finish({ errorCode: 'blocked_address', error: err.message });
      } else {
        finish({ errorCode: 'network', error: err.code ? `${err.code}: ${err.message}` : err.message });
      }
    });

    request.end(req.body);
  });
}
