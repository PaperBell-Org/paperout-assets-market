-- luacheck config for Pandoc Lua filters.
--
-- Pandoc filters register element handlers (Header, Div, Str, Pandoc, …) as globals
-- and frequently use module-level globals. luacheck flags all of that as
-- "non-standard global" / "undefined variable" — noise for this asset library.
-- Real safety is enforced elsewhere: scripts/scan-security.mjs (dangerous APIs) and
-- build-recipe (which actually runs every filter through pandoc, so any syntax or
-- runtime error surfaces there). Here luacheck only guards against Lua syntax errors,
-- so the style checks below are relaxed.

std = "max"
read_globals = {
  "pandoc",
  "PANDOC_STATE",
  "PANDOC_VERSION",
  "PANDOC_API_VERSION",
  "PANDOC_READER_OPTIONS",
  "PANDOC_WRITER_OPTIONS",
  "PANDOC_SCRIPT_FILE",
  "FORMAT",
  "utf8",
}
allow_defined = true      -- a global defined anywhere (element handlers) may be used
global = false            -- filters legitimately define/use globals
unused = false
unused_args = false
redefined = false
max_line_length = false
ignore = { "5.*", "6.*" } -- control-flow hints + whitespace style noise (not errors)
