export type AdminPrincipal = Readonly<{
  sessionId: string;
  role: 'SUPERADMIN';
}>;

export abstract class AdminPrincipalVerifier {
  abstract verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null>;
  // A verifier without an explicit non-touch implementation cannot authenticate long-lived transports.
  verifyWithoutTouch(input: { sessionToken: string | null }): Promise<AdminPrincipal | null> {
    void input;
    return Promise.resolve(null);
  }
}
