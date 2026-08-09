import assert from "node:assert/strict";
import test from "node:test";

import {
  parseVerificationPackageCreateResponse,
  serializeVerificationPackage,
  verificationPackageFilename,
} from "./verification-package.ts";

function response(status: "pass" | "review" | "fail" = "pass") {
  return {
    success: true,
    operation: "verification_package_create",
    package: {
      format: "archsight-solver-verification-package",
      formatVersion: "1.0.0",
      integrity: { packageHash: "a".repeat(64) },
    },
    verification: {
      status,
      integrityValid: status !== "fail",
      replayMatched: status !== "fail",
    },
  };
}

test("可信计算包客户端只接受已通过完整性校验和复算的公开响应", () => {
  assert.equal(parseVerificationPackageCreateResponse(response()).verification.status, "pass");
  assert.equal(parseVerificationPackageCreateResponse(response("review")).verification.status, "review");
  assert.throws(() => parseVerificationPackageCreateResponse(response("fail")), /未通过生成后的完整性校验与复算/u);
  assert.throws(
    () => parseVerificationPackageCreateResponse({ ...response(), operation: "unexpected" }),
    /响应不符合公开契约/u,
  );
});

test("可信计算包导出使用稳定扩展名和可读 JSON", () => {
  assert.equal(verificationPackageFilename("beam"), "archsight-solver-beam.solver-verification.json");
  assert.equal(verificationPackageFilename("frame"), "archsight-solver-frame.solver-verification.json");
  assert.equal(verificationPackageFilename("truss"), "archsight-solver-truss.solver-verification.json");
  assert.equal(
    serializeVerificationPackage({ format: "archsight-solver-verification-package" }),
    "{\n  \"format\": \"archsight-solver-verification-package\"\n}\n",
  );
});
