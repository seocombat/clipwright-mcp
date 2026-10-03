# @clipwright/core

Zod schemas and the shared request/response contract of the
[Clipwright](https://clipwright.io/?ref=npm) UGC and faceless video API. Published because
the SDK and the MCP server depend on it; the API validates against these same
schemas, so they are the contract rather than a copy of it.

What is here: the `make_ugc` input shape, the `make_faceless` input and quote
shapes with the faceless price (`quoteFaceless`), the run object, aspect-ratio and
resolution resolution rules, speech-pacing rules, the voice catalog, and the field
disposition registry — the table that records, per input field, whether it is
honored, rejected, or accepted-with-a-warning.

The `./idempotency` subpath export is separate because it pulls in a Node
built-in and would otherwise break bundlers targeting the browser.

## Changelog

What changed in each release, and what was removed, is in `CHANGELOG.md` inside
this package. The four Clipwright packages share one version.
