-- Sign-up asks for a mobile number (owner, 24 Nov). Stored as +91 and 10 digits; nullable for accounts made before this. One account per mobile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile text;
CREATE UNIQUE INDEX IF NOT EXISTS users_mobile_uniq ON users (mobile) WHERE mobile IS NOT NULL;
