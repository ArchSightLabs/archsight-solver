import type { AnalysisMode } from "../types/structure.ts";

export const VERIFICATION_PACKAGE_FORMAT = "archsight-solver-verification-package";
export const VERIFICATION_PACKAGE_FORMAT_VERSION = "1.0.0";

export type VerificationStatus = "pass" | "review" | "fail";

export interface VerificationPackageCreateResponse {
  readonly package: Record<string, unknown>;
  readonly verification: {
    readonly status: VerificationStatus;
    readonly integrityValid: boolean;
    readonly replayMatched: boolean | null;
  };
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseVerificationPackageCreateResponse(value: unknown): VerificationPackageCreateResponse {
  const response = recordOf(value);
  const verificationPackage = recordOf(response?.package);
  const verification = recordOf(response?.verification);
  const status = verification?.status;
  if (
    response?.success !== true
    || response.operation !== "verification_package_create"
    || verificationPackage === null
    || verification === null
    || verificationPackage?.format !== VERIFICATION_PACKAGE_FORMAT
    || verificationPackage.formatVersion !== VERIFICATION_PACKAGE_FORMAT_VERSION
    || (status !== "pass" && status !== "review" && status !== "fail")
  ) {
    throw new Error("可信计算包响应不符合公开契约");
  }
  if (status === "fail" || verification.integrityValid !== true || verification.replayMatched !== true) {
    throw new Error("可信计算包未通过生成后的完整性校验与复算，请重试或检查模型输入");
  }
  return {
    package: verificationPackage,
    verification: {
      status,
      integrityValid: true,
      replayMatched: true,
    },
  };
}

export function serializeVerificationPackage(verificationPackage: Record<string, unknown>): string {
  return `${JSON.stringify(verificationPackage, null, 2)}\n`;
}

export function verificationPackageFilename(mode: AnalysisMode): string {
  const modeSlug: Record<AnalysisMode, string> = {
    beam: "beam",
    frame: "frame",
    truss: "truss",
  };
  return `archsight-solver-${modeSlug[mode]}.solver-verification.json`;
}
