-- Rename table
ALTER TABLE "UserProfile"
    RENAME TO "Profile";

-- Rename foreign key constraint (необязательно, но красиво)
ALTER TABLE "Profile"
    RENAME CONSTRAINT "UserProfile_userId_fkey"
    TO "Profile_userId_fkey";

-- Rename indexes (необязательно, но рекомендуется)
ALTER INDEX "UserProfile_userId_key"
RENAME TO "Profile_userId_key";

ALTER INDEX "UserProfile_username_key"
RENAME TO "Profile_username_key";

ALTER INDEX "UserProfile_username_idx"
RENAME TO "Profile_username_idx";

ALTER INDEX "UserProfile_userId_idx"
RENAME TO "Profile_userId_idx";