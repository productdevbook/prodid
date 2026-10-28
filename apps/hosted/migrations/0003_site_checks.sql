-- When a site's owner last pressed "Check now", which runs at most once a minute per site.

alter table site add column checked_at text;
