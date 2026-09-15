/** Keep post-login navigation on this origin, including after URL normalization. */
export function authRedirectPath(value: string | null): string {
  return value && /^\/(?!\/)[^\\\u0000-\u0020]*$/.test(value) ? value : "/";
}
