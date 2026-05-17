-- supabase/migrations/20260515_05_rbac_profiles.sql

-- 1. Create the user_role enum
CREATE TYPE public.user_role AS ENUM ('citizen', 'responder', 'admin');

-- 2. Create the profiles table linked to auth.users
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.user_role NOT NULL DEFAULT 'citizen',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 5. Create Trigger to automatically insert a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role)
    VALUES (new.id, 'citizen');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
