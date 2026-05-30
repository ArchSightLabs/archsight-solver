import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTextModelNumber,
  parseTextModelNumericCode,
  prefixTextModelId,
  splitTextModelTokens,
  uniqueTextModelId,
} from "./text-model-utils.ts";

test("文本模型分词统一处理注释、中文逗号和空白", () => {
  assert.deepEqual(splitTextModelTokens("NODE，N1, 0\t4 # 注释"), ["NODE", "N1", "0", "4"]);
  assert.deepEqual(splitTextModelTokens("N,1,0,0！中文注释", { commentMarkers: ["//", "#", "！"] }), ["N", "1", "0", "0"]);
});

test("文本模型数字解析保留框架旧格式括号兼容", () => {
  assert.equal(parseTextModelNumber(" 12.5 "), 12.5);
  assert.equal(parseTextModelNumber("(4)", { stripParentheses: true }), 4);
  assert.equal(parseTextModelNumber(""), null);
  assert.equal(parseTextModelNumber("abc"), null);
});

test("文本模型编号工具统一处理数字编号、前缀和重复编号", () => {
  assert.equal(parseTextModelNumericCode("M12"), 12);
  assert.equal(prefixTextModelId("2", "N1", "N"), "N2");
  assert.equal(prefixTextModelId("b1", "M1", "M", { preserveAnyLeadingAlpha: true }), "B1");

  const used = new Set<string>(["N1"]);
  assert.equal(uniqueTextModelId("N1", used), "N1-2");
  assert.equal(uniqueTextModelId("", used), "ID");
});
