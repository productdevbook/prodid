/** One pair for both the markdown pipeline and the `<Code>` component; `defaultColor: false` leaves the choice to CSS. */
export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const

/** The spec writes grammars in ABNF, which Shiki has no grammar for. Without this every build warns. */
export const SHIKI_LANG_ALIAS = { abnf: 'plaintext' } as const
