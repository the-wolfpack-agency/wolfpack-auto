-- Migration 084: per-dealer outbound email sender (FROM address)
--
-- Today every outbound email reads RESEND_FROM_EMAIL (a single platform
-- address). That means replies land in our inbox rather than the dealer's,
-- and customers see "leads@wolfpackauto.com" instead of the dealership.
--
-- Adding dealers.from_email lets each rooftop set its own branded FROM
-- string (e.g. "Mile High Motors <leads@milehighmotors.com>"). When unset
-- the platform falls back to dealers.email, then RESEND_FROM_EMAIL, then a
-- generic platform sender — fully backwards-compatible.
--
-- DKIM / domain verification on Resend remains an operational task, this
-- column only records the dealer's chosen sender string.

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS from_email TEXT;

COMMENT ON COLUMN dealers.from_email IS
  'Outbound email FROM string used by lib/email.ts. NULL => fall back to dealers.email then RESEND_FROM_EMAIL.';
