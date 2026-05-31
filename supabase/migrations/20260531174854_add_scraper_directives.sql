ALTER TABLE public.venues
ADD COLUMN scraper_directives JSONB DEFAULT '{}'::jsonb;
