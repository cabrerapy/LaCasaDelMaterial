/** No blanket 403/404 fallback: missing assets retain their real error. */
export const SPA_ROUTING_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if ((request.method === 'GET' || request.method === 'HEAD') &&
      uri !== '/api' && uri.indexOf('/api/') !== 0 &&
      uri !== '/assets' && uri.indexOf('/assets/') !== 0 &&
      uri.indexOf('/.well-known/') !== 0 && uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}`;
