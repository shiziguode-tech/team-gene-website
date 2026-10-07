// A revoked/expired session must expose the login form without erasing drafts.
// Transient failures and rejected input must leave the signed-in state intact.
export async function forumMutation(path: string, init: RequestInit, onExpired: () => void) {
  const response = await fetch(path, init);
  if (response.status === 401) onExpired();
  return response;
}
