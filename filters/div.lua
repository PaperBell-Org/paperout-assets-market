--[[
  Custom Pandoc Divs

  Pandoc divs syntx:
    ::: {.class1 .class2}
    content
    :::

  Current supported classes:
    - hidden: hide the div

  Also strips Obsidian %% … %% comments, whether they fill a whole paragraph or
  sit mid-sentence. A lone, unpaired %% is left as written, so a typo cannot
  swallow the rest of a paragraph.

  By github.com/zcysxy
--]]

local function is_space(il)
  return il.tag == "Space" or il.tag == "SoftBreak" or il.tag == "LineBreak"
end

-- Split a Str on its %% markers: returns the text pieces between them, so
-- "a%%b%%c" -> { "a", "b", "c" } and a Str without markers -> { text }.
local function split_marks(text)
  local parts, i = {}, 1
  while true do
    local s, e = text:find("%%%%", i)
    if not s then parts[#parts + 1] = text:sub(i); return parts end
    parts[#parts + 1] = text:sub(i, s - 1)
    i = e + 1
  end
end

function Inlines(el)
  local out, inside, marks = pandoc.List(), false, 0
  for _, il in ipairs(el) do
    if il.tag == "Str" and il.text:find("%%%%") then
      local parts = split_marks(il.text)
      for k, piece in ipairs(parts) do
        if k > 1 then inside = not inside; marks = marks + 1 end
        if not inside and piece ~= "" then out:insert(pandoc.Str(piece)) end
      end
    elseif not inside then
      out:insert(il)
    end
  end
  if marks == 0 or inside then return el end   -- nothing to strip, or an unpaired %%

  -- Removing "%% note %%" from "Text %% note %% tail" leaves two spaces where the
  -- comment was, and a whole-paragraph comment leaves only spaces: tidy both.
  local tidy = pandoc.List()
  for _, il in ipairs(out) do
    if not (is_space(il) and (#tidy == 0 or is_space(tidy[#tidy]))) then tidy:insert(il) end
  end
  while #tidy > 0 and is_space(tidy[#tidy]) do tidy:remove() end
  return tidy
end

-- A paragraph that was nothing but a comment is now empty: drop it.
function Para(el)
  if #el.content == 0 then return {} end
end

function Div(el)
  if el.classes[1] == 'hidden' then
    return {}
  else
    return el
  end
end
