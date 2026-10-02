# `@fudic/spec`

The `.fudspec` language: acceptance criteria written next to a component.

```
fud-button.fud
fud-button.fudspec
```

This package will own the parser and the validator that checks each line against the term
module (`given/`, `when/`, `then/`) that runs it. It does not depend on `@fudic/compiler`.
