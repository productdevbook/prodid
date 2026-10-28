-- Self-service accounts, sign-in links and sessions. See docs/design/06-hosted-and-operator.md.
-- Times are ISO 8601 UTC text from `Date.toISOString()`, so they compare as strings.

create table account (
    id              text primary key,
    email           text not null unique,
    created_at      text not null,
    last_sign_in_at text
);

-- only the SHA-256 of the mailed link is kept; `client` is the SHA-256 of the requesting
-- address's /32 or /64, for the per-address limit
create table login_token (
    hash            text primary key,
    account_email   text not null,
    client          text not null,
    expires_at      text not null,
    used_at         text
);

create index login_token_email on login_token (account_email, expires_at);
create index login_token_client on login_token (client, expires_at);

-- only the SHA-256 of the cookie value is kept
create table session (
    hash            text primary key,
    account_id      text not null references account (id) on delete cascade,
    created_at      text not null,
    expires_at      text not null
);

create index session_account on session (account_id, created_at);
