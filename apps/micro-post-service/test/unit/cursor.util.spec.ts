import { CursorUtil } from '../../src/modules/posts/application/utils/cursor.util';

describe('CursorUtil (Unit)', () => {
  it('should encode id and createdAt into a base64url cursor string', () => {
    // Arrange
    const id = 'post-uuid';
    const createdAt = new Date('2026-05-29T12:00:00.000Z');

    // Act
    const encoded = CursorUtil.encode(id, createdAt);

    // Assert
    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
    // Ensure base64url pattern is matched (no padding '=' or '/' or '+')
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('+');
  });

  it('should decode a valid base64url cursor string to get the original payload', () => {
    // Arrange
    const id = 'another-uuid';
    const createdAt = new Date('2026-05-29T12:34:56.789Z');
    const encoded = CursorUtil.encode(id, createdAt);

    // Act
    const decoded = CursorUtil.decode(encoded);

    // Assert
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(id);
    expect(decoded!.createdAt).toBe(createdAt.toISOString());
  });

  it('should return null for malformed base64url string', () => {
    // Arrange
    const invalidCursor = 'malformed-base64-!!!';

    // Act
    const decoded = CursorUtil.decode(invalidCursor);

    // Assert
    expect(decoded).toBeNull();
  });

  it('should return null if decoded payload is missing id or createdAt', () => {
    // Arrange
    const payloadWithoutId = { createdAt: new Date().toISOString() };
    const encodedWithoutId = Buffer.from(JSON.stringify(payloadWithoutId)).toString('base64url');

    const payloadWithoutDate = { id: 'some-id' };
    const encodedWithoutDate = Buffer.from(JSON.stringify(payloadWithoutDate)).toString('base64url');

    // Act
    const decoded1 = CursorUtil.decode(encodedWithoutId);
    const decoded2 = CursorUtil.decode(encodedWithoutDate);

    // Assert
    expect(decoded1).toBeNull();
    expect(decoded2).toBeNull();
  });
});
