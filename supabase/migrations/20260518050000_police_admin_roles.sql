-- Add m4_police and m5_sysadmin to user_role ENUM
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'm4_police';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'm5_sysadmin';
