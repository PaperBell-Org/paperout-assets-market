--[[
  latex-submission.lua —— Springer Nature 投稿源文件包（custom Writer，不是 filter）

  !! 这个文件不是过滤器。不要把它写进 defaults 的 `filters:` 列表里 —— 那样 pandoc 会
  !! 把它当 filter 加载，找不到 Pandoc/Meta/Block 处理函数，于是静默地什么都不做。
  !! 它的位置是 defaults 的 `to:` 键：
  !!
  !!     to: ${USERDATA}/writers/latex-submission.lua
  !!
  !! 本文件住在 writers/ —— 和 filters/ 平级的第五个资产目录，build-index.mjs 给它
  !! 打的 type 是 "writer"。scan-security 和 luacheck 同样覆盖这个目录：writer 和
  !! filter 一样在用户机器上执行。

  产出：一个 zip（`output-file: submission.zip`），布局

      main.tex          正文，\documentclass{sn-jnl}，单文件，无 \input
      references.bib    只含本文引用到的条目
      sn-jnl.cls        Springer Nature 文档类（LPPL）
      <style>.bst       当前参考文献样式对应的那一个
      figures/<名字>    所有被引用的图，文件名已净化

  之所以 pandoc 一次调用就能吐 zip：pandoc 3.x 的自定义 writer 支持二进制输出
  （`ByteStringWriter`），`pandoc.zip` 负责打包。filters/xlsx_table.lua 已经在用
  pandoc.zip，不是新依赖。

  五个步骤，顺序不能换：

    1. 定 documentclass 选项和要打包的 .bst
    2. 抽 references.bib   —— 必须在改写 doc.meta.bibliography 之前，
                              pandoc.utils.references() 正是靠那个键找 bib 文件的
    3. 收图并改写图片路径  —— 必须在渲染 LaTeX 之前
    4. 造抬头 + 改 bibliography 指向，再渲染 main.tex
    5. 组 zip

  —— 关于 sn-jnl.cls 的三件事（都会影响模板，别想当然）：

  * cls 自己 `\usepackage{natbib}`，也自己发 `\bibliographystyle{}`（按 documentclass
    选项分支）。所以这条链是 BibTeX 不是 biblatex，而且 templates/nature-latex.latex
    里绝不能再出现这两条，否则 option clash。
  * 行号（lineno）和双倍行距（referee）是 documentclass 选项，不是 \usepackage{lineno}
    + setspace。
  * pdflatex 是 cls 的官方选项，全程不要碰 fontspec / xeCJK。
--]]

local ASSET_SUBDIR = 'templates/nature'
local DEFAULT_REFSTYLE = 'sn-nature'

-- documentclass 选项 → cls 实际发出的 \bibliographystyle{} 名字。
-- 不是简单拼接，两处上游不一致：
--   sn-apa → \bibliographystyle{sn-apacite}   （样式名和选项名不同）
--   sn-aps → \bibliographystyle{sn-APS}       （大小写和磁盘上的 sn-aps.bst 不一致，
--                                               在区分大小写的文件系统上 BibTeX 找不到）
-- 因此打包时按 cls 要的名字写进 zip，而不是按仓库里的文件名。
local REFSTYLE_BST = {
  ['sn-nature']        = 'sn-nature',
  ['sn-basic']         = 'sn-basic',
  ['sn-mathphys-num']  = 'sn-mathphys-num',
  ['sn-mathphys-ay']   = 'sn-mathphys-ay',
  ['sn-aps']           = 'sn-APS',
  ['sn-vancouver-num'] = 'sn-vancouver-num',
  ['sn-vancouver-ay']  = 'sn-vancouver-ay',
  ['sn-apa']           = 'sn-apacite',
  ['sn-chicago']       = 'sn-chicago',
}

local ADDRESS_FIELDS = { 'street', 'city', 'postcode', 'state', 'country' }

-- ---------------------------------------------------------------- 小工具

local function warn(msg)
  io.stderr:write('[latex-submission] ' .. msg .. '\n')
end

