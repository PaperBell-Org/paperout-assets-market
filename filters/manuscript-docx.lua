--[[
  manuscript-docx.lua —— Word 稿件抬头（标题 / 作者 / 单位 / 通讯 / 摘要 / 关键词）

  从 metadata 生成投稿版式的抬头，插到正文之前。每一块都包在带 custom-style 的 Div
  里，套用 templates/manuscript-reference.docx 定义的命名样式；custom-style 匹配的是
  样式的 w:name（不是 styleId），所以下面的名字要和母版里的 <w:name> 一致：

    Title / Author / Affiliation / Corresponding / Abstract Title / Abstract / Keywords

  这样版式全部由母版决定 —— 换一本刊物只要换母版，不用动这个 filter。

  笔记的写法不止一种，这个 filter 对每种都要么排出内容、要么整块省略，不能吞字：
    authors: [{name:, affiliation:, corresponding:}, …]   完整形式
    authors: [张三, 李四] / author: 张三                    只有名字
    affiliations: [{index:, name:}, …] / [某院, 某所]
    keywords: [a, b] / keywords: a b
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

-- YAML 的 map（如 `- name: …`）到了 Lua 是普通 table；纯字符串条目则是 Inlines。
local function is_map(val)
  return meta_type(val) == "table"
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

--- 单值也好、列表也好，一律当成条目列表来遍历（`authors: 张三` 也是一个作者）
local function as_items(val)
  if val == nil then return {} end
  if meta_type(val) == "List" then return val end
  return { val }
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

--- 通讯地址：`email:` 优先，没有才看 `corresponding:`（它可能是邮箱，也可能只是
--- true，只用来打星号）。两个键都在共享 schema 里，见 catalog/manuscript-frontmatter.md
--- —— 只认 corresponding 的话，`email: … + corresponding: true` 的作者在投稿包里有
--- 地址、在 Word 里只剩一个光秃秃的星号。
local function corresponding_address(a)
  if not a.corresponding or a.corresponding == false then return nil end
  for _, key in ipairs({ "email", "corresponding" }) do
    local v = a[key]
    if v ~= nil and v ~= true and v ~= false then
      local s = pandoc.utils.stringify(v)
      if s:find("@", 1, true) then return s end
    end
  end
  return nil
end

--- 把若干段 Inlines 连起来，空的那些不留分隔符。sep 省略时只用空格分隔。
local function join(parts, sep)
  local line = pandoc.List()
  for _, part in ipairs(parts) do
    if #part > 0 then
      if #line > 0 then
        if sep then line:insert(pandoc.Str(sep)) end
        line:insert(pandoc.Space())
      end
      line:extend(part)
    end
  end
  return line
end

--- 姓名 / 机构的结构化字段，按这个顺序拼。Word 没有 \orgdiv/\orgaddress 这种结构，
--- 只能拼成一个字符串；顺序固定在这里，免得同一份笔记导 Word 和导投稿源文件时对不上。
--- 改动这两张表时，writers/latex-submission.lua 的同名字段和
--- catalog/manuscript-frontmatter.md 的字段顺序段落要一起改。
local NAME_FIELDS = { "fnm", "spfx", "sur", "sfx" }
local ORG_FIELDS = { "orgdiv", "orgname", "street", "city", "postcode", "state", "country" }

--- `name:` 优先（本系列 recipe 的原生写法），没有才按 keys 的顺序拼结构化字段。
--- 两套都支持是有意的 —— 同一份笔记要能同时导 Word 和 Nature-LaTeX 投稿包，
--- 而 SN 的宏需要 \fnm{}/\sur{} 拆开的姓名。详见 catalog/manuscript-frontmatter.md。
local function name_or_fields(tbl, keys, sep)
  if tbl.name then return as_inlines(tbl.name) end

  local parts = pandoc.List()
  for _, key in ipairs(keys) do parts:insert(as_inlines(tbl[key])) end
  return join(parts, sep)
end

--- 一位作者 → Inlines。map 形式排「姓名 + 机构上标 + 通讯星号」，纯名字就只排名字。
local function author_inlines(a)
  if not is_map(a) then return as_inlines(a) end

  local line = name_or_fields(a, NAME_FIELDS)
  if #line == 0 then return line end          -- 没名字就整条跳过，别只留分隔符

  -- `affiliation:` 是本 recipe 的原生键，`affil:` 是 SN 模板的叫法，两个都认
  local aff = affiliation_label(a.affiliation ~= nil and a.affiliation or a.affil)
  if aff then line:insert(pandoc.Superscript(pandoc.Str(aff))) end
  if a.corresponding then line:insert(pandoc.Superscript(pandoc.Str("*"))) end
  return line
end

--- 一个机构 → Inlines。map 形式排「编号上标 + 名称」，纯字符串就直接排。
--- `position` 是这条机构在列表里的序号：schema 说 `index:` 不写就回落到它。
--- 少了这个回落，`affiliations: [Inst A, Inst B]` 配 `affiliation: [1,2]` 会在
--- Word 里排出没有编号、对不上作者上标的机构行。
local function affiliation_inlines(aff, position)
  local index = position
  if is_map(aff) and aff.index ~= nil then index = pandoc.utils.stringify(aff.index) end

  if not is_map(aff) then
    local line = pandoc.List()
    if index then
      line:insert(pandoc.Superscript(pandoc.Str(tostring(index))))
      line:insert(pandoc.Space())
    end
    line:extend(as_inlines(aff))
    return #line > 0 and line or pandoc.List({})
  end

  local line = pandoc.List()
  if index then
    line:insert(pandoc.Superscript(pandoc.Str(tostring(index))))
    line:insert(pandoc.Space())
  end
  line:extend(name_or_fields(aff, ORG_FIELDS, ","))
  if #line == 1 then return pandoc.List({}) end  -- 只有编号、没有名称 = 空条目
  return line
end

--- 把若干段 Inlines 用 "、" 连起来，空的那些不留分隔符
function Pandoc(doc)
  local meta = doc.meta
  local head = pandoc.List()

  if meta.title then
    head:insert(styled_para(STYLE.title, as_inlines(meta.title)))
  end

  -- `authors:` 是本 recipe 的写法；只写了 pandoc 标准的 `author:` 也照排，
  -- 否则作者行会凭空消失（旧版就是这样）。
  local authors = as_items(meta.authors ~= nil and meta.authors or meta.author)

  local author_parts = pandoc.List()
  for _, a in ipairs(authors) do
    author_parts:insert(author_inlines(a))
  end
  local author_line = join(author_parts, ",")
  if #author_line > 0 then
    head:insert(styled_para(STYLE.author, author_line))
  end

  for i, aff in ipairs(as_items(meta.affiliations)) do
    local line = affiliation_inlines(aff, i)
    if #line > 0 then
      head:insert(styled_para(STYLE.affiliation, line))
    end
  end

  -- 多个通讯作者共用同一个星号，地址并成一行；每人一行、行行带星号是错的。
  local addresses = {}
  for _, a in ipairs(authors) do
    if is_map(a) then
      local address = corresponding_address(a)
      if address then addresses[#addresses + 1] = address end
    end
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

  if meta.abstract then
    head:insert(styled_para(STYLE.abstract_title, { pandoc.Str("Abstract") }))
    head:insert(styled(STYLE.abstract, as_blocks(meta.abstract)))
  end

  -- `keywords: [a, b]` 逐项排；`keywords: 水资源 治理` 是一个 Inlines，整体排一行 ——
  -- 按项遍历会把它拆成 Str/Space 并塞进分号（"水资源;  ; 治理"）。
  if meta.keywords then
    local items = pandoc.List()
    for _, kw in ipairs(as_items(meta.keywords)) do
      items:insert(as_inlines(kw))
    end
    local kw_line = join(items, ";")
    if #kw_line > 0 then
      local line = pandoc.List({ pandoc.Strong({ pandoc.Str("Keywords:") }), pandoc.Space() })
      line:extend(kw_line)
      head:insert(styled_para(STYLE.keywords, line))
    end
  end

  -- 抬头已经手工排好，清掉这些键，否则 docx writer 会在最上面再自动生成一份
  -- 标题/作者/日期/摘要。（副作用：docProps 的 dc:title / dc:creator 会是空的。）
  meta.title = nil
  meta.author = nil
  meta.authors = nil
  meta.date = nil
  meta.abstract = nil

  head:extend(doc.blocks)
  return pandoc.Pandoc(head, meta)
end
