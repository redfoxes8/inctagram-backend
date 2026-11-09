const PUBLIC_FRONTEND_ORIGIN = 'https://nymbi.org';

export function buildPublicProfileUrl(input: {
  userId: string;
  frontendUrl: string | undefined;
}): string {
  const frontendUrl = input.frontendUrl ?? PUBLIC_FRONTEND_ORIGIN;
  return `${frontendUrl.replace(/\/+$/, '')}/profile/${encodeURIComponent(input.userId)}`;
}
