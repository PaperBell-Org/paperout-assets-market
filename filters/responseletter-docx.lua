--[[
  responseletter-docx.lua — pandoc Lua filter (Word / .docx sibling of responseletter.lua)

  Same Obsidian authoring contract as responseletter.lua, but instead of emitting
  responseletter.sty LaTeX it rebuilds the document as plain Pandoc blocks suitable
  for DOCX, and STRIPS every Chinese translation / draft-only aid on the way out:

    Reviewer comment callout  →  "Reviewer #N" heading (deduped) + the comment in
                                  the "Reviewer Comment" style, led by an "RC:" label.
                                  The "---" rule and the "**中文翻译：**" paragraph
                                  are dropped.
    Author response           →  "Author Response" style led by an "AR:" label;
                                  continuation paragraphs in "Author Response Cont".
                                  Trailing %% … %% / <!-- … --> aids are dropped.
    Revised manuscript        →  a "Manuscript Quote Title" bar carrying the locator
                                  ("Manuscript · Page 5, Line 158–160") plus the text
                                  in "Manuscript Quote".

  The three roles a response letter exists to keep apart used to render as one
  undifferentiated BlockQuote, so a reader could not tell the reviewer's words from
  the authors' reply from the revised manuscript. Every block now names a style in
  templates/response-letter-reference.docx, whose look is derived from the PDF route
  (templates/responseletter.sty): italic comment, upright labelled response, shaded
  and framed manuscript box — separated by type style rather than colour, so the
  letter survives greyscale printing. Layout is the master's job; this filter names
  styles and never sets a font or a colour.

  A letterhead is emitted from the metadata (kicker / paper title / authors / journal
  / legend), mirroring \makeletterhead, and title/abstract/date are then cleared so
  pandoc's stock template stops printing the manuscript's own abstract into the letter.

  Draft-only carriers (中文翻译, \note, badges, #TODO, *Evidence*, image embeds) are
  all removed — the .docx is the clean, English-only, submission-style letter.

  The parsing helpers below are kept identical to responseletter.lua so both filters
  recognise exactly the same source.
]]

local utils = pandoc.utils

-- 样式名：与 templates/response-letter-reference.docx 的 <w:name> 一一对应。
-- custom-style 匹配的是 w:name，不是 styleId。
local STYLE = {
  kicker      = 'Letter Kicker',
  title       = 'Title',
  author      = 'Author',
  journal     = 'Journal',
  legend      = 'Legend',
  rc          = 'Reviewer Comment',
  rc_cont     = 'Reviewer Comment Cont',
  ar          = 'Author Response',
  ar_cont     = 'Author Response Cont',
  ms_title    = 'Manuscript Quote Title',
  ms          = 'Manuscript Quote',
  rc_label    = 'RC Label',
  ar_label    = 'AR Label',
  ms_locator  = 'Manuscript Locator',
}

-- metadata 值 → Inlines（标题这类一定是行内的位置），与 manuscript-docx.lua 同款
local function meta_inlines(val)
  if val == nil then return pandoc.List({}) end
  local ok, t = pcall(utils.type, val)
  t = ok and t or nil
  if t == 'Inlines' then return pandoc.List(val) end
  if t == 'Blocks' then return pandoc.List(utils.blocks_to_inlines(val)) end
  return pandoc.List({ pandoc.Str(utils.stringify(val)) })
end

local function styled(name, blocks)
  return pandoc.Div(blocks, pandoc.Attr('', {}, { { 'custom-style', name } }))
end

local function styled_para(name, inlines)
  return styled(name, { pandoc.Para(inlines) })
end

local function span(name, inlines)
  return pandoc.Span(inlines, pandoc.Attr('', {}, { { 'custom-style', name } }))
end

-- 一段带悬挂标签的正文：标签用字符样式，段落用段落样式
local function labelled(style, label_style, label, inlines)
  local out = pandoc.List({ span(label_style, { pandoc.Str(label) }), pandoc.Space() })
  for _, el in ipairs(inlines) do out:insert(el) end
  return styled_para(style, out)
end

-- ---------------------------------------------------------------------------
-- helpers (shared verbatim with responseletter.lua)
-- ---------------------------------------------------------------------------

local function trim(s)
  return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

-- strip a trailing colon (half- or full-width).  "：" is a 3-byte UTF-8 char.
local function strip_colon(s)
  return trim(trim(s):gsub('：$', ''):gsub(':$', ''))
end

local function drop_leading_space(inlines)
  while #inlines > 0 and (inlines[1].t == 'Space' or inlines[1].t == 'SoftBreak') do
    table.remove(inlines, 1)
  end
  return inlines
end

-- "difficulty=hard status=todo" -> { difficulty="hard", status="todo" }
local function parse_kv_words(s)
  local t = {}
  for k, v in s:gmatch('(%w+)%s*=%s*([%w%-]+)') do t[k] = v end
  return t
end

-- "page=Supporting Information, sline=158" -> table (comma-separated, spaces ok)
local function parse_kv_commas(s)
  local t = {}
  for pair in s:gmatch('[^,]+') do
    local k, v = pair:match('^%s*(%w+)%s*=%s*(.-)%s*$')
    if k then t[k] = v end
  end
  return t
end

-- ---------------------------------------------------------------------------
-- callout detection:  > [!type]<-|+>? Title \n body...
-- ---------------------------------------------------------------------------

local CALLOUT_RC = {            -- reviewer comment
  quote = true, comment = true, cite = true, info = true,
  rc = true, reviewer = true, question = true, abstract = true,
}
local CALLOUT_AR = {            -- author response
  response = true, ar = true, reply = true, success = true, answer = true,
}
local CALLOUT_MS = { manuscript = true, ms = true, revision = true }

local function callout_info(blk)
  if blk.t ~= 'BlockQuote' then return nil end
  local first = blk.content[1]
  if not first or (first.t ~= 'Para' and first.t ~= 'Plain') then return nil end
  local fi = first.content[1]
  if not fi or fi.t ~= 'Str' then return nil end
  local kind = fi.text:match('^%[!(%a+)%][%-%+]?$')
  if not kind then return nil end
  return kind:lower(), first, blk.content
end

local function split_first(inlines)
  local title, body = {}, {}
  local seen_break = false
  for i = 2, #inlines do                       -- skip [1] = marker Str
    local el = inlines[i]
    if not seen_break and (el.t == 'SoftBreak' or el.t == 'LineBreak') then
      seen_break = true
    elseif not seen_break then
      table.insert(title, el)
    else
      table.insert(body, el)
    end
  end
  return drop_leading_space(title), drop_leading_space(body)
end

-- "Reviewer #1 (Remarks on code availability)" -> "Reviewer #1", "Remarks on…"
local function parse_title(t)
  t = trim(t)
  local sub = t:match('%((.-)%)')
  local rev = t:match('^(.-)%s*%(') or t
  rev = trim(rev)
  if sub then sub = trim(sub) end
  return rev, sub
end

-- strip a leading boilerplate parenthetical like "(Remarks to the Author)"
local function strip_leading_remarks(inlines)
  if #inlines == 0 then return inlines end
  if not utils.stringify(inlines):match('^%(%s*Remarks') then return inlines end
  local idx
  for k = 1, #inlines do
    if inlines[k].t == 'Str' and inlines[k].text:find('%)') then idx = k break end
  end
  if not idx then return inlines end
  local rest = {}
  local after = inlines[idx].text:gsub('^.-%)', '')
  if after ~= '' then rest[#rest + 1] = pandoc.Str(after) end
  for k = idx + 1, #inlines do rest[#rest + 1] = inlines[k] end
  return drop_leading_space(rest)
end

-- ---------------------------------------------------------------------------
-- translation / annotation carriers (used here only to DETECT & DROP)
-- ---------------------------------------------------------------------------

local ZH_LABELS = {
  ['中文翻译'] = true, ['中文'] = true, ['译文'] = true, ['翻译'] = true,
  ['translation'] = true,
}
-- "**中文翻译：** ..." paragraph inside a callout -> the remaining inlines, or nil
local function strip_zh_label(inlines)
  if #inlines == 0 then return nil end
  local first = inlines[1]
  if first.t ~= 'Strong' and first.t ~= 'Str' then return nil end
  local head = strip_colon(utils.stringify(first))
  if not ZH_LABELS[head] then return nil end
  local rest = {}
  for k = 2, #inlines do rest[#rest + 1] = inlines[k] end
  return drop_leading_space(rest)
end

-- Obsidian inline comment  %% ... %%  (a whole paragraph) -> inner inlines, or nil
local function obsidian_zh(blk)
  if blk.t ~= 'Para' and blk.t ~= 'Plain' then return nil end
  local ins = blk.content
  if #ins == 1 and ins[1].t == 'Str' then
    local inner = ins[1].text:match('^%%%%(.-)%%%%$')
    if inner and inner ~= '' then return { pandoc.Str(inner) } end
    return nil
  end
  if #ins < 2 then return nil end
  if not (ins[1].t == 'Str' and ins[1].text == '%%') then return nil end
  if not (ins[#ins].t == 'Str' and ins[#ins].text == '%%') then return nil end
  return { pandoc.Str('') }                         -- presence is enough; we drop it
end

-- HTML comment  <!-- ... -->  -> true (we drop all of them in docx mode), or nil
local function html_comment(blk)
  if blk.t ~= 'RawBlock' or blk.format ~= 'html' then return nil end
  local inner = blk.text:match('^%s*<!%-%-(.-)%-%->%s*$')
  if not inner then return nil end
  return true
end

-- ---------------------------------------------------------------------------
-- author-response label:  **Response:** ...   (also 回复 / Reply …)
-- ---------------------------------------------------------------------------
local AR_LABELS = {
  ['Response'] = true, ['response'] = true, ['RESPONSE'] = true,
  ['Reply'] = true, ['reply'] = true,
  ['回复'] = true, ['作者回复'] = true, ['答复'] = true, ['回應'] = true,
}
local function ar_label(inlines)
  if #inlines == 0 or inlines[1].t ~= 'Strong' then return nil end
  local head = strip_colon(utils.stringify(inlines[1]))
  if not AR_LABELS[head] then return nil end
  local rest = {}
  for k = 2, #inlines do rest[#rest + 1] = inlines[k] end
  return drop_leading_space(rest)
end

-- ---------------------------------------------------------------------------
-- RC inline option marker:  ...comment {difficulty=hard status=todo} -> strip it
-- ---------------------------------------------------------------------------
local function strip_trailing_brace(inlines)
  local acc, cut = '', #inlines + 1
  for j = #inlines, 1, -1 do
    acc = utils.stringify({ inlines[j] }) .. acc
    if acc:match('^%s*%b{}%s*$') then cut = j break end
    if #acc > 120 then break end
  end
  local res = {}
  for j = 1, cut - 1 do res[#res + 1] = inlines[j] end
  while #res > 0 and res[#res].t == 'Space' do table.remove(res) end
  return res
end

-- returns cleaned inlines with any trailing {difficulty=… status=…} removed
local function strip_rc_opts(inlines)
  local s = utils.stringify(inlines)
  local brace = s:match('%s*(%b{})%s*$')
  if not (brace and brace:find('=')) then return inlines end
  local kv = parse_kv_words(brace:sub(2, -2))
  if not (kv.difficulty or kv.status) then return inlines end
  return strip_trailing_brace(inlines)
end

-- ---------------------------------------------------------------------------
-- private draft-only annotations (detected only to DROP them)
-- ---------------------------------------------------------------------------
local function todo_inlines(blk)
  if blk.t ~= 'Para' and blk.t ~= 'Plain' then return nil end
  local first = blk.content[1]
  if not first or first.t ~= 'Str' then return nil end
  if not first.text:match('^#[Tt][Oo][Dd][Oo]') then return nil end
  return true
end

local function is_evidence(blk)
  if blk.t ~= 'Para' and blk.t ~= 'Plain' then return nil end
  local first = blk.content[1]
  if not first or first.t ~= 'Emph' then return nil end
  return utils.stringify(blk.content):match('^%s*Evidence') ~= nil
end

local function embed_name(blk)
  if blk.t ~= 'Para' and blk.t ~= 'Plain' then return nil end
  local s = trim(utils.stringify(blk.content))
  return s:match('^!%[%[(.-)%]%]$')
end

local function is_manuscript_cb(blk)
  if blk.t ~= 'CodeBlock' then return false end
  local classes = blk.classes or {}
  if #classes == 0 then return true end
  for _, c in ipairs(classes) do
    if CALLOUT_MS[c] then return true end
  end
  return false
end

-- a trailing aid (translation / comment / TODO / evidence / embed) → drop it
local function is_drop_aid(blk)
  return obsidian_zh(blk) or html_comment(blk)
      or todo_inlines(blk) or is_evidence(blk) or embed_name(blk)
end

-- ---------------------------------------------------------------------------
-- manuscript box title bar — mirrors \rl@mstitle in templates/responseletter.sty
--   src=…            → "Supplementary Information"
--   fig=2            → "Manuscript · Figure 2"
--   page=5 sline=158 → "Manuscript · Page 5, Line 158"
--   + eline=160      → "Manuscript · Page 5, Line 158–160"
--   page=Abstract    → "Manuscript · Abstract"   (non-numeric page = a named locator)
-- ---------------------------------------------------------------------------
local function locator_text(o)
  local function present(v) return v and v ~= '' end
  if present(o.fig) then return ' · Figure ' .. o.fig end
  if not present(o.page) then return nil end
  if not tonumber(o.page) then return ' · ' .. o.page end
  if not present(o.sline) then return ' · Page ' .. o.page end
  if present(o.eline) then
    return ' · Page ' .. o.page .. ', Line ' .. o.sline .. '–' .. o.eline
  end
  return ' · Page ' .. o.page .. ', Line ' .. o.sline
end

-- 标题栏 + 正文，正文块已经是 Blocks
local function manuscript_box(opts, blocks)
  local src = (opts.src and opts.src ~= '') and opts.src or 'Manuscript'
  local bar = pandoc.List({ pandoc.Str(src) })
  local loc = locator_text(opts)
  if loc then bar:insert(span(STYLE.ms_locator, { pandoc.Str(loc) })) end
  return styled_para(STYLE.ms_title, bar), styled(STYLE.ms, blocks)
end

-- ---------------------------------------------------------------------------
-- metadata mapping (shared verbatim with responseletter.lua)
-- ---------------------------------------------------------------------------
local function normalize_meta(meta)
  if not meta.papertitle and meta.title then meta.papertitle = meta.title end
  if not meta.journal and meta.target then meta.journal = meta.target end
  if not meta.type then meta.type = pandoc.MetaString('author-response') end
  if meta.authors and utils.type(meta.authors) == 'List' then
    local names = {}
    for _, a in ipairs(meta.authors) do
      if type(a) == 'table' and a.name then
        names[#names + 1] = utils.stringify(a.name)
      else
        names[#names + 1] = utils.stringify(a)
      end
    end
    if #names > 0 then
      meta.authors = pandoc.MetaInlines({ pandoc.Str(table.concat(names, ', ')) })
    end
  end
  return meta
end

-- ---------------------------------------------------------------------------
-- letterhead — mirrors \makeletterhead / \rl@defaultlettertitle / \rl@legend
-- ---------------------------------------------------------------------------
local function letterhead(meta)
  local head = pandoc.List()
  local mtype = meta.type and utils.stringify(meta.type) or 'author-response'

  local kicker = meta.lettertitle and utils.stringify(meta.lettertitle) or nil
  if not kicker or kicker == '' then
    kicker = (mtype == 'reviewer-comments')
      and 'Reviewer Comments to the Manuscript'
      or 'Author Response to Reviews of'
  end
  head:insert(styled_para(STYLE.kicker, { pandoc.Str(kicker) }))

  if meta.papertitle then
    head:insert(styled_para(STYLE.title, meta_inlines(meta.papertitle)))
  end
  if meta.authors then
    head:insert(styled_para(STYLE.author, meta_inlines(meta.authors)))
  end
  if meta.journal then
    local line = meta_inlines(meta.journal)
    if meta.doi then
      line:insert(pandoc.Space())
      line:insert(pandoc.Code(utils.stringify(meta.doi)))
    end
    head:insert(styled_para(STYLE.journal, line))
  end

  -- RC: Reviewer Comment, AR: Author Response, ▢ Manuscript text
  local legend = pandoc.List({
    span(STYLE.rc_label, { pandoc.Str('RC:') }), pandoc.Space(),
    pandoc.Emph({ pandoc.Str('Reviewer Comment') }),
  })
  if mtype ~= 'reviewer-comments' then
    legend:extend({
      pandoc.Str(','), pandoc.Space(),
      span(STYLE.ar_label, { pandoc.Str('AR:') }), pandoc.Space(),
      pandoc.Str('Author Response'),
    })
  end
  legend:extend({
    pandoc.Str(','), pandoc.Space(),
    pandoc.Str('▢'), pandoc.Space(), pandoc.Str('Manuscript text'),
  })
  head:insert(styled_para(STYLE.legend, legend))
  return head
end

-- ---------------------------------------------------------------------------
-- main pass: walk the flat block list, rebuild with native blocks (docx)
-- ---------------------------------------------------------------------------

function Pandoc(doc)
  local meta = normalize_meta(doc.meta)
  local out = letterhead(meta)

  -- 抬头已经手工排好；不清掉这些键，pandoc 的默认模板会在最上面再印一遍标题/日期，
  -- 而 add-zenodo-frontmatter 写进草稿的论文摘要也会整段漏进回复信。
  meta.title = nil
  meta.abstract = nil
  meta.date = nil
  meta.subtitle = nil

  local blocks = doc.blocks
  local i = 1
  local cur_reviewer, cur_subtitle = nil, nil

  local has_md_headings = false
  for _, b in ipairs(blocks) do
    if b.t == 'Header' then has_md_headings = true break end
  end

  -- emit a deduped reviewer/subtopic heading from a callout's title text
  local function emit_heading(title_str)
    local rev, sub = parse_title(title_str)
    if rev and rev ~= '' and rev ~= cur_reviewer then
      out:insert(pandoc.Header(2, { pandoc.Str(rev) }))
      cur_reviewer = rev
      cur_subtitle = nil
    end
    if sub and sub ~= '' and sub ~= cur_subtitle then
      out:insert(pandoc.Header(3, { pandoc.Str(sub) }))
      cur_subtitle = sub
    end
  end

  -- emit response paragraphs: the first carries the hanging "AR:" label (the PDF
  -- route's wording), the rest are unlabelled but stay aligned with it
  local function emit_ar(paras)
    for pi, p in ipairs(paras) do
      if pi == 1 then
        out:insert(labelled(STYLE.ar, STYLE.ar_label, 'AR:', p))
      else
        out:insert(styled_para(STYLE.ar_cont, p))
      end
    end
  end

  while i <= #blocks do
    local blk = blocks[i]
    local kind, firstblk, content = callout_info(blk)

    -- 1. markdown headings drive sectioning (passed through unchanged)
    if blk.t == 'Header' then
      out:insert(blk)
      local plain = trim(utils.stringify(blk.content))
      if blk.level == 1 or plain:match('^[Rr]eviewer') then
        cur_reviewer = plain; cur_subtitle = nil
      else
        cur_subtitle = plain
      end
      i = i + 1

    -- 2. revised manuscript box → title bar + shaded box
    elseif kind and CALLOUT_MS[kind] then
      local title, body1 = split_first(firstblk.content)
      local inner = pandoc.List()
      if #body1 > 0 then inner:insert(pandoc.Para(body1)) end
      for bi = 2, #content do inner:insert(content[bi]) end
      local bar, box = manuscript_box(parse_kv_commas(utils.stringify(title)), inner)
      out:insert(bar)
      out:insert(box)
      i = i + 1

    -- 3. author response written as a callout
    elseif kind and CALLOUT_AR[kind] then
      local _, body1 = split_first(firstblk.content)
      local paras = {}
      if #body1 > 0 then paras[#paras + 1] = body1 end
      for bi = 2, #content do
        local b = content[bi]
        if b.t == 'Para' or b.t == 'Plain' then paras[#paras + 1] = b.content end
      end
      emit_ar(paras)
      local j = i + 1
      while j <= #blocks and is_drop_aid(blocks[j]) do j = j + 1 end
      i = j

    -- 4. reviewer comment callout (the common case) → heading + BlockQuote
    elseif kind and (CALLOUT_RC[kind] or not (CALLOUT_AR[kind] or CALLOUT_MS[kind])) then
      local title, body1 = split_first(firstblk.content)
      if not has_md_headings then emit_heading(utils.stringify(title)) end

      local body_paras = {}
      if #body1 > 0 then body_paras[#body_paras + 1] = body1 end
      for bi = 2, #content do
        local b = content[bi]
        if b.t == 'HorizontalRule' then
          -- separator before the Chinese translation; skip
        elseif (b.t == 'Para' or b.t == 'Plain') then
          if not strip_zh_label(b.content) then          -- drop the 中文翻译 para
            body_paras[#body_paras + 1] = b.content
          end
        end
      end
      if #body_paras > 0 then
        body_paras[1] = strip_leading_remarks(body_paras[1])
        body_paras[#body_paras] = strip_rc_opts(body_paras[#body_paras])
      end

      for pi, p in ipairs(body_paras) do
        if pi == 1 then
          out:insert(labelled(STYLE.rc, STYLE.rc_label, 'RC:', p))
        else
          out:insert(styled_para(STYLE.rc_cont, p))
        end
      end
      i = i + 1

    -- 5. author response written as a bare **Response:** paragraph
    elseif (blk.t == 'Para' or blk.t == 'Plain') and ar_label(blk.content) then
      out:insert(labelled(STYLE.ar, STYLE.ar_label, 'AR:', ar_label(blk.content)))
      local j = i + 1
      while j <= #blocks do
        local b = blocks[j]
        if is_drop_aid(b) then
          j = j + 1
        elseif (b.t == 'Para' or b.t == 'Plain')
            and not callout_info(b) and not ar_label(b.content) then
          out:insert(styled_para(STYLE.ar_cont, b.content))   -- continuation
          j = j + 1
        else
          break
        end
      end
      i = j

    -- 6a. manuscript box already expanded by manuscript_include.lua / manuscript_cite.lua
    --     into a Div, carrying whatever locator manuscript-lines.json supplied.
    elseif blk.t == 'Div' and blk.classes and blk.classes:includes('manuscript') then
      local at = blk.attributes or {}
      local bar, box = manuscript_box({
        src = at['data-src'], fig = at['data-fig'], page = at['data-page'],
        sline = at['data-sline'], eline = at['data-eline'],
      }, blk.content)
      out:insert(bar)
      out:insert(box)
      i = i + 1

    -- 6. revised manuscript text written as a fenced ```manuscript block
    --    (fallback when neither include nor cite ran; citations stay literal)
    elseif is_manuscript_cb(blk) then
      local sub = pandoc.read(blk.text, 'markdown-citations')   -- keep [@key] literal
      local bar, box = manuscript_box({}, sub.blocks)
      out:insert(bar)
      out:insert(box)
      i = i + 1

    -- 7. private draft-only annotations / orphan translations → drop
    elseif is_drop_aid(blk) then
      i = i + 1

    -- 8. fallback bare paragraph → reviewer comment card (heading-less notes only)
    elseif (blk.t == 'Para' or blk.t == 'Plain') and not has_md_headings then
      local body = strip_rc_opts(blk.content)
      out:insert(labelled(STYLE.rc, STYLE.rc_label, 'RC:', body))
      local j = i + 1
      while j <= #blocks and is_drop_aid(blocks[j]) do j = j + 1 end
      i = j

    else
      out:insert(blk)                                -- tables, lists, etc.
      i = i + 1
    end
  end

  return pandoc.Pandoc(out, meta)
end
