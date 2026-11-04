# `@fudic/history`

The history of each piece of a fudic app. Next to every component and every route lives a
`.fudlog` that only grows: who approved its criteria, every run of its tests and criteria with
its result, what the client accepted. Each line carries the hash of what went in, so you can
tell whether an approval or a green run still holds.

```
2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 4 hash 2b8f3c91aa04
2026-10-22T10:52Z 3c2b1a0 tests       pass 6/6  hash 5e7a90c3d211
```
