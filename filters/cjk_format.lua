--[[
  cjk-format-fix.lua —— 中英文混排自动排版
  适用于 Obsidian/PaperBell 的 pandoc 导出（docx / pdf 通用）

  规则：
    1. 中英文间距：汉字 ↔ 字母数字 之间插空格（含跨行内元素边界）
    2. 半角 → 全角：中文语境（至少一侧汉字），半角标点转全角
    3. 全角 → 半角：英文语境（两侧都不是汉字），全角标点转回半角；
       含汉字的段落里还要求至少一侧是西文字符（"）。"、链接后的"。"保持全角）
    4. 全角标点两侧多余空格清除（Inlines 级 + Str 级）
    5. 英文半角标点后补空格（Hello,world → Hello, world）——只在含汉字的段落里
    6. 小数点/千分位/时刻保护（3.14、1,000、10:30 不误转、不补空格）

  "中文语境"按段落判断，不按单个 Str：
    一段行内文字（Para / Plain / Header / 表格单元格 / 脚注里的一段 / 元数据里的一串）
    只要含一个汉字，整段都算中英混排，规则 5 的补空格才生效。
    （规则 3 转出的半角标点后总是补空格：全角标点自带字距，转成半角得补回来。）
    pandoc 按空格切 Str，混排段落里的英文串（中文说明 Hello,world）通常自成一个
    不含汉字的 Str —— 按 Str 判断恰好会漏掉这个 filter 存在的理由。
    全英文段落里的半角文字原样通过：邮箱、DOI、裸域名（example.org/page）都不会被拆。
    脚注自成一段，按自己的内容判断，不继承正文的语境。

  混排段落里的保护：
    - 机器记号（含 @、://、doi: 的连续西文串，如邮箱、URL、DOI）内部一律不动，
      但它和两侧汉字之间照常补空格（邮箱ada@example.org是 → 邮箱 ada@example.org 是）；
      紧贴它的全角标点也保留全角。
    - 点号夹在两个字母数字之间不补空格（example.org、config.yaml、U.S.、Fig.1）：
      这类点分标识符在中文技术写作里远比"漏了空格的英文句号"常见。

  跳过：Code / CodeBlock / Math / RawInline / RawBlock（它们的文字不是 Str，不会被碰到）

--]]

-- ========== 字符判定 ==========
local function is_han(cp)
  return (cp >= 0x4E00 and cp <= 0x9FFF)
      or (cp >= 0x3400 and cp <= 0x4DBF)
      or (cp >= 0x3040 and cp <= 0x30FF)
      or (cp >= 0xF900 and cp <= 0xFAFF)
      or (cp >= 0x20000 and cp <= 0x2A6DF)
end

local function is_alnum(cp)
  return (cp >= 0x30 and cp <= 0x39)
      or (cp >= 0x41 and cp <= 0x5A)
      or (cp >= 0x61 and cp <= 0x7A)
end

local function is_digit(cp) return cp >= 0x30 and cp <= 0x39 end

-- CJK 全角标点（这些两侧不该有多余空格）
local function is_cjk_punct(cp)
  return (cp >= 0x3000 and cp <= 0x303F)   -- 、。「」【】等
      or (cp >= 0xFF01 and cp <= 0xFF60)   -- ，。！？（）等全角 ASCII
end

-- ========== 标点映射 ==========
local HALF2FULL = {
  [string.byte(",")] = "，", [string.byte(";")] = "；",
  [string.byte(":")] = "：", [string.byte("?")] = "？",
  [string.byte("!")] = "！", [string.byte("(")] = "（",
  [string.byte(")")] = "）",
}

local FULL2HALF_CP = {}
do
  local m = {
    ["，"] = ",", ["；"] = ";", ["："] = ":",
    ["？"] = "?", ["！"] = "!", ["（"] = "(",
    ["）"] = ")", ["。"] = ".",
  }
  for full, half in pairs(m) do
    for _, c in utf8.codes(full) do FULL2HALF_CP[c] = half end
  end
end

local NEED_SPACE_AFTER = {
  [string.byte(",")] = true, [string.byte(";")] = true,
  [string.byte(":")] = true, [string.byte(".")] = true,
  [string.byte("?")] = true, [string.byte("!")] = true,
}

local DOT, COMMA, COLON = string.byte("."), string.byte(","), string.byte(":")

