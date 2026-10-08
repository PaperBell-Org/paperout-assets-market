--[[
  Custom Pandoc Divs

  Pandoc divs syntx:
    ::: {.class1 .class2}
    content
    :::

  Current supported classes:
    - hidden: hide the div

  Also strips Obsidian %% … %% comments, whether they fill a whole paragraph or
  sit mid-sentence, and also when one starts inside **bold** or *italics* and
  ends outside it. Markers pair up within one paragraph (or list item, or
  heading); a comment spanning a blank line is not recognised. A paragraph with an
  odd number of %% is left as written, so a typo cannot swallow the rest of it.

  By github.com/zcysxy
--]]

local MARK = "%%%%"

local function is_space(il)
  return il.tag == "Space" or il.tag == "SoftBreak" or il.tag == "LineBreak"
end

-- Number of %% markers in the block's text, inside formatting included; code and
-- math are their own elements, not Str, so a %% there is never counted.
local function count_marks(inlines)
  local n = 0
  pandoc.walk_inline(pandoc.Span(inlines), {
    Str = function(s)
      for _ in s.text:gmatch(MARK) do n = n + 1 end
    end,
  })
  return n
end

-- Split a Str on its %% markers: returns the text pieces between them, so
-- "a%%b%%c" -> { "a", "b", "c" } and a Str without markers -> { text }.
local function split_marks(text)
  local parts, i = {}, 1
  while true do
    local s, e = text:find(MARK, i)
    if not s then parts[#parts + 1] = text:sub(i); return parts end
    parts[#parts + 1] = text:sub(i, s - 1)
    i = e + 1
  end
end

-- Removing "%% note %%" from "Text %% note %% tail" leaves two spaces where the
-- comment was, and a whole-paragraph comment leaves only spaces: tidy both.
local function tidy(inlines)
  local out = pandoc.List()
  for _, il in ipairs(inlines) do
    if not (is_space(il) and (#out == 0 or is_space(out[#out]))) then out:insert(il) end
  end
  while #out > 0 and is_space(out[#out]) do out:remove() end
  return out
end

-- Copy `inlines`, dropping everything between paired markers. `st.inside` carries
-- the open/closed state across nested formatting, in reading order, so a comment
-- may open inside **bold** and close after it. A container left empty is dropped.
local function strip(inlines, st)
  local out = pandoc.List()
  for _, il in ipairs(inlines) do
    if il.tag == "Str" and il.text:find(MARK) then
      for k, piece in ipairs(split_marks(il.text)) do
        if k > 1 then st.inside = not st.inside end
        if not st.inside and piece ~= "" then out:insert(pandoc.Str(piece)) end
      end
    elseif il.content and il.tag ~= "Note" then
      local kept = strip(il.content, st)
      if #kept > 0 then
        local copy = il:clone()
        copy.content = tidy(kept)
        out:insert(copy)
      end
    elseif not st.inside then
      out:insert(il)
    end
  end
  return out
end

-- Strip the comments from a Para, Plain or Header. A block that was nothing but a
-- comment is dropped; any other block is left alone, empty or not.
-- Returns the stripped inlines, or nil when the block has no (paired) comment.
local function stripped(inlines)
  local n = count_marks(inlines)
  if n == 0 or n % 2 == 1 then return nil end
  return tidy(strip(inlines, { inside = false }))
end

local function strip_block(el)
  local kept = stripped(el.content)
  if not kept then return nil end
  if #kept == 0 then return {} end
  el.content = kept
  return el
end

-- A list item that was only a comment goes with its comment, rather than leaving
-- an empty bullet. Its own pass, so it sees the item before strip_block empties it.
local function drop_comment_items(list)
  local items, dropped = pandoc.List(), false
  for _, item in ipairs(list.content) do
    local only = #item == 1 and (item[1].t == "Plain" or item[1].t == "Para") and item[1]
    local kept = only and stripped(only.content)
    if kept and #kept == 0 then
      dropped = true
    else
      items:insert(item)
    end
  end
  if not dropped then return nil end
  if #items == 0 then return {} end
  list.content = items
  return list
end

local function Div(el)
  if el.classes[1] == 'hidden' then
    return {}
  else
    return el
  end
end

return {
  { BulletList = drop_comment_items, OrderedList = drop_comment_items },
  { Para = strip_block, Plain = strip_block, Header = strip_block, Div = Div },
}
