import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, safeCssHexColor } from "./html-escape.ts";

test("escapeHtml 转义 tooltip 中的用户输入文本", () => {
  assert.equal(
    escapeHtml(`N1"><img src=x onerror=alert(1)> & '节点'`),
    "N1&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &#39;节点&#39;",
  );
});

test("safeCssHexColor 只允许十六进制颜色值", () => {
  assert.equal(safeCssHexColor("#0ea5e9"), "#0ea5e9");
  assert.equal(safeCssHexColor("#abc"), "#aabbcc");
  assert.equal(safeCssHexColor(`red;display:block"`), "#0ea5e9");
});
