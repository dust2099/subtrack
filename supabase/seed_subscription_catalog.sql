-- Starter catalog for common subscriptions in Spain.
-- Prices and logos are intentionally null: they vary by plan and can be
-- filled in with verified values and public Storage URLs in Supabase.
insert into public.subscription_catalog
  (name, category, default_price, billing_cycle, logo_url)
select seed.name, seed.category, null, 'monthly', null
from (
  values
    ('Amazon Prime Video', 'Entertainment'),
    ('Apple Music', 'Music'),
    ('Apple TV+', 'Entertainment'),
    ('ChatGPT Plus', 'Software'),
    ('Crunchyroll', 'Entertainment'),
    ('DAZN', 'Sports'),
    ('Disney+', 'Entertainment'),
    ('Dropbox', 'Storage'),
    ('Duolingo Super', 'Education'),
    ('Filmin', 'Entertainment'),
    ('Google One', 'Storage'),
    ('Max', 'Entertainment'),
    ('Microsoft 365', 'Software'),
    ('Movistar Plus+', 'Entertainment'),
    ('Netflix', 'Entertainment'),
    ('Nintendo Switch Online', 'Gaming'),
    ('PlayStation Plus', 'Gaming'),
    ('Spotify', 'Music'),
    ('YouTube Premium', 'Entertainment')
) as seed(name, category)
where not exists (
  select 1
  from public.subscription_catalog as existing
  where lower(existing.name) = lower(seed.name)
);
