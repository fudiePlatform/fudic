// The types of `fudic:blog/[slug]`, as the host generates them from `blog/[slug].fudapi`
// (SDD-60 §3.11). Written by hand: this package reads no `.fudapi`, its host does.
declare module 'fudic:blog/[slug]' {
  export interface LoadData {
    readonly title: string;
    readonly tag: string;
    readonly body: string;
    readonly found: boolean;
    readonly note?: string;
  }
}
