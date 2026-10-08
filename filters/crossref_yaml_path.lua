--[[
  crossref_yaml_path.lua — run BEFORE pandoc-crossref.

  pandoc expands ${USERDATA} only in path-typed defaults keys (filters, template,
  reference-doc, csl, …). A `metadata:` value is a literal string, so
  `crossrefYaml: ${USERDATA}/defaults/crossref.yaml` reaches pandoc-crossref
  verbatim; it cannot open that path and silently falls back to its built-in
  prefixes ("fig.", "eq."). This filter expands the variable to pandoc's user
  data directory (set by the defaults' `data-dir: ${.}/..`), so the shipped
  crossref.yaml is the one pandoc-crossref reads.

  The yaml keeps the portable ${USERDATA}/ form the repo's invariants require,
  and bundling still finds the file from it.
]]

function Meta(meta)
  if not meta.crossrefYaml then return nil end
  local path = pandoc.utils.stringify(meta.crossrefYaml)
  local ud = PANDOC_STATE.user_data_dir
  if not ud or not path:find("${USERDATA}", 1, true) then return nil end
  meta.crossrefYaml = pandoc.MetaString((path:gsub("%${USERDATA}", function() return ud end)))
  return meta
end
