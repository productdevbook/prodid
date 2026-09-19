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
    failing_since   timestamptz,
    -- null means the discovery document is fetched from `name` itself
    feed_host       text,
    license         text,
    last_crawled_at timestamptz,
    created_at      timestamptz not null default now(),

    check (num_nonnulls(verified_by, verified_at, verified_crawl)
           = case when trust = 'unverified' then 0 else 3 end)
);

create index source_due on source (last_crawled_at nulls first);
create index source_lapsed on source (lapsed_at) where lapsed_at is not null;
create index source_failing on source (failing_since) where failing_since is not null and lapsed_at is null;

create table feed (
    source          bigint not null references source (id) on delete restrict,
    url             text not null check (url ~ '^https://'),
    etag            text,
    last_modified   text,
    last_fetched_at timestamptz,
    last_status     int check (last_status between 100 and 599),
    skipping_since  timestamptz,

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
    lines_skipped   int check (lines_skipped >= 0),
    error           text,
    -- carries the source only while this run is a success, so a source can key a foreign
    -- key on it and no later edit can turn its proof into a failed or unfinished run
    proof_source    bigint generated always as
                    (case when outcome in ('changed','unchanged') then source end) stored,

    check ((finished_at is null) = (outcome is null)),
    unique (id, proof_source)
);

create index crawl_latest on crawl (source, started_at desc);

alter table source add constraint source_verified_crawl_fkey
    foreign key (verified_crawl, id) references crawl (id, proof_source);

-- ------------------------------------------------------------- entities

create table entity (
    opid        text primary key check (opid ~ '^[0-9a-hjkmnp-tv-z]{16}$'),
    kind        text not null check (kind in ('family','variant','item')),
    parent      text references entity (opid) on delete restrict,
    merged_into text references entity (opid) on delete restrict,
    created_at  timestamptz not null default now(),

    check (parent is null or parent <> opid),
    check (merged_into is null or merged_into <> opid),
    -- lets grouping key a foreign key on (opid, kind); it also makes kind a key column, so
    -- changing it takes `for update` and cannot pass a reader of this row
    unique (opid, kind)
);

create index entity_children on entity (parent) where parent is not null;
create index entity_merged on entity (merged_into) where merged_into is not null;

-- The locks are the enforcement. A child reads its parent's kind under `for share`, which
-- conflicts with the `for no key update` that changing that parent's kind takes, so the two
-- cannot pass each other. An update locks its own row first, because a before trigger runs
-- ahead of the row lock the update itself would take and would otherwise count children
-- against a stale snapshot.
create function entity_parent_kind() returns trigger
language plpgsql as $$
declare
    expected text;
    actual   text;
begin
    if tg_op = 'UPDATE' and new.kind <> old.kind then
        perform 1 from entity where opid = new.opid for no key update;
        if exists (select 1 from entity where parent = new.opid) then
            raise exception 'entity % has children, its kind cannot change', new.opid
                using errcode = 'integrity_constraint_violation';
        end if;
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

    select kind into actual from entity where opid = new.parent for share;
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

-- ------------------------------------------------------------- groupings

create table grouping (
    source bigint not null references source (id) on delete restrict,
    kind   text not null check (kind in ('family','variant')),
    key    text not null check (key ~ '^[0-9a-f]{64}$'),
    opid   text not null references entity (opid) on delete restrict,

    primary key (source, kind, key),
    foreign key (opid, kind) references entity (opid, kind)
);

-- read by the foreign key above whenever an entity's kind changes, and by anything asking
-- which groupings resolved to an entity
create index grouping_entity on grouping (opid, kind);

-- ---------------------------------------------------------------- merges

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

-- Every writer of either side takes `for share` on the entity row, and anyone changing
-- entity.merged_into holds `for no key update` on it from its own update, so the entity row
-- is the single point both sides of a merge contend on.
create function merge_state_agrees(p_opid text) returns void
language plpgsql as $$
declare
    state  text;
    logged text;
    n      int;
begin
    select merged_into into state from entity where opid = p_opid for share;
    if not found then
        return;
    end if;

    select count(*), min(into_opid) into n, logged
    from merge where from_opid = p_opid and reverted_at is null;

    if state is null and n > 0 then
        raise exception 'entity % is not merged but has an un-reverted merge into %', p_opid, logged
            using errcode = 'integrity_constraint_violation';
    end if;

    if state is not null and n = 0 then
        raise exception 'entity % is merged into % with no un-reverted merge row', p_opid, state
            using errcode = 'integrity_constraint_violation';
    end if;

    if state is not null and logged is distinct from state then
        raise exception 'entity % is merged into % but its merge row says %', p_opid, state, logged
            using errcode = 'integrity_constraint_violation';
    end if;
