-- The grouping key written out, next to its digest. The digest embeds the internal source id and
-- cannot be reversed, so a dump writes this instead; without it, a grouping no live record still
-- produces could not be written out at all. Null only on a row older than this migration that no
-- record's body produces any more.
alter table grouping add column written_key jsonb;

alter table grouping add constraint grouping_written_key check (
    written_key is null
    or (jsonb_typeof(written_key) = 'object' and case kind
            when 'family' then written_key ? 'group' or written_key ? 'key'
            else written_key ? 'family' and written_key ? 'variant'
        end)
);

-- Backfilled from every record body, withdrawn ones included. The key strings are built here the
-- way @prodid/core canonicalizes them (RFC 8785; variant axes are ASCII, so "C" order is UTF-16
-- order), and a row is filled only where the digest of that string is the row's own key, so a
-- string built wrongly fills nothing rather than something false.
with keys as (
    select r.source,
        case when r.body ? 'group'
             then jsonb_build_object('group', r.body->'group')
             else jsonb_build_object('key', r.key)
        end as family,
        case when r.body ? 'group'
             then '{"group":' || to_json(r.body->>'group')::text
             else '{"key":' || to_json(r.key)::text
        end || ',"source":' || to_json(r.source::text)::text || '}' as family_text,
        coalesce(r.body->'variant', '{}'::jsonb) as variant,
        coalesce((
            select '{' || string_agg(to_json(e.axis)::text || ':' || to_json(e.value)::text, ',' order by e.axis collate "C") || '}'
            from jsonb_each_text(r.body->'variant') as e(axis, value)
        ), '{}') as variant_text
    from record r
), written as (
    select distinct on (source, kind, key) source, kind, key, written_key
    from (
        select source, 'family' as kind, encode(sha256(convert_to(family_text, 'UTF8')), 'hex') as key, family as written_key
        from keys
        union all
        select source, 'variant',
            encode(sha256(convert_to('{"family":' || to_json(family_text)::text || ',"variant":' || variant_text || '}', 'UTF8')), 'hex'),
            jsonb_build_object('family', family, 'variant', variant)
        from keys
    ) k
    order by source, kind, key
)
update grouping g set written_key = w.written_key
from written w
where g.source = w.source and g.kind = w.kind and g.key = w.key;

do $$
declare
    missing int;
begin
    select count(*) into missing from grouping where written_key is null;
    if missing > 0 then
        raise notice 'grouping: % row(s) match no record body and keep no written key; a dump leaves them out', missing;
    end if;
end $$;
