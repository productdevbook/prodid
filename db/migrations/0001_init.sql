-- prodid index — initial schema. See ARCHITECTURE.md "Index contract" and "Semantics".

-- -------------------------------------------------------------- sources

create table source (
    id              bigint generated always as identity primary key,
    kind            text not null check (kind in ('domain','hosted','dataset','community')),
    name            text not null unique,
    trust           text not null default 'unverified'
                    check (trust in ('authoritative','verified','unverified')),
    verified_by     text check (verified_by in ('well-known','dns-txt')),
    verified_at     timestamptz,
    -- the crawl that proved control; the foreign key is added once crawl exists
    verified_crawl  bigint,
    lapsed_at       timestamptz,
    -- null means the discovery document is fetched from `name` itself
    feed_host       text,
    license         text,
    last_crawled_at timestamptz,
    created_at      timestamptz not null default now(),

    check (num_nonnulls(verified_by, verified_at, verified_crawl) in (0, 3))
);

create index source_due on source (last_crawled_at nulls first);
create index source_lapsed on source (lapsed_at) where lapsed_at is not null;

create table feed (
    source          bigint not null references source (id) on delete restrict,
    url             text not null check (url ~ '^https://'),
    etag            text,
    last_modified   text,
    last_fetched_at timestamptz,
    last_status     int check (last_status between 100 and 599),

    primary key (source, url)
);

create table crawl (
    id              bigint generated always as identity primary key,
    source          bigint not null references source (id) on delete restrict,
    -- null when neither discovery path produced a document
    via             text check (via in ('well-known','dns-txt')),
    document_url    text,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    outcome         text check (outcome in ('changed','unchanged','no-discovery','rejected','fetch-failed')),
    http_status     int check (http_status between 100 and 599),
    records_seen    int check (records_seen >= 0),
    records_changed int check (records_changed >= 0),
    error           text,

    check ((finished_at is null) = (outcome is null))
);

create index crawl_latest on crawl (source, started_at desc);

alter table source add constraint source_verified_crawl_fkey
    foreign key (verified_crawl) references crawl (id) on delete restrict;

-- ------------------------------------------------------------- entities

create table entity (
    opid        text primary key check (opid ~ '^[0-9a-hjkmnp-tv-z]{16}$'),
    kind        text not null check (kind in ('family','variant','item')),
    parent      text references entity (opid) on delete restrict,
    merged_into text references entity (opid) on delete restrict,
    created_at  timestamptz not null default now(),

    check (parent is null or parent <> opid),
    check (merged_into is null or merged_into <> opid)
);

create index entity_children on entity (parent) where parent is not null;
create index entity_merged on entity (merged_into) where merged_into is not null;

create function entity_parent_kind() returns trigger
language plpgsql as $$
declare
    expected text;
    actual   text;
begin
    if tg_op = 'UPDATE' and new.kind <> old.kind
       and exists (select 1 from entity where parent = new.opid) then
        raise exception 'entity % has children, its kind cannot change', new.opid
            using errcode = 'integrity_constraint_violation';
    end if;

    expected := case new.kind when 'variant' then 'family' when 'item' then 'variant' end;

    if expected is null then
        if new.parent is not null then
            raise exception 'family % must have no parent, it has %', new.opid, new.parent
                using errcode = 'integrity_constraint_violation';
        end if;
        return new;
    end if;

    if new.parent is null then
        raise exception '% % must have a % parent, it has none', new.kind, new.opid, expected
            using errcode = 'integrity_constraint_violation';
    end if;

    select kind into actual from entity where opid = new.parent;
    if actual is distinct from expected then
        raise exception '% % must have a % parent, % is a %',
            new.kind, new.opid, expected, new.parent, coalesce(actual, 'missing entity')
            using errcode = 'integrity_constraint_violation';
    end if;

    return new;
end $$;

create trigger entity_parent_kind
    before insert or update of kind, parent on entity
    for each row execute function entity_parent_kind();

-- Deferred: merging a survivor and repointing what pointed at it is one transaction
-- that is inconsistent in the middle. The row state is re-read rather than taken from
-- `new`, so a row touched more than once in the transaction is judged by its final state.
create function entity_merge_is_final() returns trigger
language plpgsql as $$
declare
    target  text;
    blocker text;
