export type GoogleProfile = {
  email: string;
  sub: string;
  name?: string;
  email_verified: boolean;
};

export abstract class IGoogleAuthAdapter {
  /**
   * Exchanges authorization code for verified user profile.
   * @param code Authorization code from frontend
   * @param redirectUri Optional dynamic redirect URI
   */
  abstract exchangeCodeForProfile(code: string, redirectUri?: string): Promise<GoogleProfile>;
}