-- 规则 5 的例外：标点后紧跟字母数字，但这个标点其实是记号的一部分，不是句读。
--   3.14 / 1,000 / 10:30 —— 两侧都是数字
--   example.org / config.yaml / U.S. / Fig.1 —— 点号夹在两个字母数字之间
local function glued_punct(pprev, prev, cp)
  if not (pprev and is_alnum(pprev)) then return false end
  if prev == DOT then return true end
  return (prev == COMMA or prev == COLON) and is_digit(pprev) and is_digit(cp)
end

-- 邮箱、URL、DOI 这类机器可读的记号：里面的 . : / 是语法而不是标点，
-- 任何"补空格"都是破坏。通讯作者邮箱正是走这条路。
local function is_machine_token(text)
  return text:find("@", 1, true) ~= nil
      or text:find("://", 1, true) ~= nil
      or text:lower():find("doi:", 1, true) ~= nil
end

-- 一个 Str 里可能是"汉字 + 机器记号 + 汉字"（邮箱ada@example.org是）。只冻结记号本身：
-- 按"非汉字、非全角标点"的最长连续段切开，含 @ / :// / doi: 的段整段冻结。
local function frozen_marks(cps)
  local frozen = {}
  local i, n = 1, #cps
  while i <= n do
    local cp = cps[i]
    if is_han(cp) or is_cjk_punct(cp) then
      i = i + 1
    else
      local j = i
      while j < n and not is_han(cps[j+1]) and not is_cjk_punct(cps[j+1]) do j = j + 1 end
      local seg = {}
      for k = i, j do seg[#seg+1] = utf8.char(cps[k]) end
      if is_machine_token(table.concat(seg)) then
        for k = i, j do frozen[k] = true end
      end
      i = j + 1
    end
  end
  return frozen
end

-- ========== 核心：codepoint 级处理 ==========
-- han_context：这个 Str 所在的那段文字里有没有汉字（见文件头）。
local function process_str(s, han_context)
  local cps = {}
  for _, c in utf8.codes(s) do cps[#cps+1] = c end
  local out = {}
  local frozen = frozen_marks(cps)

  for i, cp in ipairs(cps) do
    local prev = cps[i-1]
    local nxt  = cps[i+1]

    -- 机器记号内部原样输出；只在它和前面的汉字之间补空格（后侧由下一个汉字的 (d) 补）
    if frozen[i] then
      if prev and not frozen[i-1] and is_han(prev) and is_alnum(cp) then
        out[#out+1] = " "
      end
      out[#out+1] = utf8.char(cp)
      goto continue
    end

    -- (a) 全角标点在英文语境 → 转半角
    if FULL2HALF_CP[cp] then
      local p_han = prev and is_han(prev)
      local n_han = nxt and is_han(nxt)
      -- 紧贴机器记号的全角标点（song@gea.mpg.de。）按中文标点保留
      local p_tok = frozen[i-1]
      local n_tok = frozen[i+1]
      -- 含汉字的段落里，还要求至少一侧确实是西文字符才转：
      -- "）。"、链接后单独一个"。"这类，邻居是全角标点或 Str 边界，仍是中文标点。
      local latin_side = true
      if han_context then
        local function latin(c) return c and not is_han(c) and not is_cjk_punct(c) end
        latin_side = latin(prev) or latin(nxt)
      end
      if not p_han and not n_han and not p_tok and not n_tok and latin_side then
        -- 全角标点前多余空格回退
        if out[#out] == " " then out[#out] = nil end
        local half = FULL2HALF_CP[cp]
        out[#out+1] = half
        -- 转出来的英文标点后补空格：全角标点自带字距，转成半角就得补上，
        -- 全英文段落也一样（English，full → English, full）；原本就是半角的标点不动
        if nxt and is_alnum(nxt) and NEED_SPACE_AFTER[string.byte(half)] then
          if not (is_digit(nxt) and (half == "." or half == ",")) then
            out[#out+1] = " "
          end
        end
      else
        -- 至少一侧是汉字 → 保留全角，清除前方多余空格
        if out[#out] == " " then out[#out] = nil end
        out[#out+1] = utf8.char(cp)
      end
      goto continue
    end

    do
      -- (b) 半角标点 → 全角（中文语境）
      local converted = nil
      if HALF2FULL[cp] and ((prev and is_han(prev)) or (nxt and is_han(nxt))) then
        if (cp == COMMA or cp == DOT)
            and prev and nxt and is_digit(prev) and is_digit(nxt) then
          -- 小数点 / 千分位保护
        else
          converted = HALF2FULL[cp]
        end
      end

      -- (c) 句号特殊处理
      if not converted and cp == DOT
          and ((prev and is_han(prev)) or (nxt and is_han(nxt)))
          and not (prev and nxt and is_digit(prev) and is_digit(nxt)) then
        converted = "。"
      end

      if converted then
        if out[#out] == " " then out[#out] = nil end
        out[#out+1] = converted
      else
        -- (d) 中英文间距
        if prev and (
             (is_han(prev) and is_alnum(cp)) or
             (is_alnum(prev) and is_han(cp))
           ) then
          out[#out+1] = " "
        end

        -- (e) 英文标点后补空格（仅含汉字的段落；记号里的标点除外，见 glued_punct）
        if han_context and prev and NEED_SPACE_AFTER[prev] and is_alnum(cp)
            and not glued_punct(cps[i-2], prev, cp) then
          if out[#out] ~= " " then
            out[#out+1] = " "
          end
        end

        out[#out+1] = utf8.char(cp)
      end
    end

    ::continue::
  end
  return table.concat(out)
end

-- ========== 段落级语境 ==========

local function str_has_han(text)
  for _, c in utf8.codes(text) do
    if is_han(c) then return true end
  end
  return false
end

-- 不进脚注：脚注是另一段话，有自己的语境。Code / Math 的文字不是 Str，自然不计。
local function run_has_han(inlines)
  local found = false
  inlines:walk {
    traverse = "topdown",
    Note = function(n) return n, false end,
    Str = function(s)
      if not found and str_has_han(s.text) then found = true end
    end,
  }
  return found
end

-- 第一遍（自顶向下）：每遇到一段行内文字的最外层，就按整段定语境、处理其中所有 Str，
-- 然后返回 false 不再下钻 —— 否则 Emph / Link 里的子列表会被当成独立的一段再处理一次。
-- 脚注里的段落递归交回同一个 filter，各按各的语境。
local FORMAT_RUNS = { traverse = "topdown" }

FORMAT_RUNS.Inlines = function(inlines)
  local han = run_has_han(inlines)
  return inlines:walk {
    traverse = "topdown",
    Note = function(n)
      return pandoc.Note(n.content:walk(FORMAT_RUNS)), false
    end,
    Str = function(s)
      s.text = process_str(s.text, han)
      return s
    end,
  }, false
end

-- ========== Inlines 级处理 ==========
local function first_cp(s)
  for _, c in utf8.codes(s) do return c end
end
local function last_cp(s)
  local last
  for _, c in utf8.codes(s) do last = c end
  return last
end

local function edge_cp(inline, which)
  local t = inline.tag
  if t == "Str" then
    return which == "tail" and last_cp(inline.text) or first_cp(inline.text)
  elseif t == "Code" then
    return which == "tail" and last_cp(inline.text) or first_cp(inline.text)
  elseif t == "Emph" or t == "Strong" or t == "Underline"
      or t == "Strikeout" or t == "Link" or t == "Span" or t == "Quoted" then
    local inner = inline.content
    if not inner or #inner == 0 then return nil end
    local idx = which == "tail" and #inner or 1
    return edge_cp(inner[idx], which)
  elseif t == "Math" then
    return 0x41  -- 公式视作西文
  end
  return nil
end

-- 第二遍（默认顺序）：跨行内元素边界的空格处理。放在 Str 处理之后，
-- 因为它要看 Str 处理完的边缘字符（中文, → 中文，之后，后面的 Space 才该删）。
local function fix_boundaries(inlines)
  local out = {}
  for i = 1, #inlines do
    local cur = inlines[i]
    local prv = inlines[i-1]
    local nxt = inlines[i+1]

    -- 清除全角标点旁的 Space 元素
    if cur.tag == "Space" then
      -- 前一个元素尾部是全角标点 → 跳过此 Space
      if prv then
        local a = edge_cp(prv, "tail")
        if a and is_cjk_punct(a) then goto skip end
      end
      -- 后一个元素头部是全角标点 → 跳过此 Space
      if nxt then
        local b = edge_cp(nxt, "head")
        if b and is_cjk_punct(b) then goto skip end
      end
    end

    -- 中英文间距：跨元素边界补空格
    if prv then
      local a = edge_cp(prv, "tail")
      local b = edge_cp(cur, "head")
      if a and b then
        if (is_han(a) and is_alnum(b)) or (is_alnum(a) and is_han(b)) then
          out[#out+1] = pandoc.Space()
        end
      end
    end

    out[#out+1] = cur
    ::skip::
  end
  return out
end

return {
  FORMAT_RUNS,
  { Inlines = fix_boundaries },
}
