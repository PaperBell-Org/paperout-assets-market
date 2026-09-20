-- nature-latex-layout.lua
-- nature-latex 这条链的版式默认值：图、表后置。笔记 frontmatter 仍可覆盖。
--
-- 为什么用 filter 而不是在 defaults 的 metadata: 里写 figures-at-end: true：
--   pandoc 的 defaults `metadata:`/`variables:` 优先级都高于文档 frontmatter，
--   一旦写死，单篇笔记的 `figures-at-end: false` 就再也关不掉。filter 直接改
--   文档 meta，只在「笔记没写」时才填默认值。同一个道理见 lineno_default.lua，
--   以及 defaults/nature-latex.yaml 里 sn-refstyle / CJKmainfont 为什么也不写在那儿。
--
-- 必须排在 figures-at-end.lua 之前 —— 那个 filter 在 Meta 阶段读这两个键决定搬不搬，
-- 排在它后面就晚了。
--
-- 只管这两个键。另外两个版式开关（行号 lineno、双倍行距 referee）是 sn-jnl 的
-- documentclass 选项，由 writers/latex-submission.lua 的 class_options() 读 meta 决定，
-- 不经过这里。

local function truthy(v)
  local s = pandoc.utils.stringify(v):lower():gsub('%s+', '')
  return not (s == 'false' or s == 'no' or s == '0' or s == 'off' or s == '')
end

function Meta(meta)
  for _, key in ipairs({ 'figures-at-end', 'tables-at-end' }) do
    if meta[key] == nil then
      meta[key] = true
    else
      meta[key] = truthy(meta[key])
    end
  end
  return meta
end
