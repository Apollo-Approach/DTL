-- supabase/migrations/20260518020000_safety_mods_enums.sql

-- 1. Rename existing roles to match M-Tier nomenclature
ALTER TYPE public.user_role RENAME VALUE 'responder' TO 'm2_responder';
ALTER TYPE public.user_role RENAME VALUE 'admin' TO 'm3_admin';

-- 2. Add new roles
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'm1_observer';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'promoter';

-- 3. Create ENUM for Crisis Resolution Reporting
CREATE TYPE public.resolution_code AS ENUM (
    'NALOXONE_ADMINISTERED', 
    'DE_ESCALATED', 
    'EMS_DISPATCHED', 
    'POLICE_DISPATCHED',
    'FALSE_ALARM', 
    'OTHER'
);
