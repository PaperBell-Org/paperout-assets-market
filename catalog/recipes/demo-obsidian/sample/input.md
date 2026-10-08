---
title: A Minimal Sample Manuscript
author: Test Author
date: 2026-01-01
---

# Introduction

This is a minimal manuscript used by CI to prove the recipe builds. It contains a
heading, a paragraph, an equation $E = mc^2$, and a list — enough to exercise the
templating and core filters without external assets (no images, no bibliography).

# Methods

- first point
- second point

Ordinary paragraph text follows, with **bold** and *italic* emphasis.

# 中英混排

本研究用 Python 和 R 处理灌溉数据,结果见 Nature Water（doi:10.1038/s44221-023-00001-x）。通讯作者邮箱ada@example.org，补充数据放在 example.org/data 和 config.yaml 里；关键参数为 3.14 与 1,000,误差约 0.5%。英文术语 water use,irrigation quota 在中文段落中保留，句中的全角标点 Hello，world 会转成半角，链接 [说明](https://example.org)。

An all-English paragraph is left alone: write to ada@example.org, see example.org/data
or doi:10.1038/x,and keep Hello,world exactly as typed.
