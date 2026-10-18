export type AdminPrincipal = Readonly<{
  sessionId: string;
  role: 'SUPERADMIN';
}>;

export abstract class AdminPrincipalVerifier {
  abstract verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null>;
}
