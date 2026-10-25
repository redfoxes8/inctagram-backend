CREATE TYPE "UserBanReasonCode" AS ENUM ('BAD_BEHAVIOR', 'ADVERTISING_PLACEMENT', 'ANOTHER_REASON');

ALTER TABLE "User"
  ADD COLUMN "banReasonCode" "UserBanReasonCode",
  ADD COLUMN "banReasonText" TEXT;

ALTER TABLE "AdminUserActionAudit"
  ADD COLUMN "banReasonCode" "UserBanReasonCode",
  ADD COLUMN "banReasonText" TEXT;

-- CASE avoids CHECK's SQL NULL loophole for code=null/text!=null.
-- Trim characters mirror ECMAScript String.trim, including tabs and Unicode whitespace.
-- Deliberately no isBanned/reason coupling: legacy setBanned must remain valid until S3.
ALTER TABLE "User" ADD CONSTRAINT "User_ban_reason_check" CHECK (
  CASE
    WHEN "banReasonCode" IS NULL THEN "banReasonText" IS NULL
    WHEN "banReasonCode" = 'ANOTHER_REASON' THEN
      "banReasonText" IS NOT NULL
      AND char_length("banReasonText") BETWEEN 1 AND 500
      AND "banReasonText" = btrim("banReasonText", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    ELSE "banReasonText" IS NULL
  END
);

ALTER TABLE "AdminUserActionAudit" ADD CONSTRAINT "AdminUserActionAudit_ban_reason_check" CHECK (
  CASE
    WHEN "banReasonCode" IS NULL THEN "banReasonText" IS NULL
    WHEN "banReasonCode" = 'ANOTHER_REASON' THEN
      "banReasonText" IS NOT NULL
      AND char_length("banReasonText") BETWEEN 1 AND 500
      AND "banReasonText" = btrim("banReasonText", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    ELSE "banReasonText" IS NULL
  END
);
