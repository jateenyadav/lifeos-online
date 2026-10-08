export function cloudConnectionSafe(pageAddress, apiAddress = '/api') {
  const page = new URL(pageAddress);
  const api = new URL(apiAddress, page);
  const loopback = (url) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return (
    (page.protocol === 'https:' || loopback(page)) &&
    (api.protocol === 'https:' ||
      (api.protocol === 'http:' && loopback(page) && loopback(api)))
  );
}