end $$;

-- Deferred: merging a survivor and repointing what pointed at it is one transaction that is
-- inconsistent in the middle. The row state is re-read rather than taken from `new`, so a row
-- touched more than once in the transaction is judged by its final state.
create function entity_merge_is_final() returns trigger
language plpgsql as $$
declare
    target  text;
    blocker text;
begin
    select merged_into into target from entity where opid = new.opid;
    perform merge_state_agrees(new.opid);

    if target is null then
        return null;
    end if;

    select merged_into into blocker from entity where opid = target for share;
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

create constraint trigger entity_merge_is_final_insert
    after insert on entity
    deferrable initially deferred
    for each row
    when (new.merged_into is not null)
    execute function entity_merge_is_final();

create constraint trigger entity_merge_is_final_update
    after update of merged_into on entity
    deferrable initially deferred
    for each row
    when (new.merged_into is distinct from old.merged_into)
    execute function entity_merge_is_final();

create function merge_agrees_with_entity() returns trigger
language plpgsql as $$
begin
    perform merge_state_agrees(new.from_opid);
    return null;
end $$;

create constraint trigger merge_agrees_with_entity
    after insert or update of reverted_at on merge
    deferrable initially deferred
    for each row execute function merge_agrees_with_entity();

-- ---------------------------------------------------------- identifiers

create table identifier (
    scheme       text not null check (scheme ~ '^[a-z][a-z0-9-]{0,31}$'),
    scope        text not null,
    value        text not null check (value <> ''),
    opid         text not null references entity (opid) on delete restrict,
    first_source bigint not null references source (id) on delete restrict,
    first_seen   timestamptz not null default now(),

    primary key (scheme, scope, value),
    -- the all-zero gtin is a placeholder, and one row for it would merge every catalogue using it
    check (scheme <> 'gtin' or (value ~ '^[0-9]{14}$' and value <> '00000000000000')),
    check (case
               when scheme = 'mpn' then scope <> ''
               when scheme in ('sku','rcn') then scope ~ '^[0-9]+$'
               else scope = ''
           end)
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
    -- the key only while the record is live; claims key their foreign key on it, so a record
    -- cannot be withdrawn out from under an active claim and no active claim can be written
    -- under a withdrawn record. Writing it also makes withdrawal a key update, which takes
    -- `for update` and so conflicts with the `for key share` a claim's check takes.
    live_key     text generated always as (case when withdrawn_at is null then key end) stored,

    primary key (source, key),
    unique (source, live_key)
);

create index record_entity on record (opid);

-- -------------------------------------------------------------- claims

create table claim (
    id                bigint generated always as identity primary key,
    opid              text not null references entity (opid) on delete restrict,
    property          text not null check (property <> ''),
    value             jsonb not null,
    lang              text check (lang ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
    source            bigint not null references source (id) on delete restrict,
    record_key        text,
    seen_at           timestamptz not null default now(),
    withdrawn_at      timestamptz,
    evidence          jsonb,
    active_record_key text generated always as (case when withdrawn_at is null then record_key end) stored,

    foreign key (source, record_key) references record (source, key) on delete restrict,
    foreign key (source, active_record_key) references record (source, live_key)
        deferrable initially deferred
);

create index claim_active on claim (opid, property) where withdrawn_at is null;

-- Two claims are duplicates when their values are equal. Equality is canonical JSON as
-- @prodid/core defines it and every writer passes values through it before they arrive here;
-- this digest only stands in for `value`, which alone can exceed a btree entry. md5 over
-- jsonb's canonical text is the only core digest usable in an index expression: sha256 takes
-- bytea, convert_to is stable, and text::bytea parses \x escapes.
create unique index claim_active_unique
    on claim (source, record_key, opid, property, lang, md5(value::text))
    nulls not distinct
    where withdrawn_at is null;

-- --------------------------------------------------------------- media

create table media (
    sha256       text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
    bytes        bigint not null check (bytes >= 0),
    content_type text not null check (content_type <> ''),
    first_seen   timestamptz not null default now(),
    blocked_at   timestamptz
);
