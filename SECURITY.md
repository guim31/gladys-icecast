# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration stores and sends:

- `/data/icecast-state.json` holds what the integration saw of each mount
  point (on air or not, the title, the start of the stream, the peak of the
  day and the listener thresholds reached). No secret is written there.
- No password is asked: the integration only reads the public status page of
  Icecast (`/status-json.xsl`), never its admin pages. Redirects are not
  followed.
- The container only talks to that Icecast server and to Gladys.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the Icecast server the integration talks to.
