-- Authority grants. See docs/design/04-index.md "Authoritative brands".

-- One grant names one normalized brand of one source, on the evidence of a public lookup URL. A
-- revoked grant keeps its row: the table is the record of who granted what and when it ended.
create table authority (
    id         bigint generated always as identity primary key,
    source     bigint not null references source (id) on delete restrict,
    brand      text not null check (brand <> ''),
    evidence   text not null check (evidence ~ '^https://'),
    decided_by text not null check (decided_by <> ''),
    decided_at timestamptz not null default now(),
    revoked_at timestamptz,

    check (revoked_at is null or revoked_at >= decided_at)
);

create unique index authority_active on authority (source, brand) where revoked_at is null;

-- Only a domain can be more than unverified. The source row is read `for share`, which a
-- concurrent change of its kind (`for no key update`) cannot pass.
create function authority_source_is_domain() returns trigger
language plpgsql as $$
declare
    actual text;
begin
    select kind into actual from source where id = new.source for share;
    if actual is distinct from 'domain' then
        raise exception 'source % is a %, and only a domain can be granted authority', new.source, coalesce(actual, 'missing source')
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end $$;

create trigger authority_source_is_domain
    before insert or update of source on authority
    for each row execute function authority_source_is_domain();

-- `authoritative` is never stored: it holds exactly while the proven domain is not lapsed and a
-- grant is unrevoked, so it is read from those facts and drops the moment either goes.
update source set trust = 'verified' where trust = 'authoritative';
alter table source add constraint source_trust_is_proof check (trust <> 'authoritative');

create function source_trust(s source) returns text
language sql stable as $$
    select case
        when s.trust = 'unverified' then 'unverified'
        when s.lapsed_at is null
             and exists (select 1 from authority a where a.source = s.id and a.revoked_at is null) then 'authoritative'
        else 'verified'
    end
$$;
