-- When an account signed in, for the last ten sign-ins its account page lists. A session row is
-- not that: signing out deletes it.

create table sign_in (
    account_id      text not null references account (id) on delete cascade,
    at              text not null
);

create index sign_in_account on sign_in (account_id, at);
