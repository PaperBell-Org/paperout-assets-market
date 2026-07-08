-- luacheck config for Pandoc Lua filters.
std = "min"
-- Globals Pandoc injects into filter scripts.
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
-- Filters commonly take (elem) / loop vars they don't all use; don't fail on that.
ignore = {
  "212", -- unused argument
  "213", -- unused loop variable
  "614", -- trailing whitespace in comment
}
max_line_length = false