-- 与 filters/manuscript-docx.lua 的同名函数保持一致（本仓库的 filter 之间没有模块
-- 机制，scan-security 也禁止 require 本地文件，所以只能各留一份副本）。pcall 是必要的：
-- pandoc 3.x 把 MetaBlocks 交给 Lua 时是一个没有 .t 字段的 Blocks 列表，直接判型会抛错。
local function meta_type(val)
  local ok, t = pcall(pandoc.utils.type, val)
  return ok and t or nil
end

local function is_map(val)
  return meta_type(val) == 'table'
end

local function as_items(val)
  if val == nil then return {} end
  if meta_type(val) == 'List' then return val end
  return { val }
end

local function as_inlines(val)
  if val == nil then return pandoc.List({}) end
  local t = meta_type(val)
  if t == 'Inlines' then return pandoc.List(val) end
  if t == 'Blocks' then return pandoc.List(pandoc.utils.blocks_to_inlines(val)) end
  return pandoc.List({ pandoc.Str(pandoc.utils.stringify(val)) })
end

-- 元数据值 → 转义好的 LaTeX 片段。用 pandoc 自己的 latex writer 转，而不是直接
-- stringify —— 否则作者单位里一个 & 或 % 就能让整篇编译不过。
local function tex_of(val)
  if val == nil then return nil end
  local inlines = as_inlines(val)
  if #inlines == 0 then return nil end
  local out = pandoc.write(pandoc.Pandoc({ pandoc.Plain(inlines) }), 'latex')
  out = out:gsub('%s+$', '')
  if out == '' then return nil end
  return out
end

-- 邮箱不能走 tex_of()：from: 里开了 autolink_bare_uris，latex writer 会把
-- song@example.edu 渲染成 \href{mailto:...}{\nolinkurl{...}}，塞进 SN 的
-- \email{} 里就是一坨嵌套链接。这里只转义 LaTeX 特殊字符（邮箱里真会出现的是 _ 和 %）。
local function tex_plain(val)
  if val == nil then return nil end
  local s = pandoc.utils.stringify(val)
  if s == '' then return nil end
  s = s:gsub('([#%%&_{}])', '\\%1')
  return s
end

local function read_file(path)
  local fh = io.open(path, 'rb')
  if not fh then return nil end
  local data = fh:read('a')
  fh:close()
  return data
end

-- ${USERDATA}，即 defaults 里 `data-dir: ${.}/..` 指向的那个 pandoc 资产目录。
local function asset_dir()
  local dir = PANDOC_STATE and PANDOC_STATE.user_data_dir
  if dir and dir ~= '' then return dir end
  -- 兜底：本 writer 就住在 <USERDATA>/filters/ 下
  if PANDOC_SCRIPT_FILE then
    return pandoc.path.directory(pandoc.path.directory(PANDOC_SCRIPT_FILE))
  end
  return '.'
end

-- ------------------------------------------- 1. documentclass 选项与 .bst

-- 从一串 documentclass 选项里找出参考文献样式 token。
local function refstyle_in(options)
  for _, opt in ipairs(options) do
    if REFSTYLE_BST[opt] then return opt end
  end
  return nil
end

