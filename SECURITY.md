# Security policy

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/productdevbook/prodid/security/advisories/new). Do not
open a public issue, pull request or discussion for it.

Say what is affected, how to reproduce it, and what an attacker gains. You will get a response
within 7 days.

## In scope

The reference implementation in this repository and the services it runs on prodid.org:

- The crawler's fetch guard and limits: server-side request forgery, and amplification through
  `POST /ping`, discovery, feeds or media fetches.
- Discovery and identity takeover: becoming the source for a domain or a hosted slug without
  controlling it, or raising a source's trust without the proof the spec requires.
- Media serving on `media.prodid.org`, including getting around the takedown list.
- The hosted publisher (`<slug>.prodid.org` and its operator endpoint): its authentication and its
  uploads.
- The public source status used as a probe: learning from it, or from any response, more than the
  spec says it reveals.

## Out of scope

The limits the trust model states in the specification's
[Security considerations](spec/README.md#security-considerations):

- Whoever can write `_prodid.<domain>` controls that identity; a domain whose DNS is shared is a
  shared identity.
- Where no record and no document exist yet, whoever publishes first becomes the source for that
  domain.
- Claims made while an attacker controlled a domain's DNS or host stay attributed to the source
  until they are withdrawn.
- A domain that changes hands is a new controller of the same identity.
- Trust is about control, not truth: a source publishing wrong data is not a vulnerability.
