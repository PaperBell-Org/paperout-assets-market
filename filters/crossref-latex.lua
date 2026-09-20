--[[
  crossref-latex.lua —— 在自定义 writer 链上，让 pandoc-crossref 知道目标是 LaTeX

  pandoc 把目标格式当作 argv[1] 传给外部 filter，pandoc-crossref 就靠它决定行为。
  而当 defaults 的 `to:` 指向一个自定义 Lua writer 时，这个字符串是 **writer 文件的
  路径**（实测 FORMAT=[…/writers/latex-submission.lua]），crossref 认不出 LaTeX，
  于是退回通用模式，做三件对 LaTeX 有害的事：

    * 把「Figure 1: 」烤进 caption —— \caption 之后还会再排一次 "Fig. 1"
    * 把 [@fig:x] 冻成死文本 "Figure 1" —— 期刊重排图序后全错
    * 用 \qquad{(1)} 假装公式编号，\label 落在公式环境外面，\ref 抓到别的计数器

  crossref 没有强制格式的元数据开关（-M format / crossrefFormat / outputFormat
  都试过，无效）。但 pandoc 暴露了 run_json_filter，可以自己指定那个 argv：
  把格式定死成 latex，crossref 就原生产出 \caption{原文}、\ref{} 和真正的
  equation 环境，不需要事后修补。

  用法：在 defaults 的 filters: 列表里，把原本写 `pandoc-crossref` 的那一行
  换成本文件的路径，位置不变。

  注意 run_json_filter 只按 PATH 找可执行文件（不查 pandoc 的 $DATADIR/filters）。
  对 pandoc-crossref 没问题 —— 用户本来就是装到 PATH 上的。
--]]

function Pandoc(doc)
  return pandoc.utils.run_json_filter(doc, 'pandoc-crossref', { 'latex' })
end
