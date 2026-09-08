--[[
  manuscript-docx.lua —— Word 稿件抬头（标题 / 作者 / 单位 / 通讯 / 摘要 / 关键词）

  从 metadata 生成投稿版式的抬头，插到正文之前。每一块都包在带 custom-style 的 Div
  里，套用 templates/manuscript-reference.docx 定义的命名样式；custom-style 匹配的是
  样式的 w:name（不是 styleId），所以下面的名字要和母版里的 <w:name> 一致：

    Title / Author / Affiliation / Corresponding / Abstract Title / Abstract / Keywords

  这样版式全部由母版决定 —— 换一本刊物只要换母版，不用动这个 filter。
--]]

-- 样式名：与 templates/manuscript-reference.docx 的 <w:name> 一一对应。
local STYLE = {
  title = "Title",
  author = "Author",
  affiliation = "Affiliation",
  corresponding = "Corresponding",
  abstract_title = "Abstract Title",
  abstract = "Abstract",
  keywords = "Keywords",
}

-- pandoc 3.x 把 MetaBlocks 交给 Lua 时是一个没有 .t 字段的 Blocks 列表，所以旧代码里
-- `val.t == "MetaBlocks"` 这类判断永远不成立，多行 abstract 会掉进 inline 分支并让
-- pandoc.Para(blocks) 直接报 "object has no __toinline metamethod"。一律用
-- pandoc.utils.type 判断。
local function meta_type(val)
  local ok, t = pcall(pandoc.utils.type, val)
  return ok and t or nil
end

--- metadata 值 → Inlines（标题、姓名、关键词这类一定是行内的位置）
local function as_inlines(val)
  if val == nil then return pandoc.List({}) end
  local t = meta_type(val)
  if t == "Inlines" then return pandoc.List(val) end
  if t == "Blocks" then return pandoc.List(pandoc.utils.blocks_to_inlines(val)) end
  return pandoc.List({ pandoc.Str(pandoc.utils.stringify(val)) })
end

--- metadata 值 → Blocks（摘要：既可能是单行字符串，也可能是 `abstract: |` 多段）
local function as_blocks(val)
  if val == nil then return pandoc.List({}) end
  local t = meta_type(val)
  if t == "Blocks" then return pandoc.List(val) end
  if t == "Inlines" then return pandoc.List({ pandoc.Para(pandoc.List(val)) }) end
  return pandoc.List({ pandoc.Para({ pandoc.Str(pandoc.utils.stringify(val)) }) })
end

local function styled(name, blocks)
  return pandoc.Div(blocks, pandoc.Attr("", {}, { { "custom-style", name } }))
end

local function styled_para(name, inlines)
  return styled(name, { pandoc.Para(inlines) })
end

--- 作者的 affiliation 可以是标量也可以是列表；`[1, 2]` 直接 stringify 会粘成 "12"。
local function affiliation_label(val)
  if val == nil then return nil end
  if meta_type(val) == "List" then
    local parts = {}
    for _, v in ipairs(val) do parts[#parts + 1] = pandoc.utils.stringify(v) end
    return table.concat(parts, ",")
  end
  local s = pandoc.utils.stringify(val)
  return s ~= "" and s or nil
end

--- `corresponding:` 可能是邮箱，也可能只是 true（仅用来打星号）。
local function corresponding_address(val)
  if val == nil or val == false then return nil end
  local s = pandoc.utils.stringify(val)
  return s:find("@", 1, true) and s or nil
end

function Pandoc(doc)
  local meta = doc.meta
  local head = pandoc.List()

  if meta.title then
    head:insert(styled_para(STYLE.title, as_inlines(meta.title)))
  end

  if meta.authors then
    local line = pandoc.List()
    for i, a in ipairs(meta.authors) do
      if a.name then line:extend(as_inlines(a.name)) end
      local aff = affiliation_label(a.affiliation)
      if aff then line:insert(pandoc.Superscript(pandoc.Str(aff))) end
      if a.corresponding then line:insert(pandoc.Superscript(pandoc.Str("*"))) end
      if i < #meta.authors then
        line:insert(pandoc.Str(","))
        line:insert(pandoc.Space())
      end
    end
    head:insert(styled_para(STYLE.author, line))
  end

  if meta.affiliations then
    for _, aff in ipairs(meta.affiliations) do
      local line = pandoc.List()
      if aff.index then
        line:insert(pandoc.Superscript(pandoc.Str(pandoc.utils.stringify(aff.index))))
        line:insert(pandoc.Space())
      end
      if aff.name then line:extend(as_inlines(aff.name)) end
      head:insert(styled_para(STYLE.affiliation, line))
    end
  end

  -- 多个通讯作者共用同一个星号，地址并成一行；每人一行、行行带星号是错的。
  if meta.authors then
    local addresses = {}
    for _, a in ipairs(meta.authors) do
      local address = corresponding_address(a.corresponding)
      if address then addresses[#addresses + 1] = address end
    end
    if #addresses > 0 then
      local line = pandoc.List({
        pandoc.Superscript(pandoc.Str("*")),
        pandoc.Space(),
        pandoc.Str("Correspondence:"),
        pandoc.Space(),
      })
      for i, address in ipairs(addresses) do
        if i > 1 then
          line:insert(pandoc.Str(";"))
          line:insert(pandoc.Space())
        end
        line:insert(pandoc.Str(address))
      end
      head:insert(styled_para(STYLE.corresponding, line))
    end
  end

  if meta.abstract then
    head:insert(styled_para(STYLE.abstract_title, { pandoc.Str("Abstract") }))
    head:insert(styled(STYLE.abstract, as_blocks(meta.abstract)))
  end

  if meta.keywords then
    local line = pandoc.List({ pandoc.Strong({ pandoc.Str("Keywords:") }), pandoc.Space() })
    for i, kw in ipairs(meta.keywords) do
      line:extend(as_inlines(kw))
      if i < #meta.keywords then
        line:insert(pandoc.Str(";"))
        line:insert(pandoc.Space())
      end
    end
    head:insert(styled_para(STYLE.keywords, line))
  end

  -- 抬头已经手工排好，清掉这些键，否则 docx writer 会在最上面再自动生成一份
  -- 标题/作者/日期/摘要。
  meta.title = nil
  meta.author = nil
  meta.authors = nil
  meta.date = nil
  meta.abstract = nil

  head:extend(doc.blocks)
  return pandoc.Pandoc(head, meta)
end