local function class_options(meta)
  local explicit = meta['sn-options']

  if explicit == nil then
    -- 默认：送审形态 —— 双倍行距 + 行号 + pdflatex + Nature 参考文献样式。
    -- lineno 沿用 lineno_default.lua 的约定：笔记里写 lineno: false 就关掉。
    local lineno = true
    if meta.lineno ~= nil then
      local str = pandoc.utils.stringify(meta.lineno):lower()
      lineno = not (str == 'false' or str == 'no' or str == '')
    end

    local refstyle = DEFAULT_REFSTYLE
    if meta['sn-refstyle'] ~= nil then
      refstyle = pandoc.utils.stringify(meta['sn-refstyle'])
    end
    if not REFSTYLE_BST[refstyle] then
      warn(('unknown sn-refstyle %q — falling back to %s'):format(refstyle, DEFAULT_REFSTYLE))
      refstyle = DEFAULT_REFSTYLE
    end

    local options = { 'referee' }
    if lineno then options[#options + 1] = 'lineno' end
    options[#options + 1] = 'pdflatex'
    options[#options + 1] = refstyle
    return options, REFSTYLE_BST[refstyle]
  end

  -- 作者整个接管了选项列表
  local options = {}
  for _, opt in ipairs(as_items(explicit)) do
    local str = pandoc.utils.stringify(opt)
    if str ~= '' then options[#options + 1] = str end
  end

  local style = refstyle_in(options)
  if not style then
    -- 自定义 sn-options 里没写样式：cls 不会发 \bibliographystyle，参考文献会整段消失。
    warn(('no sn-* reference style found in sn-options — appending %s'):format(DEFAULT_REFSTYLE))
    options[#options + 1] = DEFAULT_REFSTYLE
    style = DEFAULT_REFSTYLE
  end

  return options, REFSTYLE_BST[style]
end

-- ------------------------------------------------------ 2. references.bib

-- 记一个 key，保持首次出现的顺序、不重复。
local function push_id(seen, order, id)
  if not seen[id] then
    seen[id] = true
    order[#order + 1] = id
  end
end

local function collect_cite_ids(el, seen, order)
  el:walk {
    Cite = function(c)
      for _, citation in ipairs(c.citations) do push_id(seen, order, citation.id) end
    end,
  }
end

-- nocite 在 writer 里的形状不固定：可能是 Inlines、可能是一个元素就是 Cite 的
-- List、也可能已经被压成纯字符串。三种都要能挖出 Cite —— 挖不出的后果是
-- nocite 的条目虽然进了 references.bib，却没人 \\cite 它，BibTeX 把它丢掉，
-- 参考文献表里凭空少一条。
local function collect_meta_cites(val, seen, order)
  if val == nil then return end
  local t = meta_type(val)

  if t == 'List' or t == 'Inlines' or t == 'Blocks' then
    for _, item in ipairs(val) do collect_meta_cites(item, seen, order) end
    return
  end

  -- 单个 AST 元素。注意不能走 as_inlines() —— 它对 'Inline' 只会 stringify，
  -- Cite 会被压成字面量 "@key"，id 就没了。
  if t == 'Inline' then
    collect_cite_ids(pandoc.Pandoc({ pandoc.Plain(pandoc.Inlines({ val })) }), seen, order)
    return
  end
  if t == 'Block' then
    collect_cite_ids(pandoc.Pandoc({ val }), seen, order)
    return
  end

  -- 纯字符串（`nocite: "@a, @b"` 有时会落到这一档）：按 markdown 重新解析出 Cite
  local str = pandoc.utils.stringify(val)
  if str ~= '' then collect_cite_ids(pandoc.read(str, 'markdown'), seen, order) end
end

-- biblatex writer 的输出 → 经典 BibTeX 能读的 .bib。
--
-- 只改 date → year：BibTeX 不认 `date =`，而 biblatex writer 不写 `year =`。
-- 其余 biblatex 专有**字段**（urldate、eprinttype 等）BibTeX 直接忽略，无害。
-- 注意这不是「唯一的不兼容」—— biblatex 专有**条目类型**（@online、@thesis）
-- 经典 .bst 是不认的，遇到会整条丢掉。本手稿类用到的条目类型没有这个问题，
-- 真碰上了要在这里扩展。
local function biblatex_to_bibtex(bib)
  return (bib:gsub('(\n%s*)date(%s*=%s*{)(%d%d%d%d)[^}]*(})', '%1year%2%3%4'))
end

local function build_bibliography(doc)
  -- pandoc.utils.references() 读 doc.meta.bibliography 指向的文件（以及内联的
  -- references:），并且**只返回正文引用到的 + nocite 的条目** —— 未被引用的自动丢弃，
  -- 不需要自己按 key 过滤。这正是本 recipe 要的"只抽被引条目"。
  local refs = pandoc.utils.references(doc)

  -- nocite 单独收一份：它既要参与「拼错的 key」告警，又要原样发成 \nocite{}。
  local nseen, norder = {}, {}
  collect_meta_cites(doc.meta.nocite, nseen, norder)

  -- 拼错的 key 在 citeproc 链里会渲染成 [?]，但在 natbib 链里是悄无声息地从 .bib 里
  -- 消失、正文留一个 (?) —— 必须在导出当时就喊出来。
  local seen, order = {}, {}
  collect_cite_ids(pandoc.Pandoc(doc.blocks), seen, order)
  for _, id in ipairs(norder) do push_id(seen, order, id) end

  local resolved = {}
  for _, ref in ipairs(refs) do resolved[ref.id] = true end

  local missing = {}
  for _, id in ipairs(order) do
    if not resolved[id] then missing[#missing + 1] = id end
  end
  if #missing > 0 then
    warn('these citation keys resolved to nothing and are NOT in references.bib: @'
      .. table.concat(missing, ', @'))
  end

  -- \nocite{} 的 key：只进参考文献、正文不出现。pandoc 的 nocite-ids 模板变量是
  -- citeproc 填的，而本链不跑 citeproc —— 不自己填的话，nocite 的条目虽然进了
  -- references.bib，BibTeX 却因为没人 \cite 而把它丢掉。
  local nocite = {}
  for _, id in ipairs(norder) do
    if resolved[id] then nocite[#nocite + 1] = id end
  end

  if #refs == 0 then return nil, nocite end

  -- 走 biblatex writer 而不是 bibtex writer：bibtex writer 会把 doi 丢掉
  -- （只留 author/title/journal/year），而 sn-nature.bst 是用 doi 的。
  return biblatex_to_bibtex(
    pandoc.write(pandoc.Pandoc({}, pandoc.Meta { references = refs }), 'biblatex')), nocite
end

-- ------------------------------------------------------------- 3. 图片

-- Obsidian 的附件经常叫「截图 2024-01-01 下午3.22.png」。
-- \includegraphics{figures/截图 …} 在 pdflatex 下直接炸，所以统一净化成
-- 纯 ASCII、无空格的名字。
--
-- 先做 percent-decode：markdown 里的空格在 AST 里已经是 %20，不解码的话
-- 「流域 示意图.png」会被净化成毫无意义的「20.png」（CJK 字节全变下划线、
-- 只剩 %20 里的那个 20 活下来）。
local function percent_decode(s)
  return (s:gsub('%%(%x%x)', function(h) return string.char(tonumber(h, 16)) end))
end

local function sanitize_base(s)
  return (s:gsub('[^A-Za-z0-9._%-]', '_'):gsub('_+', '_'):gsub('^_', ''):gsub('_$', ''))
end

-- fallback 用图自己的 crossref id：整个文件名都是 CJK 时净化后会一个字符不剩，
-- 与其都叫 figure.png，不如叫 basin.png。
local function sanitize_name(name, fallback)
  local base, ext = pandoc.path.split_extension(percent_decode(name))
  base = sanitize_base(base)
  if base == '' then
    base = sanitize_base((fallback or ''):gsub('^%a+:', ''))
  end
  if base == '' then base = 'figure' end
  ext = (ext or ''):gsub('[^A-Za-z0-9.]', '')
  if ext == '' then ext = '.png' end
  return base .. ext
end

-- 图片 src → 包着它的 Figure 的 crossref id。
-- 单独走一趟而不是在主遍历里顺手记：Lua filter 的遍历是自底向上的，Image 会先于
-- 包着它的 Figure 被访问，边走边记根本来不及。也不去改 Image 的 identifier ——
-- 那会让 latex writer 多吐一个 \label。
local function figure_ids(doc)
  local ids = {}
  doc:walk {
    Figure = function(fig)
      if fig.identifier == '' then return nil end
      fig:walk {
        Image = function(im)
          if ids[im.src] == nil then ids[im.src] = fig.identifier end
        end,
      }
    end,
  }
  return ids
end

local function collect_figures(doc)
  local files = {}      -- { path = <zip 内路径>, data = <字节> }
  local mapped = {}     -- 原 src → zip 内路径（同一张图引用多次只收一份）
  local taken = {}      -- zip 内路径 → true
  local ids = figure_ids(doc)

  doc = doc:walk {
    Image = function(im)
      local known = mapped[im.src]
      if known then
        im.src = known
        return im
      end

      local ok, _, contents = pcall(pandoc.mediabag.fetch, im.src)
      if not ok or not contents then
        -- 不静默降级成 alt text —— 让作者看见哪张图没打进包里
        warn(('could not read image %q — left as-is, it will NOT be in the zip'):format(im.src))
        return nil
      end

      local fallback = im.identifier ~= '' and im.identifier or ids[im.src]
      local name = sanitize_name(pandoc.path.filename(im.src), fallback)
      local target = 'figures/' .. name
      if taken[target] then
        -- 不同目录下的同名文件：加计数后缀，别互相覆盖
        local base, ext = pandoc.path.split_extension(name)
        local n = 1
        repeat
          n = n + 1
          target = ('figures/%s_%d%s'):format(base, n, ext)
        until not taken[target]
      end

      taken[target] = true
      mapped[im.src] = target
      files[#files + 1] = { path = target, data = contents }
      im.src = target
      return im
    end,
  }

  return doc, files
end

-- --------------------------------------------------------- 4. 抬头（title block）

-- CJK 码位。注意必须按码位判断，不能用「非 ASCII」—— Jürgen、Müller 这类
-- 名字也是非 ASCII，但它们该走正常的拉丁拆分。
local function is_cjk(cp)
  return (cp >= 0x3400 and cp <= 0x4DBF)   -- 扩展 A
      or (cp >= 0x4E00 and cp <= 0x9FFF)   -- 统一表意
      or (cp >= 0xF900 and cp <= 0xFAFF)   -- 兼容表意
      or (cp >= 0x3040 and cp <= 0x30FF)   -- 日文假名
      or (cp >= 0xAC00 and cp <= 0xD7AF)   -- 韩文音节
end

-- 把姓名切成「拉丁部分」和「CJK 部分」，按词归类。
local function split_cjk(full)
  local latin, cjk = {}, {}
  for word in full:gmatch('%S+') do
    local has = false
    local ok = pcall(function()
      for _, cp in utf8.codes(word) do
        if is_cjk(cp) then has = true return end
      end
    end)
    if ok and has then cjk[#cjk + 1] = word else latin[#latin + 1] = word end
  end
  return table.concat(latin, ' '), table.concat(cjk, ' ')
end

-- 「Shuang Song」→ \fnm{Shuang} \sur{Song}：按最后一个空格拆。
--
-- 中文作者常写双语署名「Shuang Song 宋爽」。直接按最后一个空格拆会得到
-- \fnm{Shuang Song} \sur{宋爽} —— 排出来看着没错，但 \fnm/\sur 是 SN 拿去做
-- 元数据（given name / surname）的，这么拆语义是坏的。所以先把 CJK 段摘出来，
-- 拉丁部分正常拆，CJK 段跟在姓后面：
--   Shuang Song 宋爽 → \fnm{Shuang} \sur{Song 宋爽}
-- 纯 CJK 姓名（宋爽）不拆，整串当姓。
local function split_name(full)
  if not full then return nil, nil end

  local latin, cjk = split_cjk(full)
  if latin == '' then
    return nil, (cjk ~= '' and cjk or full)
  end

  local first, last = latin:match('^(.*)%s+(%S+)$')
  if not first then last = latin end
  if cjk ~= '' then last = last .. ' ' .. cjk end
  return first, last
end

local function author_macro(a)
  local fnm, sur, spfx, sfx, email, equal, corresponding
  local affils = {}

  if is_map(a) then
    -- `name:` 优先，结构化字段是回落 —— 与 filters/manuscript-docx.lua 和
    -- catalog/manuscript-frontmatter.md 保持同一条规则。两边不一致的话，
    -- 同时写了两种拼法的笔记会在 Word 和投稿包里得到不同的作者名。
    -- 走 name 这条路时整只姓名都来自 name，spfx/sfx 一并忽略，免得拼出
    -- 半个来自这边半个来自那边的名字。
    fnm, sur = split_name(tex_of(a.name))
    if not (fnm or sur) then
      fnm, sur = tex_of(a.fnm), tex_of(a.sur)
      spfx, sfx = tex_of(a.spfx), tex_of(a.sfx)
    end
    equal = tex_of(a.equalcont)
    corresponding = a.corresponding and a.corresponding ~= false

    -- `affiliation:` 是 manuscript-obsidian 既有的键，`affil:` 是 SN 模板的叫法，两个都认
    for _, n in ipairs(as_items(a.affiliation ~= nil and a.affiliation or a.affil)) do
      local s = pandoc.utils.stringify(n)
      if s ~= '' then affils[#affils + 1] = s end
    end

    email = tex_plain(a.email)
    if not email and corresponding then
      local s = pandoc.utils.stringify(a.corresponding)
      if s:find('@', 1, true) then email = tex_plain(s) end
    end
  else
    fnm, sur = split_name(tex_of(a))
  end

  if not (fnm or sur) then return nil, nil end

  local name = {}
  if fnm then name[#name + 1] = '\\fnm{' .. fnm .. '}' end
  if spfx then name[#name + 1] = '\\spfx{' .. spfx .. '}' end
  if sur then name[#name + 1] = '\\sur{' .. sur .. '}' end
  if sfx then name[#name + 1] = '\\sfx{' .. sfx .. '}' end

  local line = '\\author' .. (corresponding and '*' or '')
  if #affils > 0 then line = line .. '[' .. table.concat(affils, ',') .. ']' end
  line = line .. '{' .. table.concat(name, ' ') .. '}'
  if email then line = line .. '\\email{' .. email .. '}' end
  if equal then line = line .. '\n\\equalcont{' .. equal .. '}' end

  -- 第二个返回值 = 要跟着带 * 的机构编号。让「这位是不是通讯作者」只在这里判一次，
  -- 调用方不必再照着重算一遍同样的规则。
  return line, corresponding and affils or {}
end

local function affil_macro(aff, index, starred)
  local parts = {}

  if is_map(aff) then
    local div = tex_of(aff.orgdiv)
    if div then parts[#parts + 1] = '\\orgdiv{' .. div .. '}' end

    -- `name:` 是 manuscript-obsidian 既有的键 —— 整串塞进 \orgname 是有意的降级
    -- 同样是 `name:` 优先
    local org = tex_of(aff.name) or tex_of(aff.orgname)
    if org then parts[#parts + 1] = '\\orgname{' .. org .. '}' end

    local address = {}
    for _, field in ipairs(ADDRESS_FIELDS) do
      local v = tex_of(aff[field])
      if v then address[#address + 1] = '\\' .. field .. '{' .. v .. '}' end
    end
    if #address > 0 then
      parts[#parts + 1] = '\\orgaddress{' .. table.concat(address, ', ') .. '}'
    end
  else
    local s = tex_of(aff)
    if s then parts[#parts + 1] = '\\orgname{' .. s .. '}' end
  end

  if #parts == 0 then return nil end
  return ('\\affil%s[%s]{%s}'):format(starred and '*' or '', index, table.concat(parts, ', '))
end

local function title_block(meta)
  local lines = {}

  -- `authors:` 是本系列 recipe 的写法；只写了 pandoc 标准的 `author:` 也照排
  local authors = as_items(meta.authors ~= nil and meta.authors or meta.author)
  local starred = {}   -- 通讯作者所在的机构编号 → 该机构要带 *

  for _, a in ipairs(authors) do
    local line, starred_affils = author_macro(a)
    if line then
      lines[#lines + 1] = line
      for _, n in ipairs(starred_affils) do starred[n] = true end
    end
  end

  local affiliations = as_items(meta.affiliations)
  if #affiliations > 0 and #lines > 0 then lines[#lines + 1] = '' end

  for i, aff in ipairs(affiliations) do
    local index = tostring(i)
    if is_map(aff) and aff.index ~= nil then
      index = pandoc.utils.stringify(aff.index)
    end
    local line = affil_macro(aff, index, starred[index])
    if line then lines[#lines + 1] = line end
  end

  if #lines == 0 then return nil end
  return table.concat(lines, '\n')
end

-- ------------------------------------------------------------------ 5. zip

-- 把渲染好的各部分装进 zip。sn-jnl.cls 和 .bst 一并打包，作者拿到 zip 就能编译，
-- 期刊那边也不必自己去凑文档类。
local function build_zip(tex, bib, bst_name, figures)
  local assets = pandoc.path.join { asset_dir(), ASSET_SUBDIR }
  local archive = pandoc.zip.Archive()

  local function add(path, contents)
    -- modtime 固定为 0（1980-01-01），否则同样的输入每次导出都是不同的 zip，
    -- golden fingerprint 就永远对不上
    archive.entries[#archive.entries + 1] = pandoc.zip.Entry(path, contents, 0)
  end

  add('main.tex', tex)
  if bib then add('references.bib', bib) end

  local cls = read_file(pandoc.path.join { assets, 'sn-jnl.cls' })
  if cls then
    add('sn-jnl.cls', cls)
  else
    warn('sn-jnl.cls not found in ' .. assets .. ' — the zip will not compile on its own')
  end

  -- 仓库里的文件名一律小写，cls 要的名字不一定（sn-APS ↔ sn-aps.bst）
  local bst = read_file(pandoc.path.join { assets, 'bst', bst_name:lower() .. '.bst' })
  if bst then
    add(bst_name .. '.bst', bst)
  else
    warn(('%s.bst not found in %s/bst — bibtex will fail'):format(bst_name, assets))
  end

  -- 条目顺序固定，同样是为了 zip 可复现
  table.sort(figures, function(x, y) return x.path < y.path end)
  for _, f in ipairs(figures) do add(f.path, f.data) end

  return archive:bytestring()
end

-- ------------------------------------------------------------------ writer

function ByteStringWriter(doc, opts)
  -- 1 ──────────────────────────────────────────────── documentclass 与 .bst
  local options, bst_name = class_options(doc.meta)

  -- 2 ──────────────────────── references.bib（必须先于改写 doc.meta.bibliography）
  local bib, nocite = build_bibliography(doc)

  -- 3 ──────────────────────────────────── 图片（必须先于渲染 LaTeX）
  local figures
  doc, figures = collect_figures(doc)

  -- 4 ──────────────────────────────────────────────────────── main.tex
  doc.meta['sn-options'] = pandoc.MetaString(table.concat(options, ','))

  local block = title_block(doc.meta)
  if block then
    doc.meta['sn-titleblock'] = pandoc.MetaBlocks { pandoc.RawBlock('latex', block) }
    -- 抬头已经排好，清掉原始键，免得模板/writer 再排一遍。
    -- 只在真排出了抬头时才清 —— 否则没有 authors: 的笔记会连作者都不剩。
    doc.meta.authors = nil
    doc.meta.author = nil
    doc.meta.affiliations = nil
  else
    warn('no authors found (authors: / author:) — the manuscript will have no author block')
  end

  -- BibTeX 的 \bibliography{} 收的是**不带扩展名**的基名（和 biblatex 的
  -- \addbibresource{x.bib} 不同）。不改这一行，\bibliography{} 里会是用户机器上的
  -- 绝对路径，投出去必炸。
  if bib then
    doc.meta.bibliography = pandoc.MetaList { pandoc.MetaString('references') }
  else
    doc.meta.bibliography = nil
  end

  if #nocite > 0 then
    doc.meta['nocite-ids'] = pandoc.MetaList(pandoc.List(nocite):map(pandoc.MetaString))
  end
  doc.meta.nocite = nil

  local tex = pandoc.write(doc, 'latex', opts)

  -- 5 ─────────────────────────────────────────────────────────────── zip
  return build_zip(tex, bib, bst_name, figures)
end

-- standalone: true 且没给 --template 时，pandoc 会直接报 "No template defined"。
-- 兜底用 latex 的默认模板，让报错变成"版式不对"而不是"整个跑不起来"。
function Template()
  return pandoc.template.default('latex')
end
