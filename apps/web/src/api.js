export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Returned instead of data when the server answers 304 Not Modified. */
export const NOT_MODIFIED = Symbol('not-modified');

export async function apiRequest(path, { method = 'GET', body, signal, etag, onEtag } = {}) {
  let response;
  try {
    response = await fetch(
      `${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}${path}`,
      {
        method,
        credentials: 'include',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      },
    );
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      'Cannot reach the server. Check your connection and make sure the API is running.',
      0,
    );
  }
  if (response.status === 204) return null;
  if (response.status === 304) return NOT_MODIFIED;
  if (onEtag && response.headers.get('etag')) onEtag(response.headers.get('etag'));
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.message || 'The server could not complete your request.',
      response.status,
    );
  if (!data)
    throw new ApiError(
      'The server returned an unexpected response.',
      response.status,
    );
  return data;
}
