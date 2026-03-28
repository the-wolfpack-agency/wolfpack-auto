-- create_admin_user.sql
-- Run this on your production Neon DB AFTER running migrations.
--
-- Prerequisites:
--   1. Migrations have been applied (dealer_users table exists).
--   2. The target dealer row already exists in the dealers table.
--   3. Replace ALL placeholder values before executing.
--
-- How to generate a bcrypt hash:
--   node -e "const b=require('bcrypt'); b.hash('yourpassword', 12).then(console.log)"
--   (bcrypt is already a project dependency — install with: npm install bcrypt)
--
-- How to run against Neon:
--   psql "$DATABASE_URL" -f scripts/create_admin_user.sql
-- ---------------------------------------------------------------------------

INSERT INTO dealer_users (
  id,
  dealer_id,
  email,
  password_hash,
  role,
  first_name,
  last_name,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'YOUR_DEALER_ID_HERE',           -- replace: UUID from the dealers table
  'admin@yourdealer.com',          -- replace: the admin's login email
  '$2b$12$REPLACE_WITH_BCRYPT_HASH', -- replace: output of the node command above
  'admin',
  'Admin',                         -- replace: first name
  'User',                          -- replace: last name
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Verify the row was created:
SELECT id, dealer_id, email, role, is_active, created_at
FROM dealer_users
WHERE email = 'admin@yourdealer.com';
