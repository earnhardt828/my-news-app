alter table public.comments add column if not exists article_title text;
alter table public.comments add column if not exists article_source text;
alter table public.comments add column if not exists article_image text;
alter table public.comments add column if not exists article_url text;
