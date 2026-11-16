import { isIP } from 'node:net';
import { ValidationError } from '../shared/domain-error';
import { isPublicAddress } from './network-address';

/**
 * Value object: a URL we are willing to POST webhooks to.
 *
 * Rules: http(s) only, no credentials in the URL, and (unless private networks
 * are allowed, e.g. in local development) no localhost, internal hosts or
 * private/reserved IP addresses. Hostnames are checked again at send time.
 */
export class EndpointUrl {
  private constructor(readonly value: string) {}

  static create(raw: string, options: { allowPrivateNetworks: boolean }): EndpointUrl {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError('URL is not valid');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new ValidationError('URL must use http or https');
    }
    if (url.username || url.password) {
      throw new ValidationError('URL must not contain credentials');
    }
    if (!options.allowPrivateNetworks) {
      const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        throw new ValidationError('URL must not point at a private or internal host');
      }
      if (isIP(host) && !isPublicAddress(host)) {
        throw new ValidationError('URL must not point at a private or reserved IP address');
      }
    }
    return new EndpointUrl(url.toString());
  }

  /** Rebuilds a URL that was validated when it was saved. */
  static fromStored(value: string): EndpointUrl {
    return new EndpointUrl(value);
  }

  toString(): string {
    return this.value;
  }
}
