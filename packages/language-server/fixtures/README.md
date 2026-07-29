# Fixture workspace

The test project of SDD-24 §6, on disk: a real folder with a real `tsconfig.json`, because
criteria 1, 9 and 13 (start-up against a workspace, inter-file repaint, hot creation of a
`.fud`) are about the filesystem and cannot be faked in memory.

The four `.fud` are the corpus SDD-23 already typechecks, so a diagnostic that shows up
here and not there is a server bug, not a projection bug.

```
blog/[slug].fud          route: layout link, two component links, @server load/paths, @section nav
layouts/_layout.fud      layout: @RenderHead / @RenderSection(nav) / @RenderBody
components/site-nav.fud  component with props<{ current?: string }>()
components/app-badge.fud component with props<{ tone?: Tone }>() and a <style>
data/posts.ts            the module `load()` imports
```

`fudic-globals.d.ts` is deliberately **absent**. A project that never ran `fudic new` is the
interesting case: the server mounts `GLOBALS_DTS` as a virtual lib (SDD-24 §2), and this
workspace is what proves it. The on-disk variant — where the file exists and declares the
same thing — gets its own fixture when that path is tested.
