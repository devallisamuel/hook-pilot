import ipaddr from 'ipaddr.js';

/**
 * True only for globally routable unicast addresses. Loopback, RFC1918,
 * link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast,
 * unique-local IPv6, etc. are all rejected. IPv4-mapped IPv6 is unwrapped first.
 *
 * Used when an endpoint URL is created and again by the HTTP sender against
 * the address it actually connects to (so DNS rebinding can't bypass it).
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  return parsed.range() === 'unicast';
}
