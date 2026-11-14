export const api = globalThis.browser || globalThis.chrome;
// These Firefox builds require versions with built-in data consent (140+).
export const hasFirefoxDataConsent = typeof api.runtime.getBrowserInfo === 'function';
export async function requireAuthenticationConsent() {
  if (hasFirefoxDataConsent) {
    const granted = await api.permissions.getAll();
    if (!granted.data_collection?.includes('authenticationInfo')) {
      throw new Error('Allow authentication information in Settings to connect to your Kuma account. Public status pages do not require it.');
    }
  }
}
