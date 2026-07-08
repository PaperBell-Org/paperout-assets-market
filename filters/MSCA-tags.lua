-- Define a dictionary for heading-text-to-tag mapping
local tag_map = {
    ["Excellence"] = "REL-EVA-RE",
    ["Quality and pertinence of the project's research and innovation objective"] = "QUA-LIT-QL",
    ["Impacts"] = "IMP-ACT-IA",
    ["Suitability and quality of the measures to maximise expected outcomes and impacts, as set out in the dissemination and exploitation plan, including communication activities"] = "COM-DIS-VIS-CDV",
    ["Quality and Efficiency of the Implementation"] = "WRK-PLA-WP, CON-SORCS, PRJ-MGT-PM",
    -- Add more mappings as needed
  }

-- Lua filter to add custom tags based on the heading content
function Header(el)
  -- Convert the heading content to plain text for comparison
  local heading_text = pandoc.utils.stringify(el.content)

  -- Check if the heading text exists in the tag_map dictionary
  local tag_label = tag_map[heading_text]

  -- If a tag exists for the given heading, add it to the header content
  if tag_label then
    -- Add a space and the tag as raw LaTeX to the header content
    table.insert(el.content, pandoc.Space())
    table.insert(el.content, pandoc.RawInline('latex', '\\mscatag{' .. tag_label .. '}'))
  end
  
  return el
end