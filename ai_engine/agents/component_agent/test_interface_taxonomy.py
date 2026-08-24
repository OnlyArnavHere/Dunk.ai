"""Tests for interface taxonomy routing.

Weighted toward the THREE STATES of endpoint_role, because collapsing any two of
them is the failure this design exists to prevent -- the same principle as
coverage.interface_confidence returning None for "not checked" rather than
folding it into "absent".

Run:  ai_engine/.venv/bin/python agents/component_agent/test_interface_taxonomy.py
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# `config` downloads the dataset at import time; stub it (as test_coverage does).
if "config" not in sys.modules:
    stub = types.ModuleType("config")
    stub.DEFAULT_QTY = 1
    sys.modules["config"] = stub

import interface_taxonomy as tax  # noqa: E402
import ranking  # noqa: E402
from parser import ArchitectureParser  # noqa: E402

FAILURES: list[str] = []


def check(label, got, want):
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


print("\n=== every ALLOWED_INTERFACE classifies, none falls off the table ===")

ALLOWED = {"GPIO","UART","SPI","I2C","USB","CAN","Ethernet","PCIe","SDIO","Power",
           "BLE","WiFi","RF","Audio","Analog","ADC","PWM","I2S"}
EXPECTED = {
    "I2C": "shared_bus", "SPI": "shared_bus", "I2S": "shared_bus",
    "UART": "peer", "CAN": "peer", "Ethernet": "peer",
    "USB": "host_device", "PCIe": "host_device", "SDIO": "host_device",
    "GPIO": "not_a_bus", "PWM": "not_a_bus", "ADC": "not_a_bus",
    "Analog": "not_a_bus", "Audio": "not_a_bus", "Power": "not_a_bus",
    "BLE": "not_applicable", "WiFi": "not_applicable", "RF": "not_applicable",
}
check("all 18 interfaces covered", sorted(EXPECTED), sorted(ALLOWED))
for iface in sorted(ALLOWED):
    check(f"{iface} -> {EXPECTED[iface]}", tax.relationship_for(iface), EXPECTED[iface])

# USB is in _COMPLEMENTARY (its WIRES are symmetric) but is host/device at the
# LINK level. Order of checks in relationship_for() must not conflate them.
check("USB is host_device despite being in _COMPLEMENTARY",
      tax.relationship_for("USB"), "host_device")


print("\n=== the three states of endpoint_role must stay distinguishable ===")

# 1. SETTLED NULL -- key present, value None. Terminal.
uart = tax.build_requirement("UART")
check("peer: endpoint_role key IS present", "endpoint_role" in uart, True)
check("peer: endpoint_role is None (settled, no controller exists)",
      uart["endpoint_role"], None)

# 2. NOT YET COMPUTED -- key absent. Concept applies, inference not implemented.
i2c = tax.build_requirement("I2C")
check("shared_bus: endpoint_role key is ABSENT (not yet computed)",
      "endpoint_role" in i2c, False)
check("shared_bus: relationship still states the concept applies",
      i2c["relationship"], "shared_bus")
usb = tax.build_requirement("USB")
check("host_device: endpoint_role key is ABSENT (not yet computed)",
      "endpoint_role" in usb, False)

# The distinction that matters: absent != present-and-None.
check("absent key and settled-None are NOT the same state",
      ("endpoint_role" in i2c) == ("endpoint_role" in uart), False)
check("a settled None must never be read as missing data",
      uart.get("endpoint_role", "MISSING") is None, True)
check("an absent key must never be read as a settled None",
      i2c.get("endpoint_role", "MISSING"), "MISSING")

# 3. NOT APPLICABLE -- dropped before retrieval, never scored.
check("wireless is not scoreable", tax.is_scoreable("WiFi"), False)
check("Power is not scoreable", tax.is_scoreable("Power"), False)
check("I2C is scoreable", tax.is_scoreable("I2C"), True)


print("\n=== parser drops Power + wireless, and records what it dropped ===")

ARCH = {"architecture_graph": {
    "nodes": [
        {"id": "mcu", "data": {"label": "MCU", "category": "Processing"}},
        {"id": "pm", "data": {"label": "Power Management", "category": "Power"}},
        {"id": "sensor", "data": {"label": "Temp Sensor", "category": "Sensor"}},
        {"id": "radio", "data": {"label": "Wi-Fi Module", "category": "Communication"}},
    ],
    "edges": [
        {"source": "pm", "target": "mcu", "data": {"interface": "Power"}},
        {"source": "pm", "target": "sensor", "data": {"interface": "Power"}},
        {"source": "mcu", "target": "sensor", "data": {"interface": "I2C"}},
        {"source": "pm", "target": "radio", "data": {"interface": "Power"}},
        {"source": "mcu", "target": "radio", "data": {"interface": "UART"}},
        {"source": "mcu", "target": "radio", "data": {"interface": "WiFi"}},
    ],
}}
by_ref = {r["subsystem"]: r for r in ArchitectureParser().parse(ARCH)}

sensor = by_ref["Temp Sensor"]
ifaces = [r["interface"] for r in sensor["interface_requirements"]]
check("sensor: Power dropped from requirements", "Power" in ifaces, False)
check("sensor: I2C retained", ifaces, ["I2C"])
check("sensor: dropped Power is RECORDED, not vanished",
      sensor["interfaces_not_applicable"], ["Power"])
check("sensor: legacy power_interfaces untouched (query text)",
      sensor["power_interfaces"], ["Power"])

radio = by_ref["Wi-Fi Module"]
r_ifaces = [r["interface"] for r in radio["interface_requirements"]]
check("radio: WiFi dropped from requirements", "WiFi" in r_ifaces, False)
check("radio: UART retained", r_ifaces, ["UART"])
check("radio: WiFi + Power both recorded as dropped",
      radio["interfaces_not_applicable"], ["Power", "WiFi"])
check("radio: WiFi still present in query-text interfaces",
      "WiFi" in radio["interfaces"], True)
check("radio: UART requirement carries settled-None endpoint_role",
      radio["interface_requirements"][0]["endpoint_role"], None)


print("\n=== ranking consumes the structured list, and still falls back ===")

# A part proving Power but absent on I2C must not be rescued by Power now that
# Power is not required at all.
req_structured = {
    "interface_requirements": [
        {"interface": "I2C", "relationship": "shared_bus"},
        {"interface": "WiFi", "relationship": "not_applicable"},
    ]
}
cand = {"mfr_part": "X", "extra_params": {}, "description": "plain regulator"}
check("not_applicable entries never reach scoring",
      ranking._score_interface_match(cand, req_structured),
      ranking._IFACE_NO_EVIDENCE)

# Legacy request shape (no interface_requirements) must behave exactly as before.
legacy = {"interfaces": ["I2C"], "power_interfaces": ["Power"]}
check("legacy flat request still scores (fallback path)",
      ranking._score_interface_match(cand, legacy), ranking._IFACE_NO_EVIDENCE)

# An all-wireless request has nothing scoreable left -> nothing to fail on.
all_wireless = {"interface_requirements": [
    {"interface": "WiFi", "relationship": "not_applicable"}]}
check("all-wireless request has no requirement to fail",
      ranking._score_interface_match(cand, all_wireless), 1.0)


print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_interface_taxonomy():
    assert not FAILURES, FAILURES
