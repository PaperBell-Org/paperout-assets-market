--[[
  lineno-docx.lua —— Word 导出时添加行号

  用法：笔记 frontmatter 里 `lineno: true`（manuscript-obsidian 由 lineno_default.lua
  默认打开，写 `lineno: false` 可关）。
  效果：Word 文档左侧逐行显示行号，并且**跨页连续编号**（restart="continuous"）——
  审稿意见按"第 137 行"指位置，每页从 1 重来会让这种引用失去意义。

  原理：在文档末尾注入一个连续分节符，其节属性包含行号设置。
  PDF 导出时此 filter 不生效（PDF 靠 LaTeX 的 lineno 包）。

  为什么这个分节符必须自带 pgSz / pgMar：
    它是文档里第一个 sectPr，所以它定义的是「正文这一节」；reference-doc 带来的
    body 级 sectPr 退化成只管末尾那个空节。OOXML 的节属性不向后继承，因此只写
    lnNumType 会让整篇正文丢掉母版的纸张与页边距，改由 Word 按本地默认排版
    （中文 Word = A4 + 中文页边距）。页面参数从 metadata 的 docxPage 读，取值应与
    该路线母版的 sectPr 保持一致：
      manuscript-obsidian → scripts/mk-manuscript-reference.mjs 的 SECT_PR
      demo-obsidian       → templates/demo-reference.docx 的 sectPr
    没有配 docxPage 时退化成只注入行号（并在 stderr 提示），行为与旧版一致。
--]]

-- metadata 值 → 十进制整数字符串（同时挡住把任意文本拼进 XML）
local function twips(v)
  if v == nil then return nil end
  local n = tonumber(pandoc.utils.stringify(v))
  if n == nil then return nil end
  return string.format("%d", math.floor(n))
end

-- docxPage → <w:pgSz/><w:pgMar/>；缺项就不写该元素
local function page_xml(spec)
  if spec == nil then return "" end
  local w, h = twips(spec.width), twips(spec.height)
  local top, right = twips(spec.top), twips(spec.right)
  local bottom, left = twips(spec.bottom), twips(spec.left)
  local header = twips(spec.header) or "720"
  local footer = twips(spec.footer) or "720"

  local out = {}
  if w and h then
    out[#out+1] = string.format('<w:pgSz w:w="%s" w:h="%s"/>', w, h)
  end
  if top and right and bottom and left then
    out[#out+1] = string.format(
      '<w:pgMar w:top="%s" w:right="%s" w:bottom="%s" w:left="%s"'
        .. ' w:header="%s" w:footer="%s" w:gutter="0"/>',
      top, right, bottom, left, header, footer)
  end
  return table.concat(out)
end

function Pandoc(doc)
  -- 仅对 docx 生效
  if not FORMAT:match("docx") then return end

  local meta = doc.meta
  if not meta.lineno then return end
  local v = pandoc.utils.stringify(meta.lineno)
  if v ~= "true" and v ~= "yes" then return end

  local page = page_xml(meta.docxPage)
  if page == "" then
    io.stderr:write("[WARNING] lineno-docx.lua: no docxPage metadata — the injected"
      .. " section drops the reference doc's page size and margins\n")
  end

  -- 注入 OOXML：连续分节符 + 页面设置 + 行号属性
  -- （CT_SectPr 的元素顺序是固定的：type → pgSz → pgMar → lnNumType）
  local xml = table.concat({
    "<w:p>\n  <w:pPr>\n    <w:sectPr>\n",
    '      <w:type w:val="continuous"/>\n',
    page ~= "" and ("      " .. page .. "\n") or "",
    -- 不写 w:start：Word 自己的行号对话框在"从 1 开始"时也不写这个属性，而渲染器
    -- 对它的理解并不一致（LibreOffice 当成偏移量：start="1" 首行会显示 2）。省略
    -- 就是两边都从 1 开始。restart="continuous" = 跨页连续编号，不每页重来。
    '      <w:lnNumType w:countBy="1" w:restart="continuous"/>\n',
    "    </w:sectPr>\n  </w:pPr>\n</w:p>",
  })

  doc.blocks:insert(pandoc.RawBlock("openxml", xml))
  return doc
end