begin
    select merged_into into target from entity where opid = new.opid;
    if target is null then
        return null;
    end if;

    select merged_into into blocker from entity where opid = target;
    if blocker is not null then
        raise exception 'entity % merges into %, which is itself merged into %', new.opid, target, blocker
            using errcode = 'integrity_constraint_violation';
    end if;

    select opid into blocker from entity where merged_into = new.opid limit 1;
    if blocker is not null then
        raise exception 'entity % cannot merge while % is merged into it', new.opid, blocker
            using errcode = 'integrity_constraint_violation';
    end if;

    return null;
end $$;

create constraint trigger entity_merge_is_final
    after insert or update of merged_into on entity
    deferrable initially deferred
    for each row
    when (new.merged_into is not null)
    execute function entity_merge_is_final();

-- ---------------------------------------------------------- identifiers

create table identifier (
    scheme       text not null check (scheme ~ '^[a-z][a-z0-9-]{0,31}$'),
    -- '' for global schemes, the normalized brand for mpn, the source id for sku
    scope        text not null,
    value        text not null check (value <> ''),
    opid         text not null references entity (opid) on delete restrict,
    first_source bigint not null references source (id) on delete restrict,
    first_seen   timestamptz not null default now(),

    primary key (scheme, scope, value),
    check (scheme <> 'gtin' or value ~ '^[0-9]{14}$')
);

create index identifier_entity on identifier (opid);

-- ------------------------------------------------------------- records

create table record (
    source       bigint not null references source (id) on delete restrict,
    key          text not null check (key <> ''),
    opid         text not null references entity (opid) on delete restrict,
    hash         text not null check (hash ~ '^[0-9a-f]{64}$'),
    body         jsonb not null,
    first_seen   timestamptz not null default now(),
    last_seen    timestamptz not null default now(),
    withdrawn_at timestamptz,

    primary key (source, key)
);

create index record_entity on record (opid);

-- -------------------------------------------------------------- claims

create table claim (
    id           bigint generated always as identity primary key,
    opid         text not null references entity (opid) on delete restrict,
    property     text not null check (property <> ''),
    value        jsonb not null,
    lang         text check (lang ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
    source       bigint not null references source (id) on delete restrict,
    record_key   text,
    seen_at      timestamptz not null default now(),
    withdrawn_at timestamptz,
    evidence     jsonb,

    foreign key (source, record_key) references record (source, key) on delete cascade
);

create index claim_active on claim (opid, property) where withdrawn_at is null;

-- `value` alone can exceed a btree entry, so the digest stands in for it. md5 over jsonb's
-- canonical text output is the only core digest usable here: sha256 takes bytea, convert_to
-- is stable, and text::bytea parses \x escapes so it is neither total nor injective.
create unique index claim_active_unique
    on claim (source, record_key, opid, property, lang, md5(value::text))
    nulls not distinct
    where withdrawn_at is null;

-- Deferred: withdrawing a record and withdrawing its claims are two statements of one
-- transaction. Like the merge check, the row state is re-read so a record withdrawn and
-- restored in the same transaction is judged by its final state.
create function record_withdrawal_is_complete() returns trigger
language plpgsql as $$
declare
    blocker bigint;
begin
    if not exists (
        select 1 from record
        where source = new.source and key = new.key and withdrawn_at is not null
    ) then
        return null;
    end if;

    select id into blocker from claim
    where source = new.source and record_key = new.key and withdrawn_at is null
    limit 1;

    if blocker is not null then
        raise exception 'record (%, %) is withdrawn but claim % is still active', new.source, new.key, blocker
            using errcode = 'integrity_constraint_violation';
    end if;

    return null;
end $$;

create constraint trigger record_withdrawal_is_complete
    after insert or update of withdrawn_at on record
    deferrable initially deferred
    for each row
    when (new.withdrawn_at is not null)
    execute function record_withdrawal_is_complete();

-- -------------------------------------------------------------- merges

create table merge (
    id          bigint generated always as identity primary key,
    from_opid   text not null references entity (opid) on delete restrict,
    into_opid   text not null references entity (opid) on delete restrict,
    reason      text not null check (reason <> ''),
    decided_by  text not null check (decided_by <> ''),
    decided_at  timestamptz not null default now(),
    reverted_at timestamptz,

    check (from_opid <> into_opid)
);

create unique index merge_active on merge (from_opid) where reverted_at is null;

-- --------------------------------------------------------------- media

create table media (
    sha256       text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
    bytes        bigint not null check (bytes >= 0),
    content_type text not null check (content_type <> ''),
    first_seen   timestamptz not null default now(),
    blocked_at   timestamptz
);
