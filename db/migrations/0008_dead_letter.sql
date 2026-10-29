-- The last dead letter each dead letter queue consumed, so the cron can tell the owner's status page
-- that a day has passed without one.
create table dead_letter (
    queue   text primary key check (queue ~ '^[a-z0-9-]+$'),
    last_at timestamptz not null,
    message text not null check (char_length(message) between 1 and 1000)
);
