import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * What a run produces, one card per workspace tab. The previews are drawn
 * inline (SVG and markup) rather than screenshots, so they follow the theme.
 */

function Card({ title, label, className = "", children }: { title: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`shadow-soft flex flex-col overflow-hidden rounded-[28px] border border-border bg-card ${className}`}>
      <div className="relative min-h-[180px] flex-1 border-b border-border bg-secondary/40 p-5">{children}</div>
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
      </div>
    </div>
  );
}

export function OutputsSection() {
  return (
    <section id="outputs" data-ribbon="outputs" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">What you get</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Not a chat transcript. <span className="text-soft">An engineering package.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every stage lands in its own tab, updates live as the agents work, and exports to files your fab and
            firmware team already use.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Card title="Structured requirements" label="Requirements" className="md:col-span-2">
            <div className="space-y-2 font-mono text-[12px] leading-relaxed">
              <p><span className="text-[var(--brand-2)]">power</span>: 2× AA, 18 months</p>
              <p><span className="text-[var(--brand-2)]">radio</span>: LoRa 868 MHz</p>
              <p><span className="text-[var(--brand-2)]">sensors</span>: temp, humidity, pressure</p>
              <p><span className="text-[var(--brand-2)]">enclosure</span>: IP65, 80×60 mm</p>
              <p className="text-muted-foreground">quantity: 250</p>
            </div>
          </Card>

          <Card title="Live architecture graph" label="Architecture" className="md:col-span-4">
            <svg viewBox="0 0 520 170" className="h-full w-full" role="img" aria-label="Block diagram: power, MCU, radio and sensors">
              <defs>
                {/* userSpaceOnUse: in the default bounding-box units, a perfectly
                    horizontal line has zero height and the stroke never paints. */}
                <linearGradient id="og" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="520" y2="0">
                  <stop offset="0" stopColor="var(--brand-1)" />
                  <stop offset="1" stopColor="var(--brand-2)" />
                </linearGradient>
              </defs>
              {["M120 85 H200", "M320 85 H400", "M260 55 V25 H400", "M260 115 V150 H120"].map((d) => (
                <path key={d} d={d} stroke="url(#og)" strokeWidth="2" fill="none" strokeDasharray="5 5" className="hw-edge-data" />
              ))}
              {[
                [20, 60, "Sensors"],
                [200, 55, "MCU"],
                [400, 60, "Radio"],
                [400, 5, "GPS"],
                [20, 130, "Power"],
              ].map(([x, y, t]) => (
                <g key={t as string}>
                  <rect x={x as number} y={y as number} width={t === "MCU" ? 120 : 100} height={t === "MCU" ? 60 : 40} rx="12" fill="var(--card)" stroke="var(--border)" />
                  <text x={(x as number) + (t === "MCU" ? 60 : 50)} y={(y as number) + (t === "MCU" ? 35 : 25)} textAnchor="middle" fontSize="13" fill="var(--foreground)" fontWeight="600">
                    {t}
                  </text>
                </g>
              ))}
            </svg>
          </Card>

          <Card title="Priced bill of materials" label="BOM" className="md:col-span-3">
            <table className="w-full text-left text-[12px]">
              <thead className="text-muted-foreground">
                <tr><th className="pb-2 font-medium">Ref</th><th className="pb-2 font-medium">Part</th><th className="pb-2 text-right font-medium">Stock</th></tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["U1", "STM32L072CZ", "In stock"],
                  ["U2", "SX1276IMLTRT", "In stock"],
                  ["U3", "BME280", "Low"],
                  ["J1", "USB4105-GF-A", "In stock"],
                ].map(([r, p, s]) => (
                  <tr key={r} className="border-t border-border">
                    <td className="py-1.5">{r}</td>
                    <td className="py-1.5">{p}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Routed PCB, schematic and 3D model" label="PCB" className="md:col-span-3">
            <svg viewBox="0 0 300 150" className="h-full w-full" role="img" aria-label="PCB layout preview">
              <rect x="10" y="10" width="280" height="130" rx="10" fill="#1f4f7a" />
              <g stroke="#e9b65c" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M120 75 H70 V40 H40" />
                <path d="M180 65 H230 V35 H260" />
                <path d="M180 85 H220 V115 H255" />
                <path d="M150 105 V125 H60" />
              </g>
              <rect x="120" y="45" width="60" height="60" rx="4" fill="#1d1f24" />
              <rect x="235" y="22" width="40" height="28" rx="3" fill="#c9ced6" />
              <rect x="22" y="28" width="22" height="26" rx="3" fill="#9aa3ad" />
              <circle cx="27" cy="125" r="5" fill="none" stroke="#e9b65c" strokeWidth="2" />
              <circle cx="273" cy="125" r="5" fill="none" stroke="#e9b65c" strokeWidth="2" />
            </svg>
          </Card>

          <Card title="Validation, errors labelled" label="Validation" className="md:col-span-2">
            <ul className="space-y-2.5 text-[13px]">
              {["Every net has a driver", "Power rails within budget", "Footprints resolved"].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#36b37e]" />{t}</li>
              ))}
              <li className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#f6b44b]" />2 clearance errors — not ready to fab</li>
            </ul>
          </Card>

          <Card title="Firmware stubs per bus" label="Code" className="md:col-span-4">
            <pre className="overflow-hidden font-mono text-[12px] leading-relaxed text-muted-foreground">
{`#include "pin_config.h"
#include "i2c_driver.h"

void app_main(void) {
    i2c_init(PIN_SDA, PIN_SCL, 400000);
    bme280_init(BME280_ADDR);
    lora_init(PIN_LORA_CS, 868E6);
    for (;;) { sample_and_send(); sleep_ms(SAMPLE_PERIOD_MS); }
}`}
            </pre>
          </Card>
        </div>
      </div>
    </section>
  );
}
