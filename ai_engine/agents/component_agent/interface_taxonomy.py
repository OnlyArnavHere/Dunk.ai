"""Interface taxonomy — the single source of truth for what an interface IS.

These tables were previously defined inside `agents/supervisor/nodes.py`, where
they drove schema-2.0 net building and the handoff validator. They are moved
here, unchanged, because a SECOND consumer now needs them: the retrieval/ranking
path, which until now flattened every architecture edge to a bare interface
string and scored them all identically.

That flattening is what this module exists to end. `nodes.py` already knew that
I2C is a shared bus with CLOCK/DATA roles and that WiFi is not a board net at
all; `parser.py` and `ranking.py` did not, and could not, because the knowledge
lived downstream of them. Reimplementing it here would have created two tables
to keep in step -- so nodes.py now imports from this module instead.

RELATIONSHIP TYPES
------------------
shared_bus   Every participant shares one wire per signal. A controller exists
             and is distinguishable from its targets (I2C, SPI, I2S).
peer         Two ends, symmetric. NO controller exists -- this is a settled
             fact about the interface, not missing data (UART, CAN, Ethernet).
host_device  Asymmetric, but NOT along the Processing/peripheral axis: an
             Expansion node can be either end (USB, PCIe, SDIO).
not_a_bus    Not a bus at all. The real requirement is usually a QUANTITY of
             pins (">=N free GPIOs"), which nothing scores today (GPIO, PWM,
             ADC, Analog, Audio, Power).
not_applicable  A link through the air, not copper between two parts. Carries
             no board-level component requirement whatsoever (BLE, WiFi, RF).
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Moved verbatim from nodes.py -- see module docstring.
# ---------------------------------------------------------------------------

# Roles legal for each interface. Anything not listed is rejected upstream by
# the handoff validator rather than being silently mapped to something.
INTERFACE_ROLES: dict[str, tuple[str, ...]] = {
    "I2C": ("CLOCK", "DATA"),
    "SPI": ("CLOCK", "MOSI", "MISO", "CHIP_SELECT"),
    "UART": ("TX", "RX"),
    "USB": ("DP", "DM", "VBUS"),
    "CAN": ("CAN_H", "CAN_L"),
    "Ethernet": ("TXP", "TXN", "RXP", "RXN"),
    "SDIO": ("CLOCK", "CMD", "DATA"),
    "PCIe": ("TXP", "TXN", "RXP", "RXN", "CLOCK"),
    "I2S": ("BIT_CLOCK", "WORD_CLOCK", "DATA"),
    "Power": ("SUPPLY", "GROUND"),
    "GPIO": ("GPIO",),
    "PWM": ("PWM",),
    "ADC": ("ANALOG_IN",),
    "Analog": ("ANALOG_IN",),
    "Audio": ("AUDIO",),
    # Wireless links are not board nets -- see _WIRELESS below.
    "BLE": (),
    "WiFi": (),
    "RF": (),
}

# Interfaces that describe a link through the air, not copper between two parts.
# v1 mapped these to an "ANT" pin on BOTH endpoints, inventing a connection that
# does not physically exist. They are recorded as logical links instead.
_WIRELESS = frozenset({"BLE", "WiFi", "RF"})

# Buses where every participant shares the same wire per signal. Edges sharing a
# component are merged into ONE bus, which is what prevents split half-nets.
_SHARED_BUS = {
    "I2C": ("CLOCK", "DATA"),
    "SPI": ("CLOCK", "MOSI", "MISO"),
    "I2S": ("BIT_CLOCK", "WORD_CLOCK", "DATA"),
}

# Point-to-point links where the two ends take COMPLEMENTARY roles.
_COMPLEMENTARY = {
    "UART": (("TX", "RX"), ("RX", "TX")),
    "CAN": (("CAN_H", "CAN_H"), ("CAN_L", "CAN_L")),
    "USB": (("DP", "DP"), ("DM", "DM")),
}

# ---------------------------------------------------------------------------
# Classification derived from the tables above
# ---------------------------------------------------------------------------

RELATIONSHIP_SHARED_BUS = "shared_bus"
RELATIONSHIP_PEER = "peer"
RELATIONSHIP_HOST_DEVICE = "host_device"
RELATIONSHIP_NOT_A_BUS = "not_a_bus"
RELATIONSHIP_NOT_APPLICABLE = "not_applicable"

# host/device is not derivable from the net-building tables: USB appears in
# _COMPLEMENTARY because its WIRES are symmetric (DP-DP, DM-DM) even though the
# LINK is host/device. Listed explicitly so the wire-level and role-level facts
# do not get conflated.
_HOST_DEVICE = frozenset({"USB", "PCIe", "SDIO"})

# Peer interfaces must be listed explicitly rather than derived from
# _COMPLEMENTARY. Ethernet is the case that proves it: it has complementary
# roles (TXP/TXN/RXP/RXN) but never appears in _COMPLEMENTARY, because
# nodes.py's net builder has no point-to-point rule for it. Deriving "peer" from
# that table alone silently classified Ethernet as not_a_bus.
_PEER = frozenset({"UART", "CAN", "Ethernet"})

# Not a capability claim about a part. "Has Power" is true of every component in
# the catalogue, so requiring it discriminates nothing; the rest are quantities
# ("enough free pins"), which is a different check than interface_match makes.
_NOT_A_BUS = frozenset({"Power", "GPIO", "PWM", "ADC", "Analog", "Audio"})


def relationship_for(interface: str) -> str:
    """Classify one interface. Unknown interfaces are treated as not_a_bus.

    Order matters: _HOST_DEVICE is checked before _COMPLEMENTARY because USB is
    in both, and its host/device nature is the fact that governs part selection.
    """
    if interface in _WIRELESS:
        return RELATIONSHIP_NOT_APPLICABLE
    if interface in _HOST_DEVICE:
        return RELATIONSHIP_HOST_DEVICE
    if interface in _SHARED_BUS:
        return RELATIONSHIP_SHARED_BUS
    if interface in _PEER or interface in _COMPLEMENTARY:
        return RELATIONSHIP_PEER
    if interface in _NOT_A_BUS:
        return RELATIONSHIP_NOT_A_BUS
    return RELATIONSHIP_NOT_A_BUS


def is_scoreable(interface: str) -> bool:
    """Whether this interface should reach interface_match at all.

    False for wireless (no board-level requirement exists) and for Power (true
    of every part, so it discriminates nothing while occupying more than half of
    a typical requirement set).
    """
    return interface not in _WIRELESS and interface != "Power"


def build_requirement(interface: str) -> dict:
    """One structured interface requirement.

    THE THREE STATES of ``endpoint_role`` are load-bearing and must stay
    distinguishable downstream -- the same discipline as coverage's
    ``interface_confidence`` returning None for "not checked" rather than
    collapsing it into "absent":

      * key PRESENT and None  -> SETTLED. This interface has no controller
                                 concept at all (peer). Terminal; nothing will
                                 ever fill it in. Do not treat as missing data.
      * key ABSENT            -> NOT YET COMPUTED. The concept applies but
                                 controller inference is not implemented (that
                                 is the deferred phase). Read `relationship` to
                                 see which case you are in.
      * relationship ==
        "not_applicable"      -> the requirement is dropped before retrieval and
                                 never appears in a scored set at all.
    """
    relationship = relationship_for(interface)
    requirement = {"interface": interface, "relationship": relationship}

    if relationship == RELATIONSHIP_PEER:
        # Settled, not missing: a UART/CAN/Ethernet link has no master end.
        requirement["endpoint_role"] = None

    # shared_bus / host_device / not_a_bus: key deliberately OMITTED -- see above.
    return requirement
