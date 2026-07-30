# Colour corpus

The two files SDD-25 §6.2 names, copied from `packages/language-server/fixtures/`.

**Copied, not referenced, and frozen.** They are a *colour* fixture: the grammar tests
assert where each embedded region begins and ends and that nothing bleeds to the end of the
file. If they tracked the LSP corpus, a change to the virtual emitter would silently
rewrite the input of a test about TextMate — two unrelated things failing together.

Between them they cover everything the grammar has to get right:

| Construct | Where |
|---|---|
| `@code` with `@server` inside | `blog/[slug].fud` |
| `@section name { … }` | `blog/[slug].fud` |
| `@(expr)` in an attribute value, `@ident.path` in text | both |
| `<style>` with `:host` | `components/app-badge.fud` |
| `class:` binding | `components/app-badge.fud` |
| component tag vs native tag | both |
| `<link rel href>` | `blog/[slug].fud` |

If a construct is not represented here, its test builds its own inline source. The corpus is
the *realistic* case, not the exhaustive one.
