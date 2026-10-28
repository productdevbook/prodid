-- Why a grant was revoked: the operator's `--reason`, kept with the revocation it explains.
alter table authority add column revoked_reason text;

update authority set revoked_reason = 'revoked before reasons were kept' where revoked_at is not null;

alter table authority add constraint authority_revoked_reason check (
    (revoked_at is null) = (revoked_reason is null) and revoked_reason <> ''
);
