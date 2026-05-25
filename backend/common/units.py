from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class UnitRegistry:
    factors: Dict[str, Dict[str, float]]
    defaults: Dict[str, str]

    def factor(self, quantity: str, unit: str) -> float:
        try:
            return self.factors[quantity][unit]
        except KeyError as exc:
            raise ValueError(f"未知单位: {quantity} / {unit}") from exc

    def to_si(self, value: float, quantity: str, unit: str) -> float:
        return float(value) * self.factor(quantity, unit)

    def from_si(self, value: float, quantity: str, unit: str) -> float:
        return float(value) / self.factor(quantity, unit)

    def convert(self, value: float, quantity: str, from_unit: str, to_unit: str) -> float:
        return self.from_si(self.to_si(value, quantity, from_unit), quantity, to_unit)

    def default_unit(self, quantity: str) -> str:
        try:
            return self.defaults[quantity]
        except KeyError as exc:
            raise ValueError(f"未知单位类别: {quantity}") from exc


MM = 0.001
CM = 0.01
M = 1.0
N = 1.0
KN = 1000.0

ENGINEERING_UNITS = UnitRegistry(
    factors={
        "length": {"mm": MM, "cm": CM, "m": M},
        "force": {"N": N, "kN": KN},
        "moment": {"N.m": N * M, "kN.m": KN * M},
        "distributed": {"N/m": N / M, "kN/m": KN / M},
        "stiffness": {"N/m": N / M, "kN/m": KN / M, "N/mm": N / MM, "kN/mm": KN / MM},
        "rotational_stiffness": {"N.m/rad": N * M, "kN.m/rad": KN * M},
        "area": {"mm2": MM**2, "cm2": CM**2, "m2": M**2},
        "elastic_modulus": {"Pa": N / M**2, "MPa": N / MM**2, "GPa": KN / MM**2},
        "moment_of_inertia": {"mm4": MM**4, "cm4": CM**4, "m4": M**4},
        "deflection": {"mm": MM, "cm": CM, "m": M},
    },
    defaults={
        "length": "m",
        "force": "kN",
        "moment": "kN.m",
        "distributed": "kN/m",
        "stiffness": "kN/m",
        "rotational_stiffness": "kN.m/rad",
        "area": "cm2",
        "elastic_modulus": "GPa",
        "moment_of_inertia": "cm4",
        "deflection": "mm",
    },
)


def to_si(value: float, quantity: str, unit: str) -> float:
    return ENGINEERING_UNITS.to_si(value, quantity, unit)


def from_si(value: float, quantity: str, unit: str) -> float:
    return ENGINEERING_UNITS.from_si(value, quantity, unit)
