-- Dataset sources and their imports. See docs/design/04-index.md "Datasets".

alter table crawl drop constraint crawl_via_check;
alter table crawl add constraint crawl_via_check check (via in ('well-known','dns-txt','import'));

-- An import reads a public export and is never a fetch, so it has no HTTP status, and one that
-- does not finish is never closed as a failure: it stays open and is not shown.
alter table crawl add constraint crawl_import check (
    via is distinct from 'import'
    or (document_url ~ '^https://' and http_status is null and (outcome is null or outcome in ('changed','unchanged')))
);

-- A dataset is never discovered, so it never fails, never lapses and proves nothing. A hostname
-- cannot hold `:`, so only a dataset is named with one; the `dataset:<slug>` grammar is the store's.
alter table source add constraint source_dataset check (
    case when kind = 'dataset'
         then trust = 'unverified' and lapsed_at is null and failing_since is null
         else position(':' in name) = 0
    end
);

-- Being a dataset is fixed at creation, so a crawl's check of its source's kind cannot be passed
-- by a concurrent change of that kind.
create function source_dataset_kind_fixed() returns trigger
language plpgsql as $$
begin
    if (old.kind = 'dataset') <> (new.kind = 'dataset') then
        raise exception 'source % cannot change kind from % to %', old.id, old.kind, new.kind
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end $$;

create trigger source_dataset_kind_fixed
    before update of kind on source
    for each row execute function source_dataset_kind_fixed();

create function crawl_via_matches_source() returns trigger
language plpgsql as $$
declare
    dataset boolean;
begin
    select kind = 'dataset' into dataset from source where id = new.source;
    if dataset and new.via is distinct from 'import' then
        raise exception 'dataset source % is only ever imported, not crawled via %', new.source, coalesce(new.via, 'nothing')
            using errcode = 'integrity_constraint_violation';
    end if;
    if not dataset and new.via = 'import' then
        raise exception 'source % is not a dataset and cannot be imported', new.source
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end $$;

create trigger crawl_via_matches_source
    before insert or update of via, source on crawl
    for each row execute function crawl_via_matches_source();
