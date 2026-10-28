-- When the owner of a site with no feed was mailed that it will be released. Cleared once the site
-- has a feed, so a site that empties again is warned again.

alter table site add column reminded_at text;
