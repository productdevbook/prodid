-- Which account owns which hosted site. The site itself stays in R2, whose `site.json` repeats the
-- owner. A deleted site keeps its row for 30 days, so nobody else can take its slug while the index
-- still remembers the source.

create table site (
    slug            text primary key,
    account_id      text references account (id) on delete set null,
    created_at      text not null,
    deleted_at      text
);

create index site_account on site (account_id, deleted_at);
