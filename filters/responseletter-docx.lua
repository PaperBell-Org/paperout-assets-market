--[[
  responseletter-docx.lua — pandoc Lua filter (Word / .docx sibling of responseletter.lua)

  Same Obsidian authoring contract as responseletter.lua, but instead of emitting
  responseletter.sty LaTeX it rebuilds the document as plain Pandoc blocks suitable
  for DOCX, and STRIPS every Chinese translation / draft-only aid on the way out:

    Reviewer comment callout  →  "Reviewer #N" heading (deduped) + the English
                                  comment as a BlockQuote.  The "---" rule and the
                                  "**中文翻译：**" paragraph are dropped.
    Author response           →  normal paragraphs, the first led by a bold
                                  "Response:" label.  Trailing %% … %% / <!-- … -->
                                  aids (Chinese, notes) are dropped.
    Revised manuscript        →  a BlockQuote of the revised text ([@key] kept literal).

  Draft-only carriers (中文翻译, \note, badges, #TODO, *Evidence*, image embeds) are
  all removed — the .docx is the clean, English-only, submission-style letter.

  The parsing helpers below are kept identical to responseletter.lua so both filters
  recognise exactly the same source.
]]

local utils = pandoc.utils

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
-- main pass: walk the flat block list, rebuild with native blocks (docx)
-- ---------------------------------------------------------------------------

function Pandoc(doc)
  normalize_meta(doc.meta)
  local out = pandoc.List()
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

  -- emit response paragraphs: first carries a bold "Response:" label
  local function emit_ar(paras)
    for pi, p in ipairs(paras) do
      if pi == 1 then
        local lead = { pandoc.Strong({ pandoc.Str('Response:') }), pandoc.Space() }
        for _, el in ipairs(p) do lead[#lead + 1] = el end
        out:insert(pandoc.Para(lead))
      else
        out:insert(pandoc.Para(p))
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

    -- 2. revised manuscript box → BlockQuote
    elseif kind and CALLOUT_MS[kind] then
      local title, body1 = split_first(firstblk.content)
      local inner = pandoc.List()
      if #body1 > 0 then inner:insert(pandoc.Para(body1)) end
      for bi = 2, #content do inner:insert(content[bi]) end
      out:insert(pandoc.BlockQuote(inner))
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

      local inner = pandoc.List()
      for _, p in ipairs(body_paras) do inner:insert(pandoc.Para(p)) end
      out:insert(pandoc.BlockQuote(inner))
      i = i + 1

    -- 5. author response written as a bare **Response:** paragraph
    elseif (blk.t == 'Para' or blk.t == 'Plain') and ar_label(blk.content) then
      out:insert((function()
        local lead = { pandoc.Strong({ pandoc.Str('Response:') }), pandoc.Space() }
        for _, el in ipairs(ar_label(blk.content)) do lead[#lead + 1] = el end
        return pandoc.Para(lead)
      end)())
      local j = i + 1
      while j <= #blocks do
        local b = blocks[j]
        if is_drop_aid(b) then
          j = j + 1
        elseif (b.t == 'Para' or b.t == 'Plain')
            and not callout_info(b) and not ar_label(b.content) then
          out:insert(pandoc.Para(b.content))               -- continuation
          j = j + 1
        else
          break
        end
      end
      i = j

    -- 6. revised manuscript text written as a fenced ```manuscript block
    elseif is_manuscript_cb(blk) then
      local sub = pandoc.read(blk.text, 'markdown-citations')   -- keep [@key] literal
      out:insert(pandoc.BlockQuote(sub.blocks))
      i = i + 1

    -- 7. private draft-only annotations / orphan translations → drop
    elseif is_drop_aid(blk) then
      i = i + 1

    -- 8. fallback bare paragraph → reviewer comment card (heading-less notes only)
    elseif (blk.t == 'Para' or blk.t == 'Plain') and not has_md_headings then
      local body = strip_rc_opts(blk.content)
      out:insert(pandoc.BlockQuote({ pandoc.Para(body) }))
      local j = i + 1
      while j <= #blocks and is_drop_aid(blocks[j]) do j = j + 1 end
      i = j

    else
      out:insert(blk)                                -- tables, lists, etc.
      i = i + 1
    end
  end

  return pandoc.Pandoc(out, doc.meta)
end
