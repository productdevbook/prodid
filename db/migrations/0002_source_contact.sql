-- `contact` is the `publisher.contact` of the last accepted document and is never published.
alter table source
    add column contact           text,
    add column notified_lapse_at timestamptz;
