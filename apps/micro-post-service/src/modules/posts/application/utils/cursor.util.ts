export type CursorPayload = {
  id: string;
  createdAt: string;
};

export class CursorUtil {
  static encode(id: string, createdAt: Date): string {
    const payload: CursorPayload = {
      id,
      createdAt: createdAt.toISOString(),
    };
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64url');
  }

  static decode(cursor: string): CursorPayload | null {
    try {
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const payload = JSON.parse(json) as CursorPayload;
      
      if (!payload.id || !payload.createdAt) {
        return null;
      }
      
      return payload;
    } catch (e) {
      return null;
    }
  }
}
